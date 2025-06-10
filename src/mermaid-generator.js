import fs from 'fs/promises';
import { glob } from 'glob';

/**
 * Check if the script is running in a CI environment (GitHub Actions).
 */
export function isRunningInCI() {
    return process.env.GITHUB_ACTIONS?.toLowerCase() === 'true' || 
           process.env.CI?.toLowerCase() === 'true';
}

/**
 * Mask sensitive information for display when running in CI.
 */
export function maskPrivateInfoForDisplay(value) {
    if (isRunningInCI()) {
        if (value && !['all_repositories', 'N/A', 'unknown'].includes(value)) {
            // Check if this looks like it could be private info
            if (value.includes('<private-repo>') || value.startsWith('<private')) {
                return value; // Already masked
            }
            // For analyzed_user, we keep it but could mask if needed
            return value;
        }
    }
    return value;
}

/**
 * Find the latest analysis JSON file.
 */
export async function findLatestAnalysisFile() {
    const jsonFiles = await glob('pr_analysis_*.json');
    if (jsonFiles.length === 0) {
        throw new Error('No analysis JSON files found');
    }
    
    // Sort by filename (which includes timestamp)
    jsonFiles.sort().reverse();
    return jsonFiles[0];
}

/**
 * Parse week key format YYYY-WXX into year and week number.
 */
export function parseWeekKey(weekKey) {
    const [yearStr, weekStr] = weekKey.split('-W');
    return [parseInt(yearStr), parseInt(weekStr)];
}

/**
 * Convert week key from YYYY-WXX format to YY/XX for display.
 */
export function formatWeekForDisplay(weekKey) {
    const [yearStr, weekStr] = weekKey.split('-W');
    const shortYear = yearStr.slice(-2); // Get last 2 digits of year
    return `${shortYear}/${weekStr}`;
}

/**
 * Generate mermaid line chart showing PR trends over time.
 */
