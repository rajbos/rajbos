#!/usr/bin/env python3
"""
GitHub Pull Request Analysis Script

This script analyzes pull requests from the last 3 months to:
1. Retrieve all pull requests from the past 3 months
2. Analyze collaborators on those pull requests
3. Calculate the number of pull requests for each week
4. Determine the percentage of pull requests each week that were co-created with GitHub Copilot
5. Output results in JSON format
"""

import os
import sys
import json
import csv
from datetime import datetime, timedelta
from collections import defaultdict
import requests
from typing import List, Dict, Any, Optional


class GitHubPRAnalyzer:
    def __init__(self, token: str, owner: str, repo: str):
        """Initialize the analyzer with GitHub credentials and repository info."""
        self.token = token
        self.owner = owner
        self.repo = repo
        self.headers = {
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github.v3+json'
        }
        self.base_url = 'https://api.github.com'
    
    def get_pull_requests(self, since_date: datetime) -> List[Dict[str, Any]]:
        """Fetch all pull requests from the repository since the given date."""
        prs = []
        page = 1
        per_page = 100
        
        while True:
            url = f'{self.base_url}/repos/{self.owner}/{self.repo}/pulls'
            params = {
                'state': 'all',
                'sort': 'updated',
                'direction': 'desc',
                'page': page,
                'per_page': per_page
            }
            
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            page_prs = response.json()
            if not page_prs:
                break
            
            # Filter PRs by date
            for pr in page_prs:
                created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))
                if created_at >= since_date:
                    prs.append(pr)
                else:
                    # Since we're sorting by updated date, we might have older PRs
                    # We should continue to check all PRs in this page
                    pass
            
            # If we got fewer than per_page results, we've reached the end
            if len(page_prs) < per_page:
                break
            
            page += 1
        
        # Final filter to ensure we only have PRs from the last 3 months
        filtered_prs = [pr for pr in prs if datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00')) >= since_date]
        return filtered_prs
    
    def get_pr_commits(self, pr_number: int) -> List[Dict[str, Any]]:
        """Get commits for a specific pull request."""
        url = f'{self.base_url}/repos/{self.owner}/{self.repo}/pulls/{pr_number}/commits'
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()
    
    def detect_copilot_collaboration(self, pr: Dict[str, Any]) -> bool:
        """
        Detect if a PR was created with GitHub Copilot collaboration.
        
        This function looks for various indicators of Copilot usage:
        1. PR title or body mentioning Copilot
        2. Co-authored-by tags in commits
        3. User being the Copilot bot
        4. Specific patterns in commit messages
        """
        # Check if the author is Copilot bot
        if pr['user']['login'] == 'Copilot':
            return True
        
        # Check PR title and body for Copilot mentions
        title = pr['title'].lower()
        body = (pr['body'] or '').lower()
        
        copilot_keywords = ['copilot', 'co-pilot', 'github copilot', 'ai-assisted', 'ai assisted']
        for keyword in copilot_keywords:
            if keyword in title or keyword in body:
                return True
        
        # Check assignees for Copilot
        if pr.get('assignees'):
            for assignee in pr['assignees']:
                if assignee['login'] == 'Copilot':
                    return True
        
        # Check commits for co-authored patterns (this would require additional API calls)
        try:
            commits = self.get_pr_commits(pr['number'])
            for commit in commits:
                commit_message = commit['commit']['message'].lower()
                if any(keyword in commit_message for keyword in copilot_keywords):
                    return True
                
                # Check for co-authored-by patterns
                if 'co-authored-by:' in commit_message and 'copilot' in commit_message:
                    return True
        except Exception as e:
            print(f"Warning: Could not fetch commits for PR #{pr['number']}: {e}")
        
        return False
    
    def get_week_key(self, date: datetime) -> str:
        """Get a week identifier for grouping (YYYY-WW format)."""
        year, week, _ = date.isocalendar()
        return f"{year}-W{week:02d}"
    
    def analyze_pull_requests(self) -> Dict[str, Any]:
        """Analyze pull requests from the last 3 months."""
        # Calculate date 3 months ago (timezone-aware)
        from datetime import timezone
        three_months_ago = datetime.now(timezone.utc) - timedelta(days=90)
        
        print(f"Fetching pull requests since {three_months_ago.date()}...")
        prs = self.get_pull_requests(three_months_ago)
        print(f"Found {len(prs)} pull requests in the last 3 months")
        
        # Group PRs by week and analyze
        weekly_data = defaultdict(lambda: {
            'total_prs': 0,
            'copilot_prs': 0,
            'collaborators': set(),
            'pr_details': []
        })
        
        for pr in prs:
            created_at = datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00'))
            week_key = self.get_week_key(created_at)
            
            is_copilot_assisted = self.detect_copilot_collaboration(pr)
            
            weekly_data[week_key]['total_prs'] += 1
            if is_copilot_assisted:
                weekly_data[week_key]['copilot_prs'] += 1
            
            # Add collaborators
            weekly_data[week_key]['collaborators'].add(pr['user']['login'])
            if pr.get('assignees'):
                for assignee in pr['assignees']:
                    weekly_data[week_key]['collaborators'].add(assignee['login'])
            
            # Store PR details
            weekly_data[week_key]['pr_details'].append({
                'number': pr['number'],
                'title': pr['title'],
                'author': pr['user']['login'],
                'created_at': pr['created_at'],
                'copilot_assisted': is_copilot_assisted,
                'url': pr['html_url']
            })
        
        # Convert to final format
        results = {
            'analysis_date': datetime.now(timezone.utc).isoformat(),
            'period_start': three_months_ago.isoformat(),
            'period_end': datetime.now(timezone.utc).isoformat(),
            'total_prs': len(prs),
            'total_copilot_prs': sum(week['copilot_prs'] for week in weekly_data.values()),
            'weekly_analysis': {}
        }
        
        for week_key, data in weekly_data.items():
            copilot_percentage = (data['copilot_prs'] / data['total_prs'] * 100) if data['total_prs'] > 0 else 0
            
            results['weekly_analysis'][week_key] = {
                'total_prs': data['total_prs'],
                'copilot_assisted_prs': data['copilot_prs'],
                'copilot_percentage': round(copilot_percentage, 2),
                'unique_collaborators': len(data['collaborators']),
                'collaborators': list(data['collaborators']),
                'pull_requests': data['pr_details']
            }
        
        return results
    
    def save_results(self, results: Dict[str, Any], output_format: str = 'json') -> str:
        """Save results to file in specified format."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        if output_format.lower() == 'json':
            filename = f'pr_analysis_{timestamp}.json'
            with open(filename, 'w') as f:
                json.dump(results, f, indent=2, default=str)
        
        elif output_format.lower() == 'csv':
            filename = f'pr_analysis_{timestamp}.csv'
            with open(filename, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([
                    'Week', 'Total PRs', 'Copilot Assisted PRs', 
                    'Copilot Percentage', 'Unique Collaborators', 'Collaborators'
                ])
                
                for week, data in results['weekly_analysis'].items():
                    writer.writerow([
                        week,
                        data['total_prs'],
                        data['copilot_assisted_prs'],
                        data['copilot_percentage'],
                        data['unique_collaborators'],
                        ', '.join(data['collaborators'])
                    ])
        
        else:
            raise ValueError(f"Unsupported output format: {output_format}")
        
        return filename


def main():
    """Main function to run the PR analysis."""
    # Get environment variables
    github_token = os.getenv('GITHUB_TOKEN')
    owner = os.getenv('GITHUB_REPOSITORY_OWNER', 'rajbos')
    repo = os.getenv('GITHUB_REPOSITORY_NAME', 'rajbos')
    output_format = os.getenv('OUTPUT_FORMAT', 'json')
    
    if not github_token:
        print("Error: GITHUB_TOKEN environment variable is required")
        sys.exit(1)
    
    # If running in GitHub Actions, extract owner/repo from GITHUB_REPOSITORY
    if 'GITHUB_REPOSITORY' in os.environ:
        full_repo = os.environ['GITHUB_REPOSITORY']
        owner, repo = full_repo.split('/')
    
    print(f"Analyzing repository: {owner}/{repo}")
    
    try:
        analyzer = GitHubPRAnalyzer(github_token, owner, repo)
        results = analyzer.analyze_pull_requests()
        
        # Save results
        filename = analyzer.save_results(results, output_format)
        print(f"Analysis complete! Results saved to: {filename}")
        
        # Print summary
        print("\n=== SUMMARY ===")
        print(f"Total PRs analyzed: {results['total_prs']}")
        print(f"Copilot-assisted PRs: {results['total_copilot_prs']}")
        if results['total_prs'] > 0:
            overall_percentage = results['total_copilot_prs'] / results['total_prs'] * 100
            print(f"Overall Copilot percentage: {overall_percentage:.2f}%")
        
        print("\n=== WEEKLY BREAKDOWN ===")
        for week, data in sorted(results['weekly_analysis'].items()):
            print(f"{week}: {data['total_prs']} PRs, {data['copilot_assisted_prs']} Copilot-assisted ({data['copilot_percentage']}%)")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()