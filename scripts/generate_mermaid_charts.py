#!/usr/bin/env python3
"""
Mermaid Chart Generator for PR Analysis Results

This script reads the JSON output from pr_analysis.py and generates
mermaid charts to display in GitHub step summary.
"""

import os
import sys
import json
import glob
from datetime import datetime
from typing import Dict, Any, List, Tuple


def is_running_in_ci() -> bool:
    """Check if the script is running in a CI environment (GitHub Actions)."""
    return os.getenv('GITHUB_ACTIONS', '').lower() == 'true' or os.getenv('CI', '').lower() == 'true'


def mask_private_info_for_display(value: str) -> str:
    """Mask sensitive information for display when running in CI."""
    if is_running_in_ci():
        if value and value not in ['all_repositories', 'N/A', 'unknown']:
            # Check if this looks like it could be private info
            if '<private-repo>' in value or value.startswith('<private'):
                return value  # Already masked
            # For analyzed_user, we keep it but could mask if needed
            return value
    return value


def find_latest_analysis_file() -> str:
    """Find the latest analysis JSON file."""
    json_files = glob.glob("pr_analysis_*.json")
    if not json_files:
        raise FileNotFoundError("No analysis JSON files found")
    
    # Sort by filename (which includes timestamp)
    json_files.sort(reverse=True)
    return json_files[0]


def parse_week_key(week_key: str) -> Tuple[int, int]:
    """Parse week key format YYYY-WXX into year and week number."""
    year_str, week_str = week_key.split('-W')
    return int(year_str), int(week_str)


def format_week_for_display(week_key: str) -> str:
    """Convert week key from YYYY-WXX format to YY/XX for display."""
    year_str, week_str = week_key.split('-W')
    short_year = year_str[-2:]  # Get last 2 digits of year
    return f"{short_year}/{week_str}"


def generate_trend_chart(weekly_data: Dict[str, Any]) -> str:
    """Generate mermaid line chart showing PR trends over time."""
    if not weekly_data:
        return "No data available for trend chart"
    
    # Sort weeks chronologically
    sorted_weeks = sorted(weekly_data.keys(), key=parse_week_key)
    
    # Generate chart data
    chart_lines = []
    chart_lines.append("```mermaid")
    chart_lines.append("xychart-beta")
    chart_lines.append('    title "Pull Request Trends Over Time"')
    chart_lines.append('    x-axis [' + ', '.join(f'"{format_week_for_display(week)}"' for week in sorted_weeks) + ']')
    chart_lines.append('    y-axis "Number of PRs" 0 --> ' + str(max(data['total_prs'] for data in weekly_data.values()) + 5))
    
    # Total PRs line
    total_prs = [str(weekly_data[week]['total_prs']) for week in sorted_weeks]
    chart_lines.append('    line "Total Pull Requests" [' + ', '.join(total_prs) + ']')
    
    # Copilot PRs line
    copilot_prs = [str(weekly_data[week]['copilot_assisted_prs']) for week in sorted_weeks]
    chart_lines.append('    line "GitHub Copilot Assisted" [' + ', '.join(copilot_prs) + ']')
    
    # Dependabot PRs line
    dependabot_prs = [str(weekly_data[week].get('dependabot_prs', 0)) for week in sorted_weeks]
    chart_lines.append('    line "Dependabot Automated" [' + ', '.join(dependabot_prs) + ']')
    
    chart_lines.append("```")
    
    # Add legend explanation
    legend_explanation = [
        "",
        "**Legend:**",
        "- 📈 **Total Pull Requests**: All PRs created during each week",
        "- 🤖 **GitHub Copilot Assisted**: PRs that included AI-generated code contributions",
        "- ⚙️ **Dependabot Automated**: PRs automatically created by Dependabot for dependency updates"
    ]
    
    return '\n'.join(chart_lines + legend_explanation)