export function generateTrendChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return "No data available for trend chart";
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Generate chart data
    const chartLines = [];
    chartLines.push("```mermaid");
    chartLines.push("xychart-beta");
    chartLines.push('    title "Pull Requests total vs GitHub Copilot Assisted"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    const maxPRs = Math.max(...Object.values(weeklyData).map(data => data.totalPRs));
    chartLines.push('    y-axis "Number of PRs" 0 --> ' + (maxPRs + 5));
    
    // Total PRs line
    const totalPrs = sortedWeeks.map(week => weeklyData[week].totalPRs);
    chartLines.push('    line "Total Pull Requests" [' + totalPrs.join(', ') + ']');
    
    // Copilot PRs line
    const copilotPrs = sortedWeeks.map(week => weeklyData[week].copilotAssistedPRs);
    chartLines.push('    line "GitHub Copilot Assisted" [' + copilotPrs.join(', ') + ']');
    
    chartLines.push("```");
    
    // Add legend explanation
    const legendExplanation = [
        "",
        "**Legend:**",
        "- 📈 **Total Pull Requests**: All PRs created during each week",
        "- 🤖 **GitHub Copilot Assisted**: PRs that included AI-generated code contributions",
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate stacked bar chart showing Copilot assistance types over time.
 */
export function generateCopilotTypesChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return "No data available for Copilot types chart";
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Check if there's any Copilot data
    const hasCopilotData = sortedWeeks.some(week => 
        (weeklyData[week].copilotReviewPRs || 0) > 0 || 
        (weeklyData[week].copilotAgentPRs || 0) > 0
    );
    
    if (!hasCopilotData) {
        return "No Copilot assistance data available for this period";
    }
    
    // Generate chart data
    const chartLines = [];
    chartLines.push("```mermaid");
    chartLines.push("xychart-beta");
    chartLines.push('    title "GitHub Copilot Assistance Types by Week"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    // Calculate max value for y-axis
    const maxValue = Math.max(...sortedWeeks.map(week => 
        (weeklyData[week].copilotReviewPRs || 0) + (weeklyData[week].copilotAgentPRs || 0)
    ));
    chartLines.push('    y-axis "Number of PRs" 0 --> ' + (maxValue + 2));
    
    // Coding Review data
    const reviewPrs = sortedWeeks.map(week => weeklyData[week].copilotReviewPRs || 0);
    chartLines.push('    bar "Coding Review" [' + reviewPrs.join(', ') + ']');
    
    // Coding Agent data
    const agentPrs = sortedWeeks.map(week => weeklyData[week].copilotAgentPRs || 0);
    chartLines.push('    bar "Coding Agent" [' + agentPrs.join(', ') + ']');
    
    chartLines.push("```");
    
    // Add legend explanation
    const legendExplanation = [
        "",
        "**Legend:**",
        "- 📝 **Coding Review**: PRs where Copilot was used for code review assistance",
        "- 🤖 **Coding Agent**: PRs where Copilot was used for code generation/development",
        "- **Stacked View**: Each bar shows the breakdown of Copilot assistance types per week"
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate mermaid line chart showing Copilot percentage trends.
 */
export function generatePercentageChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return "No data available for percentage chart";
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Check if there's any data
    const hasData = sortedWeeks.some(week => weeklyData[week].totalPRs > 0);
    if (!hasData) {
        return "No PR data available for this period";
    }
    
    // Generate chart data
    const chartLines = [];
    chartLines.push("```mermaid");
    chartLines.push("xychart-beta");
    chartLines.push('    title "GitHub Copilot Usage Percentage Over Time"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    chartLines.push('    y-axis "Percentage %" 0 --> 100');
    
    // Copilot percentage line
    const copilotPercentages = sortedWeeks.map(week => 
        Math.round((weeklyData[week].copilotPercentage || 0) * 100) / 100
    );
    chartLines.push('    line "Copilot Usage %" [' + copilotPercentages.join(', ') + ']');
    
    chartLines.push("```");
    
    // Add legend explanation
    const legendExplanation = [
        "",
        "**Legend:**",
        "- 🤖 **Copilot Usage %**: Percentage of PRs that used GitHub Copilot assistance",
        "- **Higher percentages indicate increased adoption of AI-assisted development**"
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate markdown table showing repository activity data.
 */
export function generateRepositoryDataTable(weeklyData, analyzedUser = "unknown") {
    const maskedUser = maskPrivateInfoForDisplay(analyzedUser);
    
    const lines = [];
    lines.push("| Week | Total PRs | Copilot PRs | Copilot % | Unique Collaborators | Repositories |");
    lines.push("|------|-----------|-------------|-----------|---------------------|--------------|");
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const data = weeklyData[week];
        const repositories = Array.isArray(data.repositories) ? data.repositories.slice(0, 3) : [];
        const repoDisplay = repositories.length > 3 ? 
            repositories.join(', ') + ` (+${repositories.length - 3} more)` : 
            repositories.join(', ');
        
        lines.push(`| ${week} | ${data.totalPRs} | ${data.copilotAssistedPRs} | ${data.copilotPercentage}% | ${data.uniqueCollaborators} | ${repoDisplay} |`);
    }
    
    return lines.join('\n');
}

/**
 * Generate markdown table showing percentage data.
 */
export function generatePercentageDataTable(weeklyData) {
    const lines = [];
    lines.push("| Week | Total PRs | Copilot % | Review % | Agent % |");
    lines.push("|------|-----------|-----------|----------|---------|");
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const data = weeklyData[week];
        const copilotPct = Math.round((data.copilotPercentage || 0) * 100) / 100;
        const reviewPct = Math.round((data.copilotReviewPercentage || 0) * 100) / 100;
        const agentPct = Math.round((data.copilotAgentPercentage || 0) * 100) / 100;
        
        lines.push(`| ${week} | ${data.totalPRs} | ${copilotPct}% | ${reviewPct}% | ${agentPct}% |`);
    }
    
    return lines.join('\n');
}

/**
 * Generate markdown table showing Copilot assistance types data.
 */
export function generateCopilotTypesDataTable(weeklyData) {
    const lines = [];
    lines.push("| Week | Total PRs | Review PRs | Agent PRs | Review % | Agent % |");
    lines.push("|------|-----------|------------|-----------|----------|---------|");
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const data = weeklyData[week];
        const totalPrs = data.totalPRs;
        const reviewPrs = data.copilotReviewPRs || 0;
        const agentPrs = data.copilotAgentPRs || 0;
        const reviewPct = Math.round((data.copilotReviewPercentage || 0) * 100) / 100;
        const agentPct = Math.round((data.copilotAgentPercentage || 0) * 100) / 100;
        
        lines.push(`| ${week} | ${totalPrs} | ${reviewPrs} | ${agentPrs} | ${reviewPct}% | ${agentPct}% |`);
    }
    
    return lines.join('\n');
}

/**
 * Calculate commit count statistics per week for Copilot PRs.
 */
export function calculateCommitStatsPerWeek(weeklyData) {
    const weeklyCommitStats = {};
    
    for (const [week, data] of Object.entries(weeklyData)) {
        const copilotPRs = data.pullRequests.filter(pr => pr.copilotAssisted && pr.commitCounts);
        
        if (copilotPRs.length > 0) {
            const totalCommitCounts = copilotPRs.map(pr => pr.commitCounts.totalCommits);
            const userCommitCounts = copilotPRs.map(pr => pr.commitCounts.userCommits);
            const copilotCommitCounts = copilotPRs.map(pr => pr.commitCounts.copilotCommits);
            
            weeklyCommitStats[week] = {
                prCount: copilotPRs.length,
                totalCommits: {
                    min: Math.min(...totalCommitCounts),
                    max: Math.max(...totalCommitCounts),
                    avg: Math.round(totalCommitCounts.reduce((a, b) => a + b, 0) / totalCommitCounts.length * 10) / 10
                },
                userCommits: {
                    min: Math.min(...userCommitCounts),
                    max: Math.max(...userCommitCounts),
                    avg: Math.round(userCommitCounts.reduce((a, b) => a + b, 0) / userCommitCounts.length * 10) / 10
                },
                copilotCommits: {
                    min: Math.min(...copilotCommitCounts),
                    max: Math.max(...copilotCommitCounts),
                    avg: Math.round(copilotCommitCounts.reduce((a, b) => a + b, 0) / copilotCommitCounts.length * 10) / 10
                }
            };
        }
    }
    
    return weeklyCommitStats;
}

/**
 * Generate mermaid chart showing commit count statistics for Copilot PRs.
 */
export function generateCommitStatsChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return "No data available for commit statistics chart";
    }
    
    const commitStats = calculateCommitStatsPerWeek(weeklyData);
    const statsWeeks = Object.keys(commitStats);
    
    if (statsWeeks.length === 0) {
        return "No Copilot PR commit data available for this period";
    }
    
    // Sort weeks chronologically
    const sortedWeeks = statsWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Generate chart data
    const chartLines = [];
    chartLines.push("```mermaid");
    chartLines.push("xychart-beta");
    chartLines.push('    title "Copilot PR Commit Count Statistics by Week"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    // Calculate max value for y-axis
    const maxValue = Math.max(...sortedWeeks.map(week => commitStats[week].totalCommits.max));
    chartLines.push('    y-axis "Number of Commits" 0 --> ' + (maxValue + 2));
    
    // Min commits line
    const minCommits = sortedWeeks.map(week => commitStats[week].totalCommits.min);
    chartLines.push('    line "Min Commits" [' + minCommits.join(', ') + ']');
    
    // Average commits line
    const avgCommits = sortedWeeks.map(week => commitStats[week].totalCommits.avg);
    chartLines.push('    line "Avg Commits" [' + avgCommits.join(', ') + ']');
    
    // Max commits line
    const maxCommits = sortedWeeks.map(week => commitStats[week].totalCommits.max);
    chartLines.push('    line "Max Commits" [' + maxCommits.join(', ') + ']');
    
    chartLines.push("```");
    
    // Add legend explanation
    const legendExplanation = [
        "",
        "**Legend:**",
        "- 📉 **Min Commits**: Minimum commits per PR in Copilot PRs for each week",
        "- 📊 **Avg Commits**: Average commits per PR in Copilot PRs for each week", 
        "- 📈 **Max Commits**: Maximum commits per PR in Copilot PRs for each week",
        "- **Higher averages may indicate more complex AI-assisted development**"
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate markdown table showing commit statistics data.
 */
export function generateCommitStatsDataTable(weeklyData) {
    const commitStats = calculateCommitStatsPerWeek(weeklyData);
    const statsWeeks = Object.keys(commitStats);
    
    if (statsWeeks.length === 0) {
        return "No Copilot PR commit data available for table";
    }
    
    const lines = [];
    lines.push("| Week | PRs | Min Commits | Avg Commits | Max Commits | Min User | Avg User | Max User | Min Copilot | Avg Copilot | Max Copilot |");
    lines.push("|------|-----|-------------|-------------|-------------|----------|----------|----------|-------------|-------------|-------------|");
    
    // Sort weeks chronologically
    const sortedWeeks = statsWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const stats = commitStats[week];
        lines.push(`| ${week} | ${stats.prCount} | ${stats.totalCommits.min} | ${stats.totalCommits.avg} | ${stats.totalCommits.max} | ${stats.userCommits.min} | ${stats.userCommits.avg} | ${stats.userCommits.max} | ${stats.copilotCommits.min} | ${stats.copilotCommits.avg} | ${stats.copilotCommits.max} |`);
    }
    
    return lines.join('\n');
}

/**
 * Generate summary statistics in markdown format.
 */
export function generateSummaryStats(results) {
    const lines = [];
    lines.push("### 📊 Analysis Summary");
    lines.push("");
    lines.push(`- **Analysis Period**: ${new Date(results.periodStart).toLocaleDateString()} to ${new Date(results.periodEnd).toLocaleDateString()}`);
    lines.push(`- **Analyzed User**: ${maskPrivateInfoForDisplay(results.analyzedUser)}`);
    lines.push(`- **Analyzed Repository**: ${maskPrivateInfoForDisplay(results.analyzedRepository)}`);
    lines.push(`- **Total Repositories**: ${results.totalRepositories}`);
    lines.push(`- **Total PRs**: ${results.totalPRs}`);
    lines.push(`- **Copilot-Assisted PRs**: ${results.totalCopilotPRs}`);
    
    if (results.totalPRs > 0) {
        const overallCopilotPercentage = Math.round(results.totalCopilotPRs / results.totalPRs * 100 * 100) / 100;
        lines.push(`- **Overall Copilot Usage**: ${overallCopilotPercentage}%`);
    }
    
    if (results.totalCopilotReviewPRs !== undefined) {
        lines.push(`- **Copilot Review PRs**: ${results.totalCopilotReviewPRs}`);
    }
    
    if (results.totalCopilotAgentPRs !== undefined) {
        lines.push(`- **Copilot Agent PRs**: ${results.totalCopilotAgentPRs}`);
    }
    
    return lines.join('\n');
}

/**
 * Write content to GitHub step summary.
 */
export async function writeToStepSummary(content) {
    const stepSummaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummaryFile) {
        try {
            await fs.appendFile(stepSummaryFile, content + '\n');
        } catch (error) {
            console.error(`Failed to write to step summary: ${error.message}`);
        }
    } else {
        // If not in GitHub Actions, write to console
        console.log(content);
    }
}

/**
 * Main function to generate and display mermaid charts.
 */
export async function generateMermaidCharts() {
    try {
        // Find and load the latest analysis file
        const analysisFile = await findLatestAnalysisFile();
        console.log(`Using analysis file: ${analysisFile}`);
        
        const fileContent = await fs.readFile(analysisFile, 'utf8');
        const results = JSON.parse(fileContent);
        
        const weeklyData = results.weeklyAnalysis;
        const analyzedUser = results.analyzedUser || 'unknown';
        
        if (!weeklyData || Object.keys(weeklyData).length === 0) {
            await writeToStepSummary("## ⚠️ No Data Available");
            await writeToStepSummary("No pull request data found for the analysis period.");
            return;
        }
        
        // Generate summary statistics
        const summaryStats = generateSummaryStats(results);
        await writeToStepSummary(summaryStats);
        await writeToStepSummary("");
        
        // Generate trend chart
        const trendChart = generateTrendChart(weeklyData);
        await writeToStepSummary("## 📈 Pull Request Trends");
        await writeToStepSummary("");
        await writeToStepSummary("*This chart displays both total PR volume and Copilot-assisted PRs over time.*");
        await writeToStepSummary(trendChart);
        
        // Generate trend data table
        const trendTable = generateRepositoryDataTable(weeklyData, analyzedUser);
        await writeToStepSummary("<details>");
        await writeToStepSummary("<summary>📊 Weekly PR Data</summary>");
        await writeToStepSummary("");
        await writeToStepSummary(trendTable);
        await writeToStepSummary("");
        await writeToStepSummary("</details>");
        
        // Generate percentage chart
        const percentageChart = generatePercentageChart(weeklyData);
        await writeToStepSummary("## 🤖 GitHub Copilot Usage Trends");
        await writeToStepSummary("");
        await writeToStepSummary("*This chart displays the adoption rate as percentage of total PRs over time.*");
        await writeToStepSummary(percentageChart);
        
        // Generate percentage data table
        const percentageTable = generatePercentageDataTable(weeklyData);
        await writeToStepSummary("<details>");
        await writeToStepSummary("<summary>📊 Copilot Usage Percentage Data</summary>");
        await writeToStepSummary("");
        await writeToStepSummary(percentageTable);
        await writeToStepSummary("");
        await writeToStepSummary("</details>");
        
        // Generate Copilot assistance types chart
        const copilotTypesChart = generateCopilotTypesChart(weeklyData);
        await writeToStepSummary("## 🤖📝 GitHub Copilot Assistance Types");
        await writeToStepSummary("");
        await writeToStepSummary("*This chart breaks down Copilot usage by assistance type: coding review vs. coding agent.*");
        await writeToStepSummary(copilotTypesChart);
        
        // Generate Copilot types data table
        const copilotTypesTable = generateCopilotTypesDataTable(weeklyData);
        await writeToStepSummary("<details>");
        await writeToStepSummary("<summary>📊 Copilot Assistance Types Data</summary>");
        await writeToStepSummary("");
        await writeToStepSummary(copilotTypesTable);
        await writeToStepSummary("");
        await writeToStepSummary("</details>");
        
        // Generate commit statistics chart and table
        const commitStatsChart = generateCommitStatsChart(weeklyData);
        await writeToStepSummary("## 📊 Copilot PR Commit Count Statistics");
        await writeToStepSummary("");
        await writeToStepSummary("*This chart displays min/average/max commit counts per Copilot PR for each week.*");
        await writeToStepSummary(commitStatsChart);
        
        // Generate commit statistics data table
        const commitStatsTable = generateCommitStatsDataTable(weeklyData);
        if (commitStatsTable !== "No Copilot PR commit data available for table") {
            await writeToStepSummary("<details>");
            await writeToStepSummary("<summary>📊 Commit Count Statistics Data</summary>");
            await writeToStepSummary("");
            await writeToStepSummary(commitStatsTable);
            await writeToStepSummary("");
            await writeToStepSummary("</details>");
        }
        
        console.log("Mermaid charts generated successfully!");
        
    } catch (error) {
        console.error(`Error generating mermaid charts: ${error.message}`);
        await writeToStepSummary("## ❌ Error");
        await writeToStepSummary(`Failed to generate charts: ${error.message}`);
        process.exit(1);
    }
}