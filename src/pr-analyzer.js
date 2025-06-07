import axios from 'axios';
import NodeCache from 'node-cache';
import fs from 'fs/promises';
import path from 'path';
import createCsvWriter from 'csv-writer';

/**
 * Check if the script is running in a CI environment (GitHub Actions).
 */
export function isRunningInCI() {
    return process.env.GITHUB_ACTIONS?.toLowerCase() === 'true' || 
           process.env.CI?.toLowerCase() === 'true';
}

/**
 * Check if a repository is private based on the repository data from GitHub API.
 */
export function isPrivateRepository(repoData) {
    return repoData.private || false;
}

/**
 * Mask private repository name if running in CI, otherwise return original name.
 */
export function maskPrivateRepoName(repoName, isPrivate) {
    if (isRunningInCI() && isPrivate) {
        return '<private-repo>';
    }
    return repoName;
}

/**
 * Determine if we should show repository analysis messages.
 * Returns false for private repositories when running in CI to protect privacy.
 */
export function shouldShowAnalysisMessage(isPrivate) {
    if (isRunningInCI() && isPrivate) {
        return false;
    }
    return true;
}

/**
 * Check if a repository should be skipped from analysis.
 * Returns true if the repository is archived or disabled (deleted).
 */
export function shouldSkipRepository(repoData) {
    const isArchived = repoData.archived || false;
    const isDisabled = repoData.disabled || false;
    return isArchived || isDisabled;
}

/**
 * GitHub Pull Request Analyzer for detecting Copilot collaboration.
 */
export class GitHubPRAnalyzer {
    constructor(token, owner, repo = null) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
        this.headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
        this.baseUrl = 'https://api.github.com';
        
        // Cache for repository privacy information
        this.repoPrivacyCache = new Map();
        
        // Set up HTTP caching with 20-hour expiration
        this.cache = new NodeCache({ stdTTL: 20 * 60 * 60 }); // 20 hours in seconds
        
