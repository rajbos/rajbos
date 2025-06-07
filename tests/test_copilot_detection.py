#!/usr/bin/env python3
"""
Test for Copilot detection functionality, specifically for PR #143 from mcp-research/mcp-security-scans
that should be detected as having Copilot collaboration.
"""

import unittest
from unittest.mock import Mock, patch
import sys
import os

# Add the scripts directory to Python path so we can import the PR analyzer
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))

from pr_analysis import GitHubPRAnalyzer


class TestCopilotDetection(unittest.TestCase):
    """Test cases for Copilot collaboration detection."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Create analyzer with test credentials
        self.analyzer = GitHubPRAnalyzer(token='test_token', owner='test_owner', repo='test_repo')
            
    def test_pr_143_copilot_detection(self):
        """
        Test detection of Copilot collaboration on PR #143 from mcp-research/mcp-security-scans.
        
        This PR has multiple Copilot indicators:
        - Author: "Copilot" (should detect as 'agent')
        - Assignee: "Copilot" (should detect as 'agent')
        - Reviewer: "copilot-pull-request-reviewer[bot]" (should detect as 'review')
        
        Based on the priority in detect_copilot_collaboration, this should return 'agent'
        because author check comes first.
        """
        # Real PR data from GitHub API for mcp-research/mcp-security-scans/pull/143
        pr_data = {
            "number": 143,
            "title": "Fix secret scanning types not being categorized due to missing attributes",
            "body": "## Problem\n\nThe daily security reports were showing \"Secrets found but types not categorized\" instead of displaying actual secret types, even when repositories had secret scanning alerts.\n\n## Root Cause\n\nThe `get_secret_scanning_alerts` function in `src/analyze.py` was using direct attribute access to read secret type information from GitHub API responses:\n\n```python\nsecret_type = alert.secret_type_display_name or alert.secret_type or \"Unknown\"\n```\n\nWhen the GitHub API response didn't include `secret_type_display_name` or `secret_type` attributes, this caused an `AttributeError`. The exception was caught by the generic exception handler, which logged an error and returned a result with `total > 0` but an empty `types` dictionary. This led to the \"Secrets found but types not categorized\" message in reports.\n\n## Solution\n\nChanged the attribute access to use `getattr()` with default values:\n\n```python\nsecret_type = getattr(alert, 'secret_type_display_name', None) or getattr(alert, 'secret_type', None) or \"Unknown\"\n```\n\nThis prevents `AttributeError` exceptions and ensures that secret alerts with missing type attributes are properly categorized as \"Unknown\" instead of being lost.\n\n## Impact\n\n- Secret scanning alerts are now properly categorized in reports\n- Reports will show actual secret types (including \"Unknown\" for unidentifiable secrets) instead of \"Secrets found but types not categorized\"\n- Improved reliability when GitHub API responses have incomplete data\n- No breaking changes to existing functionality\n\n## Testing\n\n- Added comprehensive test case for missing secret type attributes\n- All existing tests continue to pass\n- Verified the fix handles various edge cases (missing attributes, None values, empty strings)\n\nFixes #142.\n\n---\n\n💡 You can make Copilot smarter by setting up custom instructions, customizing its development environment and configuring Model Context Protocol (MCP) servers. Learn more [Copilot coding agent tips](https://gh.io/copilot-coding-agent-tips) in the docs.",
            "user": {
                "login": "Copilot",
                "id": 198982749,
                "type": "Bot"
            },
            "assignees": [
                {
                    "login": "rajbos",
                    "id": 6085745,
                    "type": "User"
                },
                {
                    "login": "Copilot", 
                    "id": 198982749,
                    "type": "Bot"
                }
            ],
            "requested_reviewers": [
                {
                    "login": "rajbos",
                    "id": 6085745,
                    "type": "User"
                }
            ],
            "repository_name": "mcp-security-scans",
            "repository_owner": "mcp-research"
        }
        
        # Mock the get_pr_reviews method to return the actual review data
        mock_reviews = [
            {
                "user": {
                    "login": "copilot-pull-request-reviewer[bot]",
                    "id": 175728472,
                    "type": "Bot"
                },
                "state": "COMMENTED",
                "body": "## Pull Request Overview\n\nThis PR fixes an issue where secret scanning alerts were not being properly categorized when secret type attributes were missing from the GitHub API response..."
            }
        ]
        
        # Mock the get_pr_commits method to avoid unnecessary API calls
        mock_commits = []
        
        with patch.object(self.analyzer, 'get_pr_reviews', return_value=mock_reviews), \
             patch.object(self.analyzer, 'get_pr_commits', return_value=mock_commits):
            
            # Test the detection
            result = self.analyzer.detect_copilot_collaboration(pr_data)
            
            # Based on the priority in detect_copilot_collaboration:
            # 1. Copilot bot as author -> 'agent' (this should match first)
            # 2. Copilot as requested reviewer -> 'review'  
            # 3. Copilot as actual reviewer -> 'review'
            # 4. Copilot as assignee -> 'agent'
            
            # Since the PR author is "Copilot", this should return 'agent'
            self.assertEqual(result, 'agent', 
                           "PR #143 should be detected as 'agent' due to Copilot being the author")
    
    def test_copilot_author_detection(self):
        """Test that Copilot as author is detected as 'agent'."""
        pr_data = {
            "number": 1,
            "title": "Test PR", 
            "body": "Test body",
            "user": {"login": "Copilot", "type": "Bot"},
            "assignees": [],
            "requested_reviewers": []
        }
        
        with patch.object(self.analyzer, 'get_pr_reviews', return_value=[]), \
             patch.object(self.analyzer, 'get_pr_commits', return_value=[]):
            
            result = self.analyzer.detect_copilot_collaboration(pr_data)
            self.assertEqual(result, 'agent')
    
    def test_copilot_reviewer_detection(self):
        """Test that Copilot as reviewer is detected as 'review'."""
        pr_data = {
            "number": 2,
            "title": "Test PR",
            "body": "Test body", 
            "user": {"login": "human_user", "type": "User"},
            "assignees": [],
            "requested_reviewers": []
        }
        
        mock_reviews = [
            {"user": {"login": "Copilot", "type": "Bot"}}
        ]
        
        with patch.object(self.analyzer, 'get_pr_reviews', return_value=mock_reviews), \
             patch.object(self.analyzer, 'get_pr_commits', return_value=[]):
            
            result = self.analyzer.detect_copilot_collaboration(pr_data)
            self.assertEqual(result, 'review')
    
    def test_copilot_pull_request_reviewer_bot_detection(self):
        """Test that copilot-pull-request-reviewer[bot] is detected as 'review'."""
        pr_data = {
            "number": 3,
            "title": "Test PR",
            "body": "Test body",
            "user": {"login": "human_user", "type": "User"},
            "assignees": [],
            "requested_reviewers": []
        }
        
        mock_reviews = [
            {"user": {"login": "copilot-pull-request-reviewer[bot]", "type": "Bot"}}
        ]
        
        with patch.object(self.analyzer, 'get_pr_reviews', return_value=mock_reviews), \
             patch.object(self.analyzer, 'get_pr_commits', return_value=[]):
            
            result = self.analyzer.detect_copilot_collaboration(pr_data)
            # This test will reveal if the current logic handles this bot name correctly
            self.assertEqual(result, 'review')
    
    def test_copilot_assignee_detection(self):
        """Test that Copilot as assignee is detected as 'agent'."""
        pr_data = {
            "number": 4,
            "title": "Test PR",
            "body": "Test body",
            "user": {"login": "human_user", "type": "User"},
            "assignees": [{"login": "Copilot", "type": "Bot"}],
            "requested_reviewers": []
        }
        
        with patch.object(self.analyzer, 'get_pr_reviews', return_value=[]), \
             patch.object(self.analyzer, 'get_pr_commits', return_value=[]):
            
            result = self.analyzer.detect_copilot_collaboration(pr_data)
            self.assertEqual(result, 'agent')
    
    def test_no_copilot_detection(self):
        """Test that PRs without Copilot return 'none'."""
        pr_data = {
            "number": 5,
            "title": "Regular PR",
            "body": "Regular body", 
            "user": {"login": "human_user", "type": "User"},
            "assignees": [],
            "requested_reviewers": []
        }
        
        with patch.object(self.analyzer, 'get_pr_reviews', return_value=[]), \
             patch.object(self.analyzer, 'get_pr_commits', return_value=[]):
            
            result = self.analyzer.detect_copilot_collaboration(pr_data)
            self.assertEqual(result, 'none')
    
    def test_copilot_related_but_not_reviewer_detection(self):
        """Test that usernames containing 'copilot' but not 'review' are not detected as reviewers."""
        pr_data = {
            "number": 6,
            "title": "Test PR",
            "body": "Test body",
            "user": {"login": "human_user", "type": "User"},
            "assignees": [],
            "requested_reviewers": []
        }
        
        # A bot with 'copilot' in name but not 'review' - should not be detected as reviewer
        mock_reviews = [
            {"user": {"login": "copilot-helper[bot]", "type": "Bot"}}
        ]
        
        with patch.object(self.analyzer, 'get_pr_reviews', return_value=mock_reviews), \
             patch.object(self.analyzer, 'get_pr_commits', return_value=[]):
            
            result = self.analyzer.detect_copilot_collaboration(pr_data)
            # Should not be detected as review since it doesn't contain 'review'
            self.assertEqual(result, 'none')
    
    def test_edge_case_reviewer_names(self):
        """Test various edge cases of reviewer names that might contain copilot and review."""
        test_cases = [
            ("github-copilot-review[bot]", True),  # Should be detected
            ("CoPiLoT-ReViEw-BoT", True),         # Case insensitive
            ("copilot-review-assistant", True),    # Different format
            ("review-copilot", True),             # Different order
            ("copilot-helper", False),            # No 'review'
            ("review-bot", False),                # No 'copilot'
            ("regular-reviewer", False),          # Neither keyword
        ]
        
        for reviewer_name, should_detect in test_cases:
            with self.subTest(reviewer_name=reviewer_name):
                pr_data = {
                    "number": 7,
                    "title": "Test PR",
                    "body": "Test body",
                    "user": {"login": "human_user", "type": "User"},
                    "assignees": [],
                    "requested_reviewers": []
                }
                
                mock_reviews = [
                    {"user": {"login": reviewer_name, "type": "Bot"}}
                ]
                
                with patch.object(self.analyzer, 'get_pr_reviews', return_value=mock_reviews), \
                     patch.object(self.analyzer, 'get_pr_commits', return_value=[]):
                    
                    result = self.analyzer.detect_copilot_collaboration(pr_data)
                    expected = 'review' if should_detect else 'none'
                    self.assertEqual(result, expected, 
                                   f"Reviewer '{reviewer_name}' should {'be' if should_detect else 'not be'} detected as copilot reviewer")


if __name__ == '__main__':
    unittest.main()