def generate_percentage_chart(weekly_data: Dict[str, Any]) -> str:
    """Generate mermaid line chart showing Copilot percentage trends."""
    if not weekly_data:
        return "No data available for percentage chart"
    
    # Sort weeks chronologically
    sorted_weeks = sorted(weekly_data.keys(), key=parse_week_key)
    
    # Generate chart data
    chart_lines = []
    chart_lines.append("```mermaid")
    chart_lines.append("xychart-beta")
    chart_lines.append('    title "GitHub Copilot Usage Percentage Over Time"')
    chart_lines.append('    x-axis [' + ', '.join(f'"{format_week_for_display(week)}"' for week in sorted_weeks) + ']')
    chart_lines.append('    y-axis "Percentage (%)" 0 --> 100')
    
    # Copilot percentage line
    copilot_percentages = [str(weekly_data[week]['copilot_percentage']) for week in sorted_weeks]
    chart_lines.append('    line "Copilot Adoption Rate" [' + ', '.join(copilot_percentages) + ']')
    
    chart_lines.append("```")
    
    # Add legend explanation
    legend_explanation = [
        "",
        "**Legend:**",
        "- 🤖 **Copilot Adoption Rate**: Percentage of total PRs that used GitHub Copilot assistance"
    ]
    
    return '\n'.join(chart_lines + legend_explanation)


def generate_repository_breakdown_chart(weekly_data: Dict[str, Any]) -> str:
    """Generate a bar chart showing repository activity breakdown."""
    if not weekly_data:
        return "No data available for repository breakdown"
    
    # Collect all repositories and their PR counts
    repo_counts = {}
    for week_data in weekly_data.values():
        for pr in week_data.get('pull_requests', []):
            repo = pr.get('repository', 'unknown')
            # Skip private repositories in CI to protect privacy
            if is_running_in_ci() and '<private-repo>' in repo:
                continue
            repo_counts[repo] = repo_counts.get(repo, 0) + 1
    
    if not repo_counts:
        if is_running_in_ci():
            return "Repository breakdown hidden for privacy (running in CI)"
        return "No repository data available"
    
    # Sort repositories by PR count
    sorted_repos = sorted(repo_counts.items(), key=lambda x: x[1], reverse=True)
    
    # Take top 10 repositories
    top_repos = sorted_repos[:10]
    
    chart_lines = []
    chart_lines.append("```mermaid")
    chart_lines.append("xychart-beta")
    chart_lines.append('    title "Top Repositories by PR Count (Last 3 Months)"')
    chart_lines.append('    x-axis [' + ', '.join(f'"{repo}"' for repo, _ in top_repos) + ']')
    chart_lines.append('    y-axis "Number of PRs" 0 --> ' + str(max(count for _, count in top_repos) + 5))
    
    counts = [str(count) for _, count in top_repos]
    chart_lines.append('    bar [' + ', '.join(counts) + ']')
    
    chart_lines.append("```")
    
    # Add legend explanation
    legend_explanation = [
        "",
        "**Legend:**",
        "- **Bar Height**: Total number of pull requests created in each repository during the analysis period",
        "- **X-Axis Labels**: Repository names ranked by PR activity (most active first)",
        f"- **Data Period**: Last 3 months (showing top {len(top_repos)} most active repositories)"
    ]
    
    return '\n'.join(chart_lines + legend_explanation)


def generate_trend_data_table(weekly_data: Dict[str, Any]) -> str:
    """Generate markdown table showing PR trends data."""
    if not weekly_data:
        return "No data available for trend table"
    
    # Sort weeks chronologically
    sorted_weeks = sorted(weekly_data.keys(), key=parse_week_key)
    
    lines = []
    lines.append("| Week | Total PRs | Copilot-Assisted PRs | Dependabot PRs |")
    lines.append("|------|-----------|---------------------|----------------|")
    
    for week in sorted_weeks:
        data = weekly_data[week]
        total_prs = data['total_prs']
        copilot_prs = data['copilot_assisted_prs']
        dependabot_prs = data.get('dependabot_prs', 0)
        lines.append(f"| {week} | {total_prs} | {copilot_prs} | {dependabot_prs} |")
    
    return '\n'.join(lines)


