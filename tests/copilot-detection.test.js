import { jest } from '@jest/globals';
import { GitHubPRAnalyzer } from '../src/pr-analyzer.js';

describe('GitHubPRAnalyzer - Copilot Detection', () => {
    let analyzer;
    
    beforeEach(() => {
        analyzer = new GitHubPRAnalyzer('test_token', 'test_owner', 'test_repo');
    });

    test('should detect PR #143 as Copilot agent collaboration', async () => {
        // Real PR data from GitHub API for mcp-research/mcp-security-scans/pull/143
        const prData = {
            number: 143,
            title: "Fix secret scanning types not being categorized due to missing attributes",
            body: "## Problem\n\nThe daily security reports were showing \"Secrets found but types not categorized\" instead of displaying actual secret types, even when repositories had secret scanning alerts.\n\n## Root Cause\n\nThe `get_secret_scanning_alerts` function in `src/analyze.py` was using direct attribute access to read secret type information from GitHub API responses:\n\n```python\nsecret_type = alert.secret_type_display_name or alert.secret_type or \"Unknown\"\n```\n\nWhen the GitHub API response didn't include `secret_type_display_name` or `secret_type` attributes, this caused an `AttributeError`. The exception was caught by the generic exception handler, which logged an error and returned a result with `total > 0` but an empty `types` dictionary. This led to the \"Secrets found but types not categorized\" message in reports.\n\n## Solution\n\nChanged the attribute access to use `getattr()` with default values:\n\n```python\nsecret_type = getattr(alert, 'secret_type_display_name', None) or getattr(alert, 'secret_type', None) or \"Unknown\"\n```\n\nThis prevents `AttributeError` exceptions and ensures that secret alerts with missing type attributes are properly categorized as \"Unknown\" instead of being lost.\n\n## Impact\n\n- Secret scanning alerts are now properly categorized in reports\n- Reports will show actual secret types (including \"Unknown\" for unidentifiable secrets) instead of \"Secrets found but types not categorized\"\n- Improved reliability when GitHub API responses have incomplete data\n- No breaking changes to existing functionality\n\n## Testing\n\n- Added comprehensive test case for missing secret type attributes\n- All existing tests continue to pass\n- Verified the fix handles various edge cases (missing attributes, None values, empty strings)\n\nFixes #142.\n\n---\n\n💡 You can make Copilot smarter by setting up custom instructions, customizing its development environment and configuring Model Context Protocol (MCP) servers. Learn more [Copilot coding agent tips](https://gh.io/copilot-coding-agent-tips) in the docs.",
            user: {
                login: "Copilot",
                id: 198982749,
                type: "Bot"
            },
            assignees: [
                {
                    login: "rajbos",
                    id: 1756190,
                    type: "User"
                },
                {
                    login: "Copilot",
                    id: 198982749,
                    type: "Bot"
                }
            ],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "mcp-research/mcp-security-scans"
                }
            }
        };
        
        const mockReviews = [
            {
                user: {
                    login: "copilot-pull-request-reviewer[bot]",
                    id: 175728472,
                    type: "Bot"
                },
                state: "COMMENTED",
                body: "## Pull Request Overview\\n\\nThis PR fixes an issue where secret scanning alerts were not being properly categorized when secret type attributes were missing from the GitHub API response..."
            }
        ];
        
        // Mock the API calls
        const mockCommits = [];
        
        // Mock the methods that make API calls
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue(mockCommits);
        
        // Test the detection
        const result = await analyzer.detectCopilotCollaboration(prData);
        
        // Based on the priority in detectCopilotCollaboration:
        // 1. Copilot bot as author -> 'agent' (this should match first)
        expect(result).toBe('agent');
    });

    test('should detect Copilot as author as agent', async () => {
        const prData = {
            number: 1,
            title: "Test PR",
            body: "Test body",
            user: { login: "Copilot", type: "Bot" },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "test/repo"
                }
            }
        };
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue([]);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('agent');
    });

    test('should detect copilot-pull-request-reviewer[bot] as review', async () => {
        const prData = {
            number: 3,
            title: "Test PR",
            body: "Test body",
            user: { login: "human_user", type: "User" },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "test/repo"
                }
            }
        };
        
        const mockReviews = [
            { user: { login: "copilot-pull-request-reviewer[bot]", type: "Bot" } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('review');
    });

    test('should detect Copilot as assignee as agent', async () => {
        const prData = {
            number: 2,
            title: "Test PR",
            body: "Test body",
            user: { login: "human_user", type: "User" },
            assignees: [{ login: "Copilot", type: "Bot" }],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "test/repo"
                }
            }
        };
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue([]);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('agent');
    });

    test('should detect Copilot as reviewer as review', async () => {
        const prData = {
            number: 4,
            title: "Test PR",
            body: "Test body",
            user: { login: "human_user", type: "User" },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "test/repo"
                }
            }
        };
        
        const mockReviews = [
            { user: { login: "Copilot", type: "Bot" } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('review');
    });

    test('should return none for PR without Copilot', async () => {
        const prData = {
            number: 5,
            title: "Regular PR",
            body: "Regular PR body",
            user: { login: "human_user", type: "User" },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "test/repo"
                }
            }
        };
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue([]);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('none');
    });

    test('should handle edge case reviewer names with copilot and review', async () => {
        const prData = {
            number: 6,
            title: "Test PR",
            body: "Test body",
            user: { login: "human_user", type: "User" },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "test/repo"
                }
            }
        };
        
        const mockReviews = [
            { user: { login: "copilot-code-reviewer", type: "Bot" } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('review');
    });

    test('should not detect usernames containing copilot but not review as reviewers', async () => {
        const prData = {
            number: 7,
            title: "Test PR",
            body: "Test body",
            user: { login: "human_user", type: "User" },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: "test/repo"
                }
            }
        };
        
        const mockReviews = [
            { user: { login: "copilot-assistant", type: "Bot" } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('none');
    });

    test('should detect dependabot PRs', () => {
        const dependabotPR = {
            user: { login: "dependabot[bot]", type: "Bot" },
            title: "Bump axios from 1.0.0 to 1.6.0"
        };
        
        const result = analyzer.detectDependabotPR(dependabotPR);
        expect(result).toBe(true);
    });

    test('should not detect regular PRs as dependabot', () => {
        const regularPR = {
            user: { login: "human_user", type: "User" },
            title: "Add new feature"
        };
        
        const result = analyzer.detectDependabotPR(regularPR);
        expect(result).toBe(false);
    });
});