        // Set up axios instance
        this.api = axios.create({
            baseURL: this.baseUrl,
            headers: this.headers,
            timeout: 30000 // 30 second timeout
        });
    }

    /**
     * Get information about the HTTP cache.
     */
    getCacheInfo() {
        const keys = this.cache.keys();
        return {
            cacheEnabled: true,
            cacheSize: keys.length,
            cacheLocation: 'memory'
        };
    }

    /**
     * Get current rate limit information from GitHub API (non-cached call).
     */
    async getRateLimitInfo() {
        try {
            const response = await axios.get(`${this.baseUrl}/rate_limit`, {
                headers: this.headers
            });
            
            const rateLimitData = response.data;
            const resetTimestamp = rateLimitData.rate.reset;
            const resetDateTime = new Date(resetTimestamp * 1000);
            const currentTime = new Date();
            const timeUntilReset = Math.max(0, resetDateTime.getTime() - currentTime.getTime());
            
            const totalSeconds = Math.floor(timeUntilReset / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            return {
                remaining: rateLimitData.rate.remaining,
                limit: rateLimitData.rate.limit,
                resetTimestamp: resetTimestamp,
                resetDatetime: resetDateTime.toISOString(),
                timeUntilResetMinutes: minutes,
                timeUntilResetSeconds: seconds,
                timeUntilResetTotalSeconds: totalSeconds
            };
        } catch (error) {
            throw new Error(`Failed to get rate limit info: ${error.message}`);
        }
    }

    /**
     * Fetch all repositories for the user.
     */
    async getUserRepositories() {
        const repos = [];
        let page = 1;
        const perPage = 100;
        
        while (true) {
            const cacheKey = `repos_${this.owner}_${page}`;
            let response = this.cache.get(cacheKey);
            
            if (!response) {
                try {
                    const apiResponse = await this.api.get(`/users/${this.owner}/repos`, {
                        params: {
                            type: 'all',
                            sort: 'updated',
                            per_page: perPage,
                            page: page
                        }
                    });
                    response = apiResponse.data;
                    this.cache.set(cacheKey, response);
                } catch (error) {
                    throw new Error(`Failed to fetch repositories for ${this.owner}: ${error.message}`);
                }
            }
            
            if (response.length === 0) {
                break;
            }
            
            repos.push(...response);
            page++;
        }
        
        return repos;
    }

    /**
     * Load the organization filtering configuration from file.
     */
    async loadSkippedOrganizations() {
        const config = {
            fullySkipped: [],
            partiallySkipped: {}
        };
        
        try {
            const configFile = path.join(process.cwd(), 'skipped_orgs.txt');
            const content = await fs.readFile(configFile, 'utf8');
            
            for (const line of content.split('\n')) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine.startsWith('#')) {
                    continue;
                }
                
                if (trimmedLine.includes(':include:')) {
                    const [orgName, , repoList] = trimmedLine.split(':');
                    const repos = repoList.split(',').map(r => r.trim());
                    config.partiallySkipped[orgName] = repos;
                } else {
                    config.fullySkipped.push(trimmedLine);
                }
            }
        } catch (error) {
            // File doesn't exist or other error, use empty config
            console.log(`Note: Could not load skipped organizations config: ${error.message}`);
        }
        
        return config;
    }

    /**
     * Check if a repository should be skipped based on organization filtering.
     */
    shouldSkipRepositoryByOrg(repoName, skippedOrgs) {
        const [orgName, repoShortName] = repoName.includes('/') ? repoName.split('/') : ['', repoName];
        
        // Check if organization is fully skipped
        if (skippedOrgs.fullySkipped.includes(orgName)) {
            return true;
        }
        
        // Check if organization is partially skipped and this repo is not included
        if (skippedOrgs.partiallySkipped[orgName]) {
            return !skippedOrgs.partiallySkipped[orgName].includes(repoShortName);
        }
        
        return false;
    }

    /**
     * Fetch pull requests for a repository.
     */
    async getRepositoryPullRequests(repo, since) {
        const pulls = [];
        let page = 1;
        const perPage = 100;
        
        while (true) {
            const cacheKey = `pulls_${repo}_${since.toISOString()}_${page}`;
            let response = this.cache.get(cacheKey);
            
            if (!response) {
                try {
                    const apiResponse = await this.api.get(`/repos/${repo}/pulls`, {
                        params: {
                            state: 'all',
                            since: since.toISOString(),
                            per_page: perPage,
                            page: page,
                            sort: 'updated',
                            direction: 'desc'
                        }
                    });
                    response = apiResponse.data;
                    this.cache.set(cacheKey, response);
                } catch (error) {
                    if (error.response?.status === 404) {
                        console.log(`Repository ${repo} not found or not accessible`);
                        return [];
                    }
                    throw new Error(`Failed to fetch pull requests for ${repo}: ${error.message}`);
                }
            }
            
            if (response.length === 0) {
                break;
            }
            
            // Filter PRs that are actually within our date range
            const filteredPRs = response.filter(pr => {
                const createdAt = new Date(pr.created_at);
                return createdAt >= since;
            });
            
            pulls.push(...filteredPRs);
            
            // If we got fewer results than requested or the last PR is older than our cutoff, we're done
            if (response.length < perPage || filteredPRs.length < response.length) {
                break;
            }
            
            page++;
        }
        
        return pulls;
    }

    /**
     * Get reviews for a pull request.
     */
    async getPRReviews(repo, prNumber) {
        const cacheKey = `reviews_${repo}_${prNumber}`;
        let reviews = this.cache.get(cacheKey);
        
        if (!reviews) {
            try {
                const response = await this.api.get(`/repos/${repo}/pulls/${prNumber}/reviews`);
                reviews = response.data;
                this.cache.set(cacheKey, reviews);
            } catch (error) {
                console.log(`Warning: Could not fetch reviews for PR #${prNumber}: ${error.message}`);
                return [];
            }
        }
        
        return reviews;
    }

    /**
     * Get commits for a pull request.
     */
    async getPRCommits(repo, prNumber) {
        const cacheKey = `commits_${repo}_${prNumber}`;
        let commits = this.cache.get(cacheKey);
        
        if (!commits) {
            try {
                const response = await this.api.get(`/repos/${repo}/pulls/${prNumber}/commits`);
                commits = response.data;
                this.cache.set(cacheKey, commits);
            } catch (error) {
                console.log(`Warning: Could not fetch commits for PR #${prNumber}: ${error.message}`);
                return [];
            }
        }
        
        return commits;
    }

    /**
     * Detect GitHub Copilot collaboration and categorize by assistance type.
     */
    async detectCopilotCollaboration(pr) {
        const title = (pr.title || '').toLowerCase();
        const body = (pr.body || '').toLowerCase();
        
        // Priority 1: Check if author is Copilot (highest priority)
        if (pr.user && pr.user.login && pr.user.login.toLowerCase() === 'copilot') {
            return 'agent';
        }
        
        // Priority 2: Check assignees for Copilot
        if (pr.assignees && Array.isArray(pr.assignees)) {
            for (const assignee of pr.assignees) {
                if (assignee.login && assignee.login.toLowerCase() === 'copilot') {
                    return 'agent';
                }
            }
        }
        
        // Priority 3: Check reviewers for Copilot-related bots
        try {
            const reviews = await this.getPRReviews(pr.base.repo.full_name, pr.number);
            for (const review of reviews) {
                if (review.user && review.user.login) {
                    const reviewerLogin = review.user.login.toLowerCase();
                    
                    // Check for specific Copilot reviewer bot
                    if (reviewerLogin === 'copilot-pull-request-reviewer[bot]') {
                        return 'review';
                    }
                    
                    // Check for general Copilot reviewer patterns
                    if (reviewerLogin.includes('copilot') && reviewerLogin.includes('review')) {
                        return 'review';
                    }
                    
                    // Check for Copilot as a reviewer
                    if (reviewerLogin === 'copilot') {
                        return 'review';
                    }
                }
            }
        } catch (error) {
            console.log(`Warning: Could not fetch reviews for PR #${pr.number}: ${error.message}`);
        }
        
        // Priority 4: Check commits for Copilot collaboration
        try {
            const commits = await this.getPRCommits(pr.base.repo.full_name, pr.number);
            for (const commit of commits) {
                const message = (commit.commit.message || '').toLowerCase();
                
                // Check for co-authored-by with Copilot
                if (message.includes('co-authored-by:') && message.includes('copilot')) {
                    return 'agent';
                }
                
                // Check for Copilot in commit message with context
                if (message.includes('copilot')) {
                    const reviewPatterns = ['review', 'feedback', 'suggestion', 'comment', 'approve'];
                    if (reviewPatterns.some(pattern => message.includes(pattern))) {
                        return 'review';
                    } else {
                        return 'agent';
                    }
                }
            }
        } catch (error) {
            console.log(`Warning: Could not fetch commits for PR #${pr.number}: ${error.message}`);
        }
        
        // Priority 5: Check title/body for Copilot keywords
        const copilotKeywords = ['copilot', 'co-pilot', 'github copilot', 'ai-assisted', 'ai assisted'];
        const reviewPatterns = ['review', 'feedback', 'suggestion', 'comment', 'approve'];
        const agentPatterns = ['generate', 'create', 'implement', 'code', 'develop', 'write'];
        
        const copilotMentioned = copilotKeywords.some(keyword => 
            title.includes(keyword) || body.includes(keyword)
        );
        
        if (copilotMentioned) {
            // Determine if it's review or agent based on context
            if (reviewPatterns.some(pattern => title.includes(pattern) || body.includes(pattern))) {
                return 'review';
            } else if (agentPatterns.some(pattern => title.includes(pattern) || body.includes(pattern))) {
                return 'agent';
            } else {
                // Default to agent if Copilot mentioned but no specific context
                return 'agent';
            }
        }
        
        return 'none';
    }

    /**
     * Detect if a PR is from Dependabot.
     */
    detectDependabotPR(pr) {
        if (pr.user && pr.user.login) {
            const author = pr.user.login.toLowerCase();
            if (author === 'dependabot' || author === 'dependabot[bot]') {
                return true;
            }
        }
        
        const title = (pr.title || '').toLowerCase();
        const dependabotPatterns = ['bump', 'update', 'build(deps)'];
        
        return dependabotPatterns.some(pattern => title.includes(pattern));
    }

    /**
     * Get week key from date in format YYYY-WXX.
     */
    getWeekKey(date) {
        const year = date.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const daysSinceStart = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
        return `${year}-W${String(weekNumber).padStart(2, '0')}`;
    }

    /**
     * Analyze pull requests from the last 3 months.
     */
    async analyzePullRequests() {
        const now = new Date();
        const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
        
        console.log(`Starting PR analysis for ${this.owner}${this.repo ? `/${this.repo}` : ' (all repos)'}`);
        console.log(`Analysis period: ${since.toISOString()} to ${now.toISOString()}`);
        
        const weeklyData = {};
        const skippedOrgs = await this.loadSkippedOrganizations();
        
        let repositories;
        if (this.repo) {
            // Analyze single repository
            repositories = [{ full_name: `${this.owner}/${this.repo}`, name: this.repo }];
        } else {
            // Analyze all user repositories
            repositories = await this.getUserRepositories();
        }
        
        let totalPRs = 0;
        let totalCopilotPRs = 0;
        let totalCopilotReviewPRs = 0;
        let totalCopilotAgentPRs = 0;
        let totalDependabotPRs = 0;
        let totalRepositories = 0;
        
        const allCollaborators = new Set();
        const repositoryNames = new Set();
        
        for (const repo of repositories) {
            const repoFullName = repo.full_name;
            const repoName = repo.name;
            
            // Skip repository if it's in the skip list
            if (this.shouldSkipRepositoryByOrg(repoFullName, skippedOrgs)) {
                console.log(`Skipping repository [${repoFullName}] due to organization filtering`);
                continue;
            }
            
            // Skip archived or disabled repositories
            if (shouldSkipRepository(repo)) {
                console.log(`Skipping repository [${repoFullName}] because it is archived or disabled`);
                continue;
            }
            
            const isPrivate = isPrivateRepository(repo);
            const maskedRepoName = maskPrivateRepoName(repoFullName, isPrivate);
            
            if (shouldShowAnalysisMessage(isPrivate)) {
                console.log(`Analyzing repository: [${maskedRepoName}]`);
            }
            
            try {
                const pulls = await this.getRepositoryPullRequests(repoFullName, since);
                
                if (pulls.length > 0) {
                    totalRepositories++;
                    repositoryNames.add(maskedRepoName);
                    
                    if (shouldShowAnalysisMessage(isPrivate)) {
                        console.log(`  Found ${pulls.length} PRs in [${maskedRepoName}]`);
                    }
                }
                
                for (const pr of pulls) {
                    const createdAt = new Date(pr.created_at);
                    const weekKey = this.getWeekKey(createdAt);
                    
                    if (!weeklyData[weekKey]) {
                        weeklyData[weekKey] = {
                            totalPRs: 0,
                            copilotAssistedPRs: 0,
                            copilotReviewPRs: 0,
                            copilotAgentPRs: 0,
                            dependabotPRs: 0,
                            collaborators: new Set(),
                            repositories: new Set(),
                            pullRequests: []
                        };
                    }
                    
                    weeklyData[weekKey].totalPRs++;
                    totalPRs++;
                    
                    // Add author to collaborators
                    if (pr.user && pr.user.login) {
                        allCollaborators.add(pr.user.login);
                        weeklyData[weekKey].collaborators.add(pr.user.login);
                    }
                    
                    weeklyData[weekKey].repositories.add(maskedRepoName);
                    
                    // Detect Copilot collaboration
                    const copilotType = await this.detectCopilotCollaboration(pr);
                    const isDependabot = this.detectDependabotPR(pr);
                    
                    let copilotAssisted = false;
                    if (copilotType === 'review') {
                        weeklyData[weekKey].copilotReviewPRs++;
                        totalCopilotReviewPRs++;
                        copilotAssisted = true;
                    } else if (copilotType === 'agent') {
                        weeklyData[weekKey].copilotAgentPRs++;
                        totalCopilotAgentPRs++;
                        copilotAssisted = true;
                    }
                    
                    if (copilotAssisted) {
                        weeklyData[weekKey].copilotAssistedPRs++;
                        totalCopilotPRs++;
                    }
                    
                    if (isDependabot) {
                        weeklyData[weekKey].dependabotPRs++;
                        totalDependabotPRs++;
                    }
                    
                    // Store PR details
                    weeklyData[weekKey].pullRequests.push({
                        number: pr.number,
                        title: pr.title,
                        author: pr.user ? pr.user.login : 'unknown',
                        repository: maskedRepoName,
                        createdAt: pr.created_at,
                        copilotAssisted: copilotAssisted,
                        copilotType: copilotType,
                        dependabotPr: isDependabot,
                        url: pr.html_url
                    });
                }
            } catch (error) {
                console.error(`Error analyzing repository [${maskedRepoName}]: ${error.message}`);
            }
        }
        
        // Calculate percentages and prepare final data
        const finalWeeklyData = {};
        for (const [weekKey, data] of Object.entries(weeklyData)) {
            const copilotPercentage = data.totalPRs > 0 ? (data.copilotAssistedPRs / data.totalPRs * 100) : 0;
            const copilotReviewPercentage = data.totalPRs > 0 ? (data.copilotReviewPRs / data.totalPRs * 100) : 0;
            const copilotAgentPercentage = data.totalPRs > 0 ? (data.copilotAgentPRs / data.totalPRs * 100) : 0;
            const dependabotPercentage = data.totalPRs > 0 ? (data.dependabotPRs / data.totalPRs * 100) : 0;
            
            finalWeeklyData[weekKey] = {
                totalPRs: data.totalPRs,
                copilotAssistedPRs: data.copilotAssistedPRs,
                copilotReviewPRs: data.copilotReviewPRs,
                copilotAgentPRs: data.copilotAgentPRs,
                copilotPercentage: Math.round(copilotPercentage * 100) / 100,
                copilotReviewPercentage: Math.round(copilotReviewPercentage * 100) / 100,
                copilotAgentPercentage: Math.round(copilotAgentPercentage * 100) / 100,
                dependabotPRs: data.dependabotPRs,
                dependabotPercentage: Math.round(dependabotPercentage * 100) / 100,
                uniqueCollaborators: data.collaborators.size,
                collaborators: Array.from(data.collaborators),
                repositories: Array.from(data.repositories),
                pullRequests: data.pullRequests
            };
        }
        
        return {
            analysisDate: now.toISOString(),
            periodStart: since.toISOString(),
            periodEnd: now.toISOString(),
            analyzedUser: this.owner,
            analyzedRepository: this.repo || 'all_repositories',
            totalPRs: totalPRs,
            totalCopilotPRs: totalCopilotPRs,
            totalCopilotReviewPRs: totalCopilotReviewPRs,
            totalCopilotAgentPRs: totalCopilotAgentPRs,
            totalDependabotPRs: totalDependabotPRs,
            totalRepositories: totalRepositories,
            weeklyAnalysis: finalWeeklyData
        };
    }

    /**
     * Save results to file in specified format.
     */
    async saveResults(results, outputFormat = 'json') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        
        if (outputFormat.toLowerCase() === 'json') {
            const filename = `pr_analysis_${timestamp}.json`;
            await fs.writeFile(filename, JSON.stringify(results, null, 2));
            return filename;
        } else if (outputFormat.toLowerCase() === 'csv') {
            const filename = `pr_analysis_${timestamp}.csv`;
            const csvWriter = createCsvWriter.createObjectCsvWriter;
            
            // Prepare CSV data
            const records = [];
            for (const [week, data] of Object.entries(results.weeklyAnalysis)) {
                records.push({
                    Week: week,
                    'Total PRs': data.totalPRs,
                    'Copilot Assisted PRs': data.copilotAssistedPRs,
                    'Copilot Review PRs': data.copilotReviewPRs,
                    'Copilot Agent PRs': data.copilotAgentPRs,
                    'Copilot Percentage': data.copilotPercentage,
                    'Copilot Review Percentage': data.copilotReviewPercentage,
                    'Copilot Agent Percentage': data.copilotAgentPercentage,
                    'Unique Collaborators': data.uniqueCollaborators,
                    'Collaborators': data.collaborators.join(', ')
                });
            }
            
            const writer = csvWriter({
                path: filename,
                header: [
                    {id: 'Week', title: 'Week'},
                    {id: 'Total PRs', title: 'Total PRs'},
                    {id: 'Copilot Assisted PRs', title: 'Copilot Assisted PRs'},
                    {id: 'Copilot Review PRs', title: 'Copilot Review PRs'},
                    {id: 'Copilot Agent PRs', title: 'Copilot Agent PRs'},
                    {id: 'Copilot Percentage', title: 'Copilot Percentage'},
                    {id: 'Copilot Review Percentage', title: 'Copilot Review Percentage'},
                    {id: 'Copilot Agent Percentage', title: 'Copilot Agent Percentage'},
                    {id: 'Unique Collaborators', title: 'Unique Collaborators'},
                    {id: 'Collaborators', title: 'Collaborators'}
                ]
            });
            
            await writer.writeRecords(records);
            return filename;
        } else {
            throw new Error(`Unsupported output format: ${outputFormat}`);
        }
    }
}