def generate_percentage_data_table(weekly_data: Dict[str, Any]) -> str:
    """Generate markdown table showing percentage trends data."""
    if not weekly_data:
        return "No data available for percentage table"
    
    # Sort weeks chronologically
    sorted_weeks = sorted(weekly_data.keys(), key=parse_week_key)
    
    lines = []
    lines.append("| Week | Total PRs | Copilot Usage % |")
    lines.append("|------|-----------|-----------------|")
    
    for week in sorted_weeks:
        data = weekly_data[week]
        total_prs = data['total_prs']
        copilot_pct = data['copilot_percentage']
        lines.append(f"| {week} | {total_prs} | {copilot_pct}% |")
    
    return '\n'.join(lines)


def generate_repository_data_table(weekly_data: Dict[str, Any], analyzed_user: str = "unknown") -> str:
    """Generate markdown table showing repository activity data."""
    if not weekly_data:
        return "No data available for repository table"
    
    # Collect all repositories and their PR counts
    repo_counts = {}
    for week_data in weekly_data.values():
        for pr in week_data.get('pull_requests', []):
            repo = pr.get('repository', 'unknown')
            # Skip private repositories in CI to protect privacy
            if is_running_in_ci() and '<private-repo>' in repo:
                continue
            repo_counts[repo] = repo_counts.get(repo, 0) + 1
    
    if not repo_counts:
        if is_running_in_ci():
            return "Repository data hidden for privacy (running in CI)"
        return "No repository data available"
    
    # Sort repositories by PR count
    sorted_repos = sorted(repo_counts.items(), key=lambda x: x[1], reverse=True)
    
    # Take top 10 repositories
    top_repos = sorted_repos[:10]
    
    lines = []
    lines.append("| Owner | Repository | PR Count |")
    lines.append("|-------|------------|----------|")
    
    for repo, count in top_repos:
        # Parse repository name to extract owner and repo
        if '/' in repo:
            # Format: "owner/repo"
            owner, repo_name = repo.split('/', 1)
        else:
            # Format: "repo" (user's own repository)
            owner = analyzed_user
            repo_name = repo
        
        lines.append(f"| {owner} | {repo_name} | {count} |")
    
    return '\n'.join(lines)


def generate_summary_stats(results: Dict[str, Any]) -> str:
    """Generate summary statistics in markdown format."""
    lines = []
    lines.append("## 📊 Analysis Summary")
    lines.append("")
    lines.append(f"**Analysis Period:** {results.get('period_start', 'N/A')[:10]} to {results.get('period_end', 'N/A')[:10]}")
    lines.append(f"**Analyzed User:** {results.get('analyzed_user', 'N/A')}")
    lines.append(f"**Scope:** {results.get('analyzed_repository', 'N/A')}")
    lines.append("")
    lines.append(f"- **Total PRs:** {results.get('total_prs', 0)}")
    lines.append(f"- **Copilot-Assisted PRs:** {results.get('total_copilot_prs', 0)}")
    lines.append(f"- **Dependabot PRs:** {results.get('total_dependabot_prs', 0)}")
    
    if results.get('total_prs', 0) > 0:
        # Calculate copilot percentage excluding dependabot PRs from denominator
        total_non_dependabot_prs = results.get('total_prs', 0) - results.get('total_dependabot_prs', 0)
        if total_non_dependabot_prs > 0:
            overall_copilot_percentage = (results.get('total_copilot_prs', 0) / total_non_dependabot_prs) * 100
            lines.append(f"- **Total PRs - Dependabot PRs:** {results.get('total_prs', 0)} - {results.get('total_dependabot_prs', 0)} = {total_non_dependabot_prs}")
            lines.append(f"- **Overall Copilot Usage on PRs (excluding Dependabot):** {overall_copilot_percentage:.1f}%")
        else:
            lines.append(f"- **Total PRs - Dependabot PRs:** {results.get('total_prs', 0)} - {results.get('total_dependabot_prs', 0)} = 0")
            lines.append(f"- **Overall Copilot Usage on PRs (excluding Dependabot):** 0% (no non-Dependabot PRs)")
        # Keep dependabot percentage calculated against total PRs
        overall_dependabot_percentage = (results.get('total_dependabot_prs', 0) / results.get('total_prs', 1)) * 100
        lines.append(f"- **Dependabot Usage compared to total PRs:** {overall_dependabot_percentage:.1f}%")
    else:
        lines.append("- **Overall Copilot Usage on PRs (excluding Dependabot):** 0%")
        lines.append("- **Dependabot Usage compared to total PRs:** 0%")
    
    return '\n'.join(lines)


