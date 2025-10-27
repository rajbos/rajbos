import { generateSummaryStats, generateRepositoryDataTable } from '../src/mermaid-generator.js';

describe('Step Summary Integration', () => {
    describe('generateSummaryStats', () => {
        test('should include GitHub Actions data in summary', () => {
            const results = {
                periodStart: '2023-01-01T00:00:00Z',
                periodEnd: '2023-01-31T23:59:59Z',
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 5,
                totalPRs: 50,
                totalCopilotPRs: 30,
                totalCopilotReviewPRs: 20,
                totalCopilotAgentPRs: 10,
                totalActionsRuns: 15,
                totalActionsMinutes: 120,
                weeklyAnalysis: {}
            };

            const summary = generateSummaryStats(results);

            // Verify Actions data is included
            expect(summary).toContain('**Copilot-triggered Actions runs**: 15');
            expect(summary).toContain('**Copilot Actions minutes used**: 120');
            
            // Verify other data is still there
            expect(summary).toContain('**Total PRs**: 50');
            expect(summary).toContain('**Copilot-Assisted PRs**: 30');
            expect(summary).toContain('**Copilot Review PRs**: 20');
            expect(summary).toContain('**Copilot Agent PRs**: 10');
        });

        test('should handle missing Actions data gracefully', () => {
            const results = {
                periodStart: '2023-01-01T00:00:00Z',
                periodEnd: '2023-01-31T23:59:59Z',
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 5,
                totalPRs: 50,
                totalCopilotPRs: 30,
                weeklyAnalysis: {}
            };

            const summary = generateSummaryStats(results);

            // Should not include Actions data when undefined
            expect(summary).not.toContain('Actions runs');
            expect(summary).not.toContain('Actions minutes');
            
            // Should still include other data
            expect(summary).toContain('**Total PRs**: 50');
            expect(summary).toContain('**Copilot-Assisted PRs**: 30');
        });
    });

    describe('generateRepositoryDataTable', () => {
        test('should include Actions columns in weekly data table', () => {
            const weeklyData = {
                '2023-W01': {
                    totalPRs: 10,
                    copilotAssistedPRs: 6,
                    copilotPercentage: 60,
                    uniqueCollaborators: 3,
                    repositories: ['repo1', 'repo2'],
                    actionsUsage: {
                        totalRuns: 5,
                        totalMinutes: 45
                    }
                },
                '2023-W02': {
                    totalPRs: 8,
                    copilotAssistedPRs: 4,
                    copilotPercentage: 50,
                    uniqueCollaborators: 2,
                    repositories: ['repo1'],
                    actionsUsage: {
                        totalRuns: 2,
                        totalMinutes: 20
                    }
                }
            };

            const table = generateRepositoryDataTable(weeklyData);

            // Verify header includes Actions columns
            expect(table).toContain('| Week | Total PRs | Copilot PRs | Copilot % | Actions Runs | Actions Minutes | Unique Collaborators | Repositories |');
            
            // Verify data rows include Actions data
            expect(table).toContain('| 2023-W01 | 10 | 6 | 60% | 5 | 45 | 3 | repo1, repo2 |');
            expect(table).toContain('| 2023-W02 | 8 | 4 | 50% | 2 | 20 | 2 | repo1 |');
        });

        test('should handle missing Actions data in weekly table', () => {
            const weeklyData = {
                '2023-W01': {
                    totalPRs: 10,
                    copilotAssistedPRs: 6,
                    copilotPercentage: 60,
                    uniqueCollaborators: 3,
                    repositories: ['repo1', 'repo2']
                    // No actionsUsage property
                }
            };

            const table = generateRepositoryDataTable(weeklyData);

            // Should show 0 for missing Actions data
            expect(table).toContain('| 2023-W01 | 10 | 6 | 60% | 0 | 0 | 3 | repo1, repo2 |');
        });
    });
});