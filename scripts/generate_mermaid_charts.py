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
    chart_lines.append('    x-axis [' + ', '.join(f'"{week}"' for week in sorted_weeks) + ']')
    chart_lines.append('    y-axis "Number of PRs" 0 --> ' + str(max(data['total_prs'] for data in weekly_data.values()) + 5))
    
    # Total PRs line
    total_prs = [str(weekly_data[week]['total_prs']) for week in sorted_weeks]
    chart_lines.append('    line "Total PRs" [' + ', '.join(total_prs) + ']')
    
    # Copilot PRs line
    copilot_prs = [str(weekly_data[week]['copilot_assisted_prs']) for week in sorted_weeks]
    chart_lines.append('    line "Copilot-Assisted PRs" [' + ', '.join(copilot_prs) + ']')
    
    # Dependabot PRs line
    dependabot_prs = [str(weekly_data[week].get('dependabot_prs', 0)) for week in sorted_weeks]
    chart_lines.append('    line "Dependabot PRs" [' + ', '.join(dependabot_prs) + ']')
    
    chart_lines.append("```")
    return '\n'.join(chart_lines)


def generate_percentage_chart(weekly_data: Dict[str, Any]) -> str:
    """Generate mermaid line chart showing Copilot and Dependabot percentage trends."""
    if not weekly_data:
        return "No data available for percentage chart"
    
    # Sort weeks chronologically
    sorted_weeks = sorted(weekly_data.keys(), key=parse_week_key)
    
    # Generate chart data
    chart_lines = []
    chart_lines.append("```mermaid")
    chart_lines.append("xychart-beta")
    chart_lines.append('    title "GitHub Copilot & Dependabot Usage Percentage Over Time"')
    chart_lines.append('    x-axis [' + ', '.join(f'"{week}"' for week in sorted_weeks) + ']')
    chart_lines.append('    y-axis "Percentage (%)" 0 --> 100')
    
    # Copilot percentage line
    copilot_percentages = [str(weekly_data[week]['copilot_percentage']) for week in sorted_weeks]
    chart_lines.append('    line "Copilot Usage %" [' + ', '.join(copilot_percentages) + ']')
    
    # Dependabot percentage line
    dependabot_percentages = [str(weekly_data[week].get('dependabot_percentage', 0)) for week in sorted_weeks]
    chart_lines.append('    line "Dependabot Usage %" [' + ', '.join(dependabot_percentages) + ']')
    
    chart_lines.append("```")
    return '\n'.join(chart_lines)


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
    return '\n'.join(chart_lines)


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
        overall_copilot_percentage = (results.get('total_copilot_prs', 0) / results.get('total_prs', 1)) * 100
        overall_dependabot_percentage = (results.get('total_dependabot_prs', 0) / results.get('total_prs', 1)) * 100
        lines.append(f"- **Overall Copilot Usage:** {overall_copilot_percentage:.1f}%")
        lines.append(f"- **Overall Dependabot Usage:** {overall_dependabot_percentage:.1f}%")
    else:
        lines.append("- **Overall Copilot Usage:** 0%")
        lines.append("- **Overall Dependabot Usage:** 0%")
    
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
        write_to_step_summary(trend_chart)
        
        # Generate percentage chart
        percentage_chart = generate_percentage_chart(weekly_data)
        write_to_step_summary("## 🤖 GitHub Copilot & Dependabot Usage Trends")
        write_to_step_summary(percentage_chart)
        
        # Generate repository breakdown chart (only if analyzing all repos)
        if results.get('analyzed_repository') == 'all_repositories':
            repo_chart = generate_repository_breakdown_chart(weekly_data)
            write_to_step_summary("## 📚 Repository Activity Breakdown")
            write_to_step_summary(repo_chart)
        
        print("Mermaid charts generated successfully!")
        
    except Exception as e:
        error_msg = f"Error generating mermaid charts: {e}"
        print(error_msg)
        write_to_step_summary(f"## ❌ Chart Generation Error\n\n{error_msg}")
        sys.exit(1)


if __name__ == '__main__':
    main()