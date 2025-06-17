import { jest } from '@jest/globals';
import { GitHubPRAnalyzer } from '../src/pr-analyzer.js';

describe('GitHubPRAnalyzer - GitHub Actions Basic Tests', () => {
    let analyzer;
    
    beforeEach(() => {
        analyzer = new GitHubPRAnalyzer('test_token', 'test_owner', 'test_repo');
    });

    test('should detect Copilot-triggered workflow runs', () => {
        // Test basic Copilot detection
        expect(analyzer.isCopilotTriggeredRun({
            actor: { login: 'Copilot' }
        })).toBe(true);

        expect(analyzer.isCopilotTriggeredRun({
            actor: { login: 'copilot-swe-agent' }
        })).toBe(true);

        expect(analyzer.isCopilotTriggeredRun({
            actor: { login: 'regularuser' }
        })).toBe(false);
    });

    test('should calculate action minutes correctly', () => {
        const jobs = [
            {
                started_at: '2024-01-01T10:00:00Z',
                completed_at: '2024-01-01T10:02:30Z' // 2.5 minutes, should round up to 3
            },
            {
                started_at: '2024-01-01T11:00:00Z',
                completed_at: '2024-01-01T11:05:00Z' // exactly 5 minutes
            }
        ];

        const totalMinutes = analyzer.calculateActionMinutes(jobs);
        expect(totalMinutes).toBe(8); // 3 + 5 = 8
    });

    test('should handle empty jobs array', () => {
        const totalMinutes = analyzer.calculateActionMinutes([]);
        expect(totalMinutes).toBe(0);
    });
});