def write_to_step_summary(content: str) -> None:
    """Write content to GitHub step summary."""
    step_summary_file = os.getenv('GITHUB_STEP_SUMMARY')
    if step_summary_file:
        with open(step_summary_file, 'a') as f:
            f.write(content)
            f.write('\n\n')
    else:
        print("GITHUB_STEP_SUMMARY not set, printing to stdout:")
        print(content)


def main():
    """Main function to generate and display mermaid charts."""
    try:
        # Find and load the latest analysis file
        analysis_file = find_latest_analysis_file()
        print(f"Reading analysis from: {analysis_file}")
        
        with open(analysis_file, 'r') as f:
            results = json.load(f)
        
        weekly_data = results.get('weekly_analysis', {})
        
        # Generate summary stats
        summary = generate_summary_stats(results)
        write_to_step_summary(summary)
        
        # Generate trend chart
        trend_chart = generate_trend_chart(weekly_data)
        write_to_step_summary("## 📈 Pull Request Trends")
        write_to_step_summary("*This chart shows the weekly trend of pull requests categorized by type (total, Copilot-assisted, and Dependabot-automated).*")
        write_to_step_summary(trend_chart)
        
        # Generate trend data table
        trend_table = generate_trend_data_table(weekly_data)
        write_to_step_summary("<details>")
        write_to_step_summary("<summary>📊 Pull Request Trends Data</summary>")
        write_to_step_summary("")
        write_to_step_summary(trend_table)
        write_to_step_summary("")
        write_to_step_summary("</details>")
        
        # Generate percentage chart
        percentage_chart = generate_percentage_chart(weekly_data)
        write_to_step_summary("## 🤖 GitHub Copilot Usage Trends")
        write_to_step_summary("*This chart displays the adoption rate as percentage of total PRs over time.*")
        write_to_step_summary(percentage_chart)
        
        # Generate percentage data table
        percentage_table = generate_percentage_data_table(weekly_data)
        write_to_step_summary("<details>")
        write_to_step_summary("<summary>📊 Copilot Usage Percentage Data</summary>")
        write_to_step_summary("")
        write_to_step_summary(percentage_table)
        write_to_step_summary("")
        write_to_step_summary("</details>")
        
        # Generate repository breakdown chart (only if analyzing all repos)
        analyzed_repo = results.get('analyzed_repository', '')
        if 'all_repositories' in analyzed_repo:
            repo_chart = generate_repository_breakdown_chart(weekly_data)
            write_to_step_summary("## 📚 Repository Activity Breakdown")
            write_to_step_summary("*This chart ranks repositories by their pull request activity during the analysis period.*")
            write_to_step_summary(repo_chart)
            
            # Generate repository data table
            analyzed_user = results.get('analyzed_user', 'unknown')
            repo_table = generate_repository_data_table(weekly_data, analyzed_user)
            write_to_step_summary("<details>")
            write_to_step_summary("<summary>📊 Repository Activity Data</summary>")
            write_to_step_summary("")
            write_to_step_summary(repo_table)
            write_to_step_summary("")
            write_to_step_summary("</details>")
        
        print("Mermaid charts generated successfully!")
        
    except Exception as e:
        error_msg = f"Error generating mermaid charts: {e}"
        print(error_msg)
        write_to_step_summary(f"## ❌ Chart Generation Error\n\n{error_msg}")
        sys.exit(1)


if __name__ == '__main__':
    main()