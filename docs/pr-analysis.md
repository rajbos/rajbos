# PR Analysis Documentation

## Overview

This repository includes a GitHub Actions workflow and Python scripts to analyze pull requests from the last 3 months across all user repositories, with a focus on GitHub Copilot collaboration detection and visualization.

## Files

- `scripts/pr_analysis.py` - Main Python script for analyzing PRs
- `scripts/generate_mermaid_charts.py` - Script for generating mermaid charts
- `.github/workflows/pr-analysis.yml` - GitHub Actions workflow
- `requirements.txt` - Python dependencies

## Features

### PR Analysis Script (`scripts/pr_analysis.py`)

The script analyzes pull requests and provides:

1. **Multi-Repository Analysis**: Analyzes PRs across all user repositories (not just current repo)
2. **Pull Request Retrieval**: Fetches all PRs from the past 3 months using GitHub's REST API
3. **Collaborator Analysis**: Identifies all collaborators on PRs
4. **Weekly Grouping**: Calculates PR counts for each week
5. **Copilot Detection**: Determines which PRs were co-created with GitHub Copilot
6. **Dependabot Detection**: Identifies PRs created by Dependabot for dependency updates
7. **Output Formats**: Results in JSON or CSV format

#### Multi-Repository Support

By default, the script now analyzes **all repositories** for the authenticated user, providing a comprehensive view of development activity and Copilot usage across the entire GitHub profile.

#### Copilot Detection Methods

The script detects GitHub Copilot collaboration through:

- **Author Detection**: PRs created by the Copilot bot user
- **Keyword Analysis**: PR titles/descriptions mentioning "copilot", "co-pilot", "github copilot", "ai-assisted"
- **Assignee Analysis**: PRs with Copilot as an assignee
- **Commit Analysis**: Commit messages mentioning Copilot or containing co-authored-by patterns

#### Dependabot Detection Methods

The script detects Dependabot PRs through:

- **Author Detection**: PRs created by dependabot or dependabot[bot] users
- **Title Pattern Analysis**: PR titles with patterns like "bump", "update", "build(deps)", typical of dependency updates

#### Usage

```bash
# Set environment variables
export GITHUB_TOKEN="your_github_pat"  # Personal Access Token required
export GITHUB_REPOSITORY_OWNER="username"
export OUTPUT_FORMAT="json"  # or "csv"
export ANALYZE_ALL_REPOS="true"  # analyze all user repos (default)

# Run the script
python scripts/pr_analysis.py
```

### Mermaid Chart Generator (`scripts/generate_mermaid_charts.py`)

This script reads the JSON analysis results and generates interactive mermaid charts:

1. **PR Trends Chart**: Shows total PRs, Copilot-assisted PRs, and Dependabot PRs over time
2. **Copilot & Dependabot Usage Percentage Chart**: Displays the percentage trends for both Copilot and Dependabot usage
3. **Repository Activity Breakdown**: Shows top repositories by PR activity (when analyzing all repos)

The charts are automatically displayed in the GitHub Actions step summary for easy visualization.

### GitHub Actions Workflow (`.github/workflows/pr-analysis.yml`)

The workflow:

- **Schedule**: Runs every Monday at 9:00 AM UTC
- **Manual Trigger**: Can be triggered manually with optional output format selection
- **Authentication**: Uses Personal Access Token (`secrets.GITHUB_PAT`) for full access
- **Artifacts**: Uploads analysis results with 30-day retention
- **Visualization**: Generates and displays mermaid charts in step summary

#### Workflow Features

- Automatic Python environment setup
- Dependency installation from `requirements.txt`
- Multi-repository PR analysis
- Mermaid chart generation and display
- Artifact upload for both JSON and CSV formats

## Output Format

### JSON Output Structure

```json
{
  "analysis_date": "2025-01-06T21:30:00Z",
  "period_start": "2024-10-06T21:30:00Z",
  "period_end": "2025-01-06T21:30:00Z",
  "analyzed_user": "rajbos",
  "analyzed_repository": "all_repositories",
  "total_prs": 15,
  "total_copilot_prs": 8,
  "total_dependabot_prs": 4,
  "weekly_analysis": {
    "2024-W41": {
      "total_prs": 3,
      "copilot_assisted_prs": 1,
      "copilot_percentage": 33.33,
      "dependabot_prs": 1,
      "dependabot_percentage": 33.33,
      "unique_collaborators": 2,
      "collaborators": ["rajbos", "dependabot"],
      "repositories": ["repo1", "repo2"],
      "pull_requests": [
        {
          "number": 1,
          "title": "Test PR",
          "author": "rajbos",
          "repository": "repo1",
          "created_at": "2024-10-08T10:00:00Z",
          "copilot_assisted": false,
          "dependabot_pr": false,
          "url": "https://github.com/rajbos/repo1/pull/1"
        }
      ]
    }
  }
}
```

### CSV Output Structure

```csv
Week,Total PRs,Copilot Assisted PRs,Copilot Percentage,Dependabot PRs,Dependabot Percentage,Unique Collaborators,Collaborators
2024-W41,3,1,33.33,1,33.33,2,"rajbos, dependabot"
```

## Security

- **Authentication**: Uses Personal Access Token (`secrets.GITHUB_PAT`) for comprehensive repository access
- **Permissions**: Read access to all user repositories and pull requests
- **Privacy**: Private repository information is automatically masked in CI environments to protect sensitive data
  - In GitHub Actions: Private repository names are replaced with `<private-repo>` in logs and outputs
  - In local/Codespace environments: Full repository information is shown for debugging purposes
- **Retention**: 30-day artifact retention limit

## Setup Requirements

### Personal Access Token

To analyze all repositories, you need to create a Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Create a new token with the following scopes:
   - `repo` (Full control of private repositories)
   - `public_repo` (Access public repositories)
   - `read:user` (Read user profile data)
3. Add the token as `GITHUB_PAT` in your repository secrets

### Repository Secret

Add your Personal Access Token as a repository secret:
1. Go to your repository Settings → Secrets and variables → Actions
2. Create a new secret named `GITHUB_PAT`
3. Set the value to your Personal Access Token

## Visualization Examples

The workflow automatically generates charts in the step summary:

- **📈 Pull Request Trends**: Line chart showing total PRs, Copilot-assisted PRs, and Dependabot PRs over time
- **🤖 GitHub Copilot & Dependabot Usage Trends**: Percentage chart showing both Copilot and Dependabot adoption patterns
- **📚 Repository Activity Breakdown**: Bar chart of most active repositories

## Customization

The script can be customized by modifying:

- **Time Period**: Change the 90-day lookback period in `analyze_pull_requests()`
- **Detection Keywords**: Add/modify Copilot detection keywords in `detect_copilot_collaboration()` or Dependabot patterns in `detect_dependabot_pr()`
- **Output Format**: Extend JSON/CSV structures in `save_results()`
- **Chart Types**: Modify mermaid chart generation in `generate_mermaid_charts.py`
- **Schedule**: Modify workflow cron expression