# PR Analysis Documentation

## Overview

This repository includes a GitHub Actions workflow and Python script to analyze pull requests from the last 3 months, with a focus on GitHub Copilot collaboration detection.

## Files

- `scripts/pr_analysis.py` - Main Python script for analyzing PRs
- `.github/workflows/pr-analysis.yml` - GitHub Actions workflow
- `requirements.txt` - Python dependencies

## Features

### PR Analysis Script (`scripts/pr_analysis.py`)

The script analyzes pull requests and provides:

1. **Pull Request Retrieval**: Fetches all PRs from the past 3 months using GitHub's REST API
2. **Collaborator Analysis**: Identifies all collaborators on PRs
3. **Weekly Grouping**: Calculates PR counts for each week
4. **Copilot Detection**: Determines which PRs were co-created with GitHub Copilot
5. **Output Formats**: Results in JSON or CSV format

#### Copilot Detection Methods

The script detects GitHub Copilot collaboration through:

- **Author Detection**: PRs created by the Copilot bot user
- **Keyword Analysis**: PR titles/descriptions mentioning "copilot", "co-pilot", "github copilot", "ai-assisted"
- **Assignee Analysis**: PRs with Copilot as an assignee
- **Commit Analysis**: Commit messages mentioning Copilot or containing co-authored-by patterns

#### Usage

```bash
# Set environment variables
export GITHUB_TOKEN="your_github_token"
export GITHUB_REPOSITORY_OWNER="owner"
export GITHUB_REPOSITORY_NAME="repo"
export OUTPUT_FORMAT="json"  # or "csv"

# Run the script
python scripts/pr_analysis.py
```

### GitHub Actions Workflow (`.github/workflows/pr-analysis.yml`)

The workflow:

- **Schedule**: Runs every Monday at 9:00 AM UTC
- **Manual Trigger**: Can be triggered manually with optional output format selection
- **Permissions**: Read access to repository contents and pull requests
- **Artifacts**: Uploads analysis results with 30-day retention

#### Workflow Features

- Automatic Python environment setup
- Dependency installation from `requirements.txt`
- Artifact upload for both JSON and CSV formats
- Environment variable configuration

## Output Format

### JSON Output Structure

```json
{
  "analysis_date": "2025-06-05T21:30:00Z",
  "period_start": "2025-03-07T21:30:00Z",
  "period_end": "2025-06-05T21:30:00Z",
  "total_prs": 1,
  "total_copilot_prs": 1,
  "weekly_analysis": {
    "2025-W23": {
      "total_prs": 1,
      "copilot_assisted_prs": 1,
      "copilot_percentage": 100.0,
      "unique_collaborators": 2,
      "collaborators": ["Copilot", "rajbos"],
      "pull_requests": [
        {
          "number": 3,
          "title": "[WIP] GitHub Actions Workflow for PR Analysis",
          "author": "Copilot",
          "created_at": "2025-06-05T21:18:38Z",
          "copilot_assisted": true,
          "url": "https://github.com/rajbos/rajbos/pull/3"
        }
      ]
    }
  }
}
```

### CSV Output Structure

```csv
Week,Total PRs,Copilot Assisted PRs,Copilot Percentage,Unique Collaborators,Collaborators
2025-W23,1,1,100.0,2,"Copilot, rajbos"
```

## Security

- Uses `secrets.GITHUB_TOKEN` for authentication
- Minimal required permissions (contents:read, pull-requests:read)
- No sensitive data in outputs
- 30-day artifact retention limit

## Customization

The script can be customized by modifying:

- **Time Period**: Change the 90-day lookback period
- **Detection Keywords**: Add/modify Copilot detection keywords
- **Output Format**: Extend JSON/CSV structures
- **Schedule**: Modify workflow cron expression