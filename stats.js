// stats.js - Statistics page logic

const CORS_PROXIES = [
    url => `https://cors.eu.org/${url}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

let currentProxyIndex = 0;
const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

// Cache settings - use same cache as app.js
const CACHE_VERSION = 4;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for stats (longer cache)

// Clear oldest caches when storage is full
function clearOldestStatsCache() {
    try {
        const cacheKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('fpl_cache_')) {
                try {
                    const cached = localStorage.getItem(key);
                    if (cached) {
                        const { timestamp } = JSON.parse(cached);
                        cacheKeys.push({ key, timestamp });
                    }
                } catch (e) {
                    // Invalid cache entry, add with timestamp 0 to delete
                    cacheKeys.push({ key, timestamp: 0 });
                }
            }
        }
        
        // Sort by timestamp (oldest first)
        cacheKeys.sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove oldest 50% of caches
        const toRemove = Math.ceil(cacheKeys.length * 0.5);
        for (let i = 0; i < toRemove && i < cacheKeys.length; i++) {
            localStorage.removeItem(cacheKeys[i].key);
        }
        
        console.log(`Đã xóa ${toRemove} cache cũ`);
    } catch (error) {
        console.error('Lỗi khi dọn cache:', error);
    }
}

// Get cache from app.js format
function getAppCache(key) {
    const cached = localStorage.getItem(`fpl_cache_${key}`);
    if (cached) {
        const { data, timestamp, version } = JSON.parse(cached);
        if (version === CACHE_VERSION && Date.now() - timestamp < CACHE_DURATION) {
            return data;
        }
    }
    return null;
}

function setAppCache(key, data) {
    try {
        localStorage.setItem(`fpl_cache_${key}`, JSON.stringify({
            data, timestamp: Date.now(), version: CACHE_VERSION
        }));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('Cache đầy, đang dọn dẹp...');
            clearOldestStatsCache();
            try {
                // Retry after cleanup
                localStorage.setItem(`fpl_cache_${key}`, JSON.stringify({
                    data, timestamp: Date.now(), version: CACHE_VERSION
                }));
            } catch (retryError) {
                console.error('Không thể lưu cache sau khi dọn dẹp:', retryError.message);
            }
        } else {
            console.warn('Cache storage failed:', e);
        }
    }
}

// State
let settings = {};
let leagueData = null;
let currentGameweek = 1;
let playersData = {};
let allStats = {};
let leagueId = null;

// DOM Elements
const leagueNameDisplay = document.getElementById('leagueNameDisplay');
const loadingEl = document.getElementById('loading');
const statsContent = document.getElementById('statsContent');
const hallOfFameEl = document.getElementById('hallOfFame');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupBackButton();
    loadSettings();
    displayHallOfFame();
    await loadStatsData();
});

function setupBackButton() {
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            const savedLeagueId = localStorage.getItem('currentLeagueId');
            if (savedLeagueId) {
                window.location.href = `index.html?returnToLeague=${savedLeagueId}`;
            } else {
                window.location.href = 'index.html';
            }
        });
    }
}

function loadSettings() {
    // Get current league ID
    leagueId = localStorage.getItem('currentLeagueId');
    const leagueName = localStorage.getItem('currentLeagueName') || 'League Statistics';
    
    leagueNameDisplay.textContent = leagueName;
    
    // Load settings for this league
    if (leagueId) {
        const savedSettings = localStorage.getItem(`fplSettings_${leagueId}`);
        if (savedSettings) {
            settings = JSON.parse(savedSettings);
        }
    }
}

function displayHallOfFame() {
    const history = settings.leagueHistory || [];
    
    if (history.length === 0) {
        hallOfFameEl.innerHTML = `
            <p class="no-data">
                Chưa có dữ liệu lịch sử. Vui lòng thêm trong <a href="settings.html">Cài đặt</a>.
            </p>
        `;
        return;
    }
    
    // Get current year to mark current champion
    const currentYear = new Date().getFullYear();
    
    // Keep original order from settings (no sorting)
    // Only the last entry is the current champion
    hallOfFameEl.innerHTML = history.map((h, idx) => {
        const isCurrentChampion = idx === history.length - 1;
        return `
        <div class="champion-card${isCurrentChampion ? ' current-champion' : ''}">
            <div class="champion-trophy">🏆</div>
            <div class="champion-year">${h.year}</div>
            ${h.leagueName ? `<div class="champion-league-name">${h.leagueName}</div>` : ''}
            <div class="champion-name">${h.champion}</div>
            ${h.teamName ? `<div class="champion-team">${h.teamName}</div>` : ''}
        </div>
    `;
    }).join('');
}

async function fetchWithProxy(url) {
    const maxRetries = CORS_PROXIES.length;
    
    for (let i = 0; i < maxRetries; i++) {
        const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
        const proxyUrl = CORS_PROXIES[proxyIndex](url);
        
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            currentProxyIndex = proxyIndex;
            return data;
        } catch (error) {
            console.warn(`Proxy ${proxyIndex} failed:`, error.message);
        }
    }
    throw new Error('All proxies failed');
}

async function loadStatsData() {
    if (!leagueId) {
        loadingEl.classList.add('hidden');
        statsContent.classList.remove('hidden');
        statsContent.querySelector('.stats-section:nth-child(2)').innerHTML = `
            <h2>⚽ Thống kê mùa giải hiện tại</h2>
            <div class="no-data">Chưa chọn League. Vui lòng quay lại trang chính và chọn League.</div>
        `;
        return;
    }
    
    try {
        // Try to get bootstrap from cache first (cache for 6 hours as it rarely changes)
        let bootstrap = getAppCache('bootstrap_static');
        if (!bootstrap) {
            bootstrap = await fetchWithProxy(`${FPL_API_BASE}/bootstrap-static/`);
            setAppCache('bootstrap_static', bootstrap, 6 * 60 * 60 * 1000);
        }
        currentGameweek = bootstrap.events.find(e => e.is_current)?.id || 1;
        
        // Create players lookup
        bootstrap.elements.forEach(p => {
            playersData[p.id] = p;
        });
        
        // Try to get league standings from cache first
        let leagueStandings = getAppCache(`league_${leagueId}`);
        if (!leagueStandings) {
            leagueStandings = await fetchWithProxy(`${FPL_API_BASE}/leagues-classic/${leagueId}/standings/`);
            setAppCache(`league_${leagueId}`, leagueStandings);
        }
        leagueData = leagueStandings;
        
        const entries = leagueData.standings.results;
        
        // Fetch entry history data (use cached data when available)
        await fetchAllEntryData(entries);
        
        // Calculate and display stats
        calculateAllStats(entries);
        
        // Hide loading, show content
        loadingEl.classList.add('hidden');
        statsContent.classList.remove('hidden');
        
        displayStats();
        
    } catch (error) {
        console.error('Error loading stats:', error);
        loadingEl.classList.add('hidden');
        statsContent.classList.remove('hidden');
        statsContent.innerHTML = `<div class="no-data">Lỗi tải dữ liệu: ${error.message}</div>`;
    }
}

async function fetchAllEntryData(entries) {
    const totalSteps = entries.length + currentGameweek + (entries.length * currentGameweek);
    let completedSteps = 0;
    
    function updateProgress(message) {
        completedSteps++;
        const percent = Math.round((completedSteps / totalSteps) * 100);
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        
        if (progressBar) {
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent > 0 ? percent + '%' : '';
        }
        if (progressText) {
            progressText.textContent = message;
        }
    }
    
    // Fetch entry history for all entries - use cached data when available
    updateProgress('Đang tải lịch sử các manager...');
    const historyPromises = entries.map(async entry => {
        // Check app.js cache format first
        const appCacheKey = `entry_history_${entry.entry}`;
        let history = getAppCache(appCacheKey);
        
        if (!history) {
            try {
                history = await fetchWithProxy(`${FPL_API_BASE}/entry/${entry.entry}/history/`);
                setAppCache(appCacheKey, history);
            } catch (e) {
                console.warn(`Failed to fetch history for ${entry.entry}`);
                history = null;
            }
        }
        
        updateProgress(`Đã tải lịch sử ${entry.player_name}`);
        return { entryId: entry.entry, history };
    });
    
    const historyResults = await Promise.all(historyPromises);
    historyResults.forEach(r => {
        if (r.history) {
            allStats[r.entryId] = { history: r.history };
        }
    });
    
    // Fetch live data for each GW to get player points (for captain calculation)
    const leagueStartGW = parseInt(localStorage.getItem('currentLeagueStartEvent')) || 1;
    for (let gw = leagueStartGW; gw <= currentGameweek; gw++) {
        updateProgress(`Đang tải dữ liệu GW ${gw}...`);
        const liveCacheKey = `live_${gw}`;
        let liveData = getAppCache(liveCacheKey);
        
        if (!liveData) {
            try {
                liveData = await fetchWithProxy(`${FPL_API_BASE}/event/${gw}/live/`);
                setAppCache(liveCacheKey, liveData);
            } catch (e) {
                console.warn(`Failed to fetch live data for GW ${gw}`);
                liveData = null;
            }
        }
        
        if (liveData) {
            if (!allStats.liveData) allStats.liveData = {};
            allStats.liveData[gw] = {};
            // Create lookup by element id
            liveData.elements.forEach(el => {
                allStats.liveData[gw][el.id] = el.stats.total_points;
            });
        }
    }
    
    // Fetch picks for captain stats - batch process to avoid too many requests
    updateProgress('Đang tải đội hình các manager...');
    const picksToFetch = [];
    for (const entry of entries) {
        for (let gw = leagueStartGW; gw <= currentGameweek; gw++) {
            const cacheKey = `picks_${entry.entry}_${gw}`;
            const cached = getAppCache(cacheKey);
            if (cached) {
                if (!allStats[entry.entry]) allStats[entry.entry] = {};
                if (!allStats[entry.entry].picks) allStats[entry.entry].picks = {};
                allStats[entry.entry].picks[gw] = cached;
            } else {
                picksToFetch.push({ entry: entry.entry, gw, name: entry.player_name, teamName: entry.entry_name });
            }
        }
    }
    
    // Fetch missing picks in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < picksToFetch.length; i += BATCH_SIZE) {
        const batch = picksToFetch.slice(i, i + BATCH_SIZE);
        const progress = Math.round(((i + batch.length) / picksToFetch.length) * 100);
        updateProgress(`Đang tải đội hình... (${progress}%)`);
        const results = await Promise.all(
            batch.map(async ({ entry, gw, name, teamName }) => {
                try {
                    const picks = await fetchWithProxy(`${FPL_API_BASE}/entry/${entry}/event/${gw}/picks/`);
                    setAppCache(`picks_${entry}_${gw}`, picks);
                    return { entry, gw, picks };
                } catch (e) {
                    return { entry, gw, picks: null };
                }
            })
        );
        
        results.forEach(r => {
            if (r.picks) {
                if (!allStats[r.entry]) allStats[r.entry] = {};
                if (!allStats[r.entry].picks) allStats[r.entry].picks = {};
                allStats[r.entry].picks[r.gw] = r.picks;
            }
        });
    }
}

function calculateAllStats(entries) {
    const statsResults = {
        captainPoints: [],
        bestSingleCaptain: null,
        benchPoints: [],
        teamValue: [],
        bankValue: [],
        biggestClimb: [],
        biggestDrop: [],
        gwWins: [],
        gwLosses: [],
        mostTransfers: [],
        leastTransfers: [],
        highestGW: [],
        lowestGW: [],
        mostConsistent: [],
        mostVolatile: [],
        highestHitCost: [], // NEW: Highest transfer cost in single GW
        mostGreenArrows: [], // NEW: Most rank improvements
        longestStreak: [] // NEW: Longest above-average streak
    };
    
    const leagueStartGW = parseInt(localStorage.getItem('currentLeagueStartEvent')) || 1;

    // Calculate GW scores for each entry to find winners/losers
    const gwScores = {};
    for (let gw = leagueStartGW; gw <= currentGameweek; gw++) {
        gwScores[gw] = [];
    }
    
    // First pass: collect all GW data for league ranking calculation
    const allGWData = {}; // {gw: [{entry, totalPoints, name, teamName}]}
    for (let gw = leagueStartGW; gw <= currentGameweek; gw++) {
        allGWData[gw] = [];
    }
    
    entries.forEach(entry => {
        const data = allStats[entry.entry];
        if (!data || !data.history) return;
        
        const history = (data.history.current || []).filter(h => h.event >= leagueStartGW);
        let cumulativePoints = 0;
        
        history.forEach(gwData => {
            cumulativePoints += gwData.points;
            if (allGWData[gwData.event]) {
                allGWData[gwData.event].push({
                    entry: entry.entry,
                    name: entry.player_name,
                    teamName: entry.entry_name,
                    totalPoints: cumulativePoints,
                    gwPoints: gwData.points
                });
            }
        });
    });
    
    // Calculate league rankings for each GW
    const leagueRankings = {}; // {gw: {entryId: rank}}
    for (let gw = leagueStartGW; gw <= currentGameweek; gw++) {
        const gwData = allGWData[gw];
        // Sort by total points descending
        gwData.sort((a, b) => b.totalPoints - a.totalPoints);
        
        leagueRankings[gw] = {};
        gwData.forEach((item, idx) => {
            leagueRankings[gw][item.entry] = idx + 1;
        });
    }
    
    // Track biggest climb/drop for each entry
    const climbDropData = {}; // {entryId: {biggestClimb: {value, gw}, biggestDrop: {value, gw}, recentClimb: {value, gw}, recentDrop: {value, gw}}}
    
    entries.forEach(entry => {
        const data = allStats[entry.entry];
        if (!data || !data.history) return;
        
        const history = (data.history.current || []).filter(h => h.event >= leagueStartGW);
        let totalBenchPoints = 0;
        let totalTransfers = 0;
        let gwPointsArray = [];
        let latestValue = 0;
        let latestBank = 0;
        let biggestClimb = { value: 0, gw: 0 };
        let biggestDrop = { value: 0, gw: 0 };
        let recentClimb = { value: 0, gw: 0 }; // for last 5 GWs
        let recentDrop = { value: 0, gw: 0 }; // for last 5 GWs
        let highestGWPoints = { points: 0, gw: 0 };
        let lowestGWPoints = { points: Infinity, gw: 0 };
        let highestSingleBench = { points: 0, gw: 0 }; // highest bench points in single GW
        let highestHitCost = { cost: 0, gw: 0, transfers: 0 }; // highest transfer cost in single GW
        let greenArrowCount = 0; // count of rank improvements
        let currentStreak = 0; // current above-average streak
        let longestAboveAvgStreak = 0; // longest above-average streak
        
        history.forEach(gw => {
            // Team value & bank
            if (gw.event === currentGameweek) {
                latestValue = gw.value;
                latestBank = gw.bank;
            }
            
            // Transfers
            totalTransfers += gw.event_transfers;
            
            // Points on bench
            totalBenchPoints += gw.points_on_bench;
            
            // Track highest bench points in single GW
            if (gw.points_on_bench > highestSingleBench.points) {
                highestSingleBench = { points: gw.points_on_bench, gw: gw.event };
            }
            
            // Track highest hit cost in single GW
            if (gw.event_transfers_cost > highestHitCost.cost) {
                highestHitCost = { cost: gw.event_transfers_cost, gw: gw.event, transfers: gw.event_transfers };
            }
            
            // League rank changes (based on mini league ranking)
            if (gw.event > leagueStartGW && leagueRankings[gw.event] && leagueRankings[gw.event - 1]) {
                const currentRank = leagueRankings[gw.event][entry.entry];
                const prevRank = leagueRankings[gw.event - 1][entry.entry];
                
                if (currentRank && prevRank) {
                    const change = prevRank - currentRank; // positive = climb, negative = drop
                    
                    // Count green arrows (rank improvements)
                    if (change > 0) {
                        greenArrowCount++;
                    }
                    
                    // All-time biggest climb/drop
                    if (change > biggestClimb.value) {
                        biggestClimb = { value: change, gw: gw.event };
                    }
                    if (change < biggestDrop.value) {
                        biggestDrop = { value: change, gw: gw.event };
                    }
                    
                    // Recent 5 GWs climb/drop
                    if (gw.event > currentGameweek - 5) {
                        if (change > recentClimb.value) {
                            recentClimb = { value: change, gw: gw.event };
                        }
                        if (change < recentDrop.value) {
                            recentDrop = { value: change, gw: gw.event };
                        }
                    }
                }
            }
            
            // GW points for consistency calculation
            gwPointsArray.push(gw.points);
            
            // Highest/Lowest GW
            if (gw.points > highestGWPoints.points) {
                highestGWPoints = { points: gw.points, gw: gw.event };
            }
            if (gw.points < lowestGWPoints.points) {
                lowestGWPoints = { points: gw.points, gw: gw.event };
            }
            
            // Add to GW scores for winner/loser calculation
            if (gwScores[gw.event]) {
                gwScores[gw.event].push({
                    entry: entry.entry,
                    name: entry.player_name,
                    teamName: entry.entry_name,
                    points: gw.points
                });
            }
        });
        
        // Calculate consistency (standard deviation)
        const avgPoints = gwPointsArray.reduce((a, b) => a + b, 0) / gwPointsArray.length || 0;
        const variance = gwPointsArray.reduce((sum, p) => sum + Math.pow(p - avgPoints, 2), 0) / gwPointsArray.length;
        const stdDev = Math.sqrt(variance);
        
        // Calculate longest above-average streak
        currentStreak = 0; // Reset streak counter
        longestAboveAvgStreak = 0; // Reset longest streak
        gwPointsArray.forEach(points => {
            if (points >= avgPoints) {
                currentStreak++;
                if (currentStreak > longestAboveAvgStreak) {
                    longestAboveAvgStreak = currentStreak;
                }
            } else {
                currentStreak = 0;
            }
        });
        
        // Store results
        statsResults.benchPoints.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: totalBenchPoints
        });
        
        statsResults.teamValue.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: latestValue / 10 // Convert to millions
        });
        
        statsResults.bankValue.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: latestBank / 10
        });
        
        statsResults.biggestClimb.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: biggestClimb.value,
            detail: biggestClimb.gw > 0 ? `GW ${biggestClimb.gw}` : ''
        });
        
        statsResults.biggestDrop.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: biggestDrop.value,
            detail: biggestDrop.gw > 0 ? `GW ${biggestDrop.gw}` : ''
        });
        
        // Store recent climb/drop for last 5 GWs
        if (!statsResults.recentClimb) statsResults.recentClimb = [];
        if (!statsResults.recentDrop) statsResults.recentDrop = [];
        
        statsResults.recentClimb.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: recentClimb.value,
            detail: recentClimb.gw > 0 ? `GW ${recentClimb.gw}` : ''
        });
        
        statsResults.recentDrop.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: recentDrop.value,
            detail: recentDrop.gw > 0 ? `GW ${recentDrop.gw}` : ''
        });
        
        // Store highest single GW bench points
        if (!statsResults.highestSingleBench) statsResults.highestSingleBench = [];
        statsResults.highestSingleBench.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: highestSingleBench.points,
            detail: highestSingleBench.gw > 0 ? `GW ${highestSingleBench.gw}` : ''
        });
        
        // Store highest hit cost
        if (!statsResults.highestHitCost) statsResults.highestHitCost = [];
        statsResults.highestHitCost.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: highestHitCost.cost,
            transfers: highestHitCost.transfers,
            detail: highestHitCost.gw > 0 ? `GW ${highestHitCost.gw}` : ''
        });
        
        // Store green arrows count
        statsResults.mostGreenArrows.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: greenArrowCount
        });
        
        // Store longest streak
        statsResults.longestStreak.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: longestAboveAvgStreak,
            avgPoints: avgPoints.toFixed(1)
        });
        
        statsResults.mostTransfers.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: totalTransfers
        });
        
        statsResults.highestGW.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: highestGWPoints.points,
            detail: `GW ${highestGWPoints.gw}`
        });
        
        statsResults.lowestGW.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: lowestGWPoints.points,
            detail: `GW ${lowestGWPoints.gw}`
        });
        
        statsResults.mostConsistent.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: stdDev,
            avgPoints: avgPoints.toFixed(1)
        });
    });
    
    // Calculate GW wins/losses
    const winCounts = {};
    const lossCounts = {};
    
    Object.keys(gwScores).forEach(gw => {
        const scores = gwScores[gw];
        if (scores.length === 0) return;
        
        const maxPoints = Math.max(...scores.map(s => s.points));
        const minPoints = Math.min(...scores.map(s => s.points));
        
        scores.forEach(s => {
            if (s.points === maxPoints) {
                winCounts[s.entry] = (winCounts[s.entry] || 0) + 1;
            }
            if (s.points === minPoints) {
                lossCounts[s.entry] = (lossCounts[s.entry] || 0) + 1;
            }
        });
    });
    
    entries.forEach(entry => {
        statsResults.gwWins.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: winCounts[entry.entry] || 0
        });
        
        statsResults.gwLosses.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: lossCounts[entry.entry] || 0
        });
        
        // Calculate total captain points from picks data
        const data = allStats[entry.entry];
        let totalCaptainPoints = 0;
        
        if (data && data.picks && allStats.liveData) {
            Object.keys(data.picks).forEach(gw => {
                if (parseInt(gw) < leagueStartGW) return; // skip GWs before league start
                const gwPicks = data.picks[gw];
                if (gwPicks && gwPicks.picks) {
                    const captainPick = gwPicks.picks.find(p => p.is_captain);
                    if (captainPick && captainPick.multiplier >= 2) {
                        // Get captain's base points from live data
                        const liveGW = allStats.liveData[gw];
                        if (liveGW && liveGW[captainPick.element] !== undefined) {
                            const basePoints = liveGW[captainPick.element];
                            // Captain bonus = (multiplier - 1) * basePoints
                            // multiplier 2 = +1x, multiplier 3 (TC) = +2x
                            const captainBonus = basePoints * (captainPick.multiplier - 1);
                            totalCaptainPoints += captainBonus;
                            
                            // Track best single GW captain
                            const captainTotalPoints = basePoints * captainPick.multiplier;
                            const captainPlayer = playersData[captainPick.element];
                            const captainName = captainPlayer ? `${captainPlayer.first_name} ${captainPlayer.second_name}` : `ID: ${captainPick.element}`;
                            
                            if (!statsResults.bestSingleCaptain || captainTotalPoints > statsResults.bestSingleCaptain.value) {
                                statsResults.bestSingleCaptain = {
                                    entry: entry.entry,
                                    name: entry.player_name,
                                    teamName: entry.entry_name,
                                    captainName: captainName,
                                    value: captainTotalPoints,
                                    detail: `GW ${gw}${captainPick.multiplier === 3 ? ' (TC)' : ''}`
                                };
                            }
                        }
                    }
                }
            });
        }
        
        statsResults.captainPoints.push({
            entry: entry.entry,
            name: entry.player_name,
            teamName: entry.entry_name,
            value: totalCaptainPoints
        });
    });
    
    // Sort results
    statsResults.benchPoints.sort((a, b) => b.value - a.value);
    statsResults.teamValue.sort((a, b) => b.value - a.value);
    statsResults.bankValue.sort((a, b) => b.value - a.value);
    statsResults.biggestClimb.sort((a, b) => b.value - a.value);
    statsResults.biggestDrop.sort((a, b) => a.value - b.value);
    statsResults.recentClimb.sort((a, b) => b.value - a.value);
    statsResults.recentDrop.sort((a, b) => a.value - b.value);
    statsResults.gwWins.sort((a, b) => b.value - a.value);
    statsResults.gwLosses.sort((a, b) => b.value - a.value);
    statsResults.mostTransfers.sort((a, b) => b.value - a.value);
    statsResults.highestGW.sort((a, b) => b.value - a.value);
    statsResults.lowestGW.sort((a, b) => a.value - b.value);
    statsResults.mostConsistent.sort((a, b) => a.value - b.value);
    statsResults.captainPoints.sort((a, b) => b.value - a.value);
    statsResults.highestSingleBench.sort((a, b) => b.value - a.value);
    statsResults.highestHitCost.sort((a, b) => b.value - a.value);
    statsResults.mostGreenArrows.sort((a, b) => b.value - a.value);
    statsResults.longestStreak.sort((a, b) => b.value - a.value);
    statsResults.gwLosses.sort((a, b) => b.value - a.value);
    statsResults.mostTransfers.sort((a, b) => b.value - a.value);
    statsResults.highestGW.sort((a, b) => b.value - a.value);
    statsResults.lowestGW.sort((a, b) => a.value - b.value);
    statsResults.mostConsistent.sort((a, b) => a.value - b.value);
    statsResults.captainPoints.sort((a, b) => b.value - a.value);
    statsResults.highestSingleBench.sort((a, b) => b.value - a.value);
    
    // Calculate "never came last" and "never came first"
    const neverLast = entries.filter(entry => (lossCounts[entry.entry] || 0) === 0);
    const neverFirst = entries.filter(entry => (winCounts[entry.entry] || 0) === 0);
    
    statsResults.neverLast = neverLast;
    statsResults.neverFirst = neverFirst;
    
    // Store for display
    allStats.results = statsResults;
    allStats.leagueRankings = leagueRankings;
    allStats.allGWData = allGWData;
    allStats.entries = entries;
}

function displayStats() {
    const results = allStats.results;
    if (!results) return;
    
    // Render Bench Points
    document.getElementById('topBenchPoints').innerHTML = renderRankingList(results.benchPoints.slice(0, 5), 'pts');
    
    // Render Team Value
    document.getElementById('topTeamValue').innerHTML = renderRankingList(results.teamValue.slice(0, 5), '£M', true);
    
    // Render Bank Value
    document.getElementById('topBankValue').innerHTML = renderRankingList(results.bankValue.slice(0, 5), '£M', true);
    
    // Render GW Wins
    document.getElementById('mostGWWins').innerHTML = renderRankingList(results.gwWins.slice(0, 5), 'lần');
    
    // Render GW Losses
    document.getElementById('mostGWLosses').innerHTML = renderRankingList(results.gwLosses.slice(0, 5), 'lần');
    
    // Render Transfers
    document.getElementById('mostTransfers').innerHTML = renderRankingList(results.mostTransfers.slice(0, 5), 'lần');
    document.getElementById('leastTransfers').innerHTML = renderRankingList(results.mostTransfers.slice().reverse().slice(0, 5), 'lần');
    
    // Render Highest GW
    const highestGW = results.highestGW[0];
    if (highestGW) {
        document.getElementById('highestGWScore').innerHTML = renderHighlight(highestGW, 'pts', '⭐');
    }
    
    // Render Lowest GW
    const lowestGW = results.lowestGW[0];
    if (lowestGW) {
        document.getElementById('lowestGWScore').innerHTML = renderHighlight(lowestGW, 'pts', '😅');
    }
    
    // Render Biggest Climb
    const biggestClimb = results.biggestClimb[0];
    if (biggestClimb) {
        document.getElementById('biggestClimb').innerHTML = renderHighlight(biggestClimb, 'hạng', '🚀', true);
    }
    
    // Render Biggest Drop
    const biggestDrop = results.biggestDrop[0];
    if (biggestDrop) {
        document.getElementById('biggestDrop').innerHTML = renderHighlight(biggestDrop, 'hạng', '📉', false, true);
    }
    
    // Render Recent Climb (last 5 GWs)
    const recentClimb = results.recentClimb[0];
    if (recentClimb && document.getElementById('recentClimb')) {
        document.getElementById('recentClimb').innerHTML = renderHighlight(recentClimb, 'hạng', '🚀', true);
    }
    
    // Render Recent Drop (last 5 GWs)
    const recentDrop = results.recentDrop[0];
    if (recentDrop && document.getElementById('recentDrop')) {
        document.getElementById('recentDrop').innerHTML = renderHighlight(recentDrop, 'hạng', '📉', false, true);
    }
    
    // Render Highest Single Bench
    const highestSingleBench = results.highestSingleBench[0];
    if (highestSingleBench && document.getElementById('highestSingleBench')) {
        document.getElementById('highestSingleBench').innerHTML = renderHighlight(highestSingleBench, 'pts', '💺');
    }
    
    // Render Never Last / Never First with humor
    if (document.getElementById('neverLast')) {
        document.getElementById('neverLast').innerHTML = renderNeverLastFirst(results.neverLast, 'last');
    }
    if (document.getElementById('neverFirst')) {
        document.getElementById('neverFirst').innerHTML = renderNeverLastFirst(results.neverFirst, 'first');
    }
    
    // Render new stats
    // Highest Hit Cost
    const highestHitCost = results.highestHitCost[0];
    if (highestHitCost && document.getElementById('highestHitCost')) {
        document.getElementById('highestHitCost').innerHTML = renderHitCostHighlight(highestHitCost);
    }
    
    // Most Green Arrows
    if (document.getElementById('mostGreenArrows')) {
        document.getElementById('mostGreenArrows').innerHTML = renderRankingList(results.mostGreenArrows.slice(0, 5), 'lần');
    }
    
    // Longest Streak
    if (document.getElementById('longestStreak')) {
        document.getElementById('longestStreak').innerHTML = renderStreakList(results.longestStreak.slice(0, 5));
    }
    
    // Render Consistency
    document.getElementById('mostConsistent').innerHTML = renderConsistencyList(results.mostConsistent.slice(0, 5));
    document.getElementById('mostVolatile').innerHTML = renderConsistencyList(results.mostConsistent.slice().reverse().slice(0, 5));
    
    // Render Captain Points
    document.getElementById('topCaptainPoints').innerHTML = renderRankingList(results.captainPoints.slice(0, 5), 'pts');
    
    // Render Best Single GW Captain
    if (results.bestSingleCaptain) {
        document.getElementById('bestSingleCaptain').innerHTML = renderCaptainHighlight(results.bestSingleCaptain);
    }
    
    // Render Total Points Chart
    renderTotalPointsChart();
}

function renderTotalPointsChart() {
    const allGWData = allStats.allGWData;
    const leagueRankings = allStats.leagueRankings;
    const entries = allStats.entries;
    
    if (!allGWData || !leagueRankings || !entries || entries.length === 0) return;
    
    const ctx = document.getElementById('positionChart');
    if (!ctx) return;
    
    const leagueStartGW = parseInt(localStorage.getItem('currentLeagueStartEvent')) || 1;
    
    // Prepare data for chart (now showing rankings instead of points)
    const gwLabels = [];
    for (let gw = leagueStartGW; gw <= currentGameweek; gw++) {
        gwLabels.push(`GW${gw}`);
    }
    
    // Generate distinct colors for each player - vibrant palette
    const colors = [
        '#e90052', '#00a650', '#04f5ff', '#ff6b00', '#963cff',
        '#2563eb', '#dc2626', '#059669', '#ca8a04', '#0891b2',
        '#9333ea', '#65a30d', '#be185d', '#ea580c', '#6b21a8',
        '#0284c7', '#16a34a', '#b91c1c', '#7c3aed', '#d97706'
    ];

    // Find last non-null index for each entry (for end labels)
    const datasets = entries.map((entry, idx) => {
        const data = [];
        for (let gw = leagueStartGW; gw <= currentGameweek; gw++) {
            if (leagueRankings[gw] && leagueRankings[gw][entry.entry]) {
                data.push(leagueRankings[gw][entry.entry]);
            } else {
                data.push(null);
            }
        }
        const lastNonNullIdx = data.reduce((acc, v, i) => v !== null ? i : acc, -1);

        return {
            label: entry.player_name,
            data: data,
            borderColor: colors[idx % colors.length],
            backgroundColor: colors[idx % colors.length],
            tension: 0.35,
            pointRadius: data.map((_, i) => i === lastNonNullIdx ? 6 : 3),
            pointHoverRadius: 8,
            pointBorderWidth: data.map((_, i) => i === lastNonNullIdx ? 2 : 1),
            pointBorderColor: '#fff',
            borderWidth: 2.5,
            spanGaps: false,
            datalabels: {
                display: (ctx) => ctx.dataIndex === lastNonNullIdx,
                align: 'right',
                anchor: 'end',
                offset: 6,
                color: colors[idx % colors.length],
                font: {
                    family: "'Inter', sans-serif",
                    size: 11,
                    weight: '600'
                },
                formatter: () => entry.player_name,
                clip: false
            }
        };
    });
    
    // Destroy existing chart if any
    if (window.positionChartInstance) {
        window.positionChartInstance.destroy();
    }

    // Register datalabels plugin
    Chart.register(ChartDataLabels);

    window.positionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: gwLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    right: 10,
                    top: 10,
                    bottom: 10
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false // Hidden — names shown on chart directly
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 10, 40, 0.92)',
                    titleFont: { family: "'Inter', sans-serif", size: 13, weight: '600' },
                    bodyFont: { family: "'Inter', sans-serif", size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    callbacks: {
                        title: (items) => items[0].label,
                        label: (context) => {
                            const rank = context.parsed.y;
                            return `  ${context.dataset.label}: Hạng ${rank}`;
                        }
                    }
                },
                datalabels: {
                    // Default off; overridden per dataset
                    display: false
                }
            },
            scales: {
                y: {
                    reverse: true,
                    beginAtZero: false,
                    min: 1,
                    ticks: {
                        stepSize: 1,
                        font: { family: "'Inter', sans-serif", size: 12 },
                        color: '#666',
                        callback: (value) => `Hạng ${value}`
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.06)',
                        drawBorder: false
                    },
                    border: { dash: [4, 4] }
                },
                x: {
                    ticks: {
                        font: { family: "'Inter', sans-serif", size: 11 },
                        color: '#888',
                        maxRotation: 45
                    },
                    grid: { display: false },
                    border: { color: 'rgba(0,0,0,0.1)' }
                }
            },
            animation: {
                duration: 600,
                easing: 'easeInOutQuart'
            }
        }
    });
}

function renderRankingList(data, unit, isDecimal = false, showDetail = false) {
    if (!data || data.length === 0) {
        return '<p class="no-data">Không có dữ liệu</p>';
    }
    
    return data.map((item, idx) => `
        <div class="stat-ranking-item">
            <div class="stat-rank ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}">${idx + 1}</div>
            <div class="stat-player-info">
                <div class="stat-player-name">${item.name}</div>
                <div class="stat-player-team">${item.teamName}${showDetail && item.detail ? ` • ${item.detail}` : ''}</div>
            </div>
            <div class="stat-value">
                ${isDecimal ? item.value.toFixed(1) : item.value} ${unit}
            </div>
        </div>
    `).join('');
}

function renderHighlight(item, unit, icon, isPositive = false, isNegative = false) {
    let valueClass = '';
    let displayValue = item.value;
    
    if (isPositive && item.value > 0) {
        valueClass = 'positive';
        displayValue = `+${item.value}`;
    } else if (isNegative && item.value < 0) {
        valueClass = 'negative';
    }
    
    return `
        <div class="stat-highlight-main">
            <div class="stat-highlight-icon">${icon}</div>
            <div class="stat-highlight-info">
                <div class="stat-highlight-name">${item.name}</div>
                <div class="stat-highlight-team">${item.teamName}</div>
            </div>
            <div class="stat-highlight-value ${valueClass}">
                ${displayValue} ${unit}
            </div>
        </div>
        ${item.detail ? `<div class="stat-highlight-detail">${item.detail}</div>` : ''}
    `;
}

function renderConsistencyList(data) {
    if (!data || data.length === 0) {
        return '<p class="no-data">Không có dữ liệu</p>';
    }
    
    return data.map((item, idx) => `
        <div class="stat-ranking-item">
            <div class="stat-rank ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}">${idx + 1}</div>
            <div class="stat-player-info">
                <div class="stat-player-name">${item.name}</div>
                <div class="stat-player-team">${item.teamName} • Avg: ${item.avgPoints} pts</div>
            </div>
            <div class="stat-value">
                σ = ${item.value.toFixed(2)}
            </div>
        </div>
    `).join('');
}

function renderCaptainHighlight(item) {
    return `
        <div class="stat-highlight-main captain-highlight-horizontal">
            <div class="stat-highlight-icon">🎯</div>
            <div class="stat-highlight-info">
                <div class="stat-highlight-name">${item.name}</div>
                <div class="stat-highlight-team">${item.teamName}</div>
                <div class="stat-highlight-detail-inline">
                    Captain: <strong>${item.captainName}</strong> • ${item.detail} → <span class="stat-value-inline">${item.value} pts</span>
                </div>
            </div>
        </div>
    `;
}

function renderNeverLastFirst(data, type) {
    if (!data || data.length === 0) {
        if (type === 'last') {
            return '<p class="humor-text">😱 Không ai thoát được số phận bét bảng cả! Ai cũng đã trải qua cảm giác đó rồi...</p>';
        } else {
            return '<p class="humor-text">🎉 Wow! Tất cả mọi người đều đã từng lên đỉnh vinh quang ít nhất 1 lần! Đây là giải đấu của những nhà vô địch!</p>';
        }
    }
    
    const names = data.map(e => `<strong>${e.player_name}</strong>`);
    let nameList = '';
    
    if (names.length === 1) {
        nameList = names[0];
    } else if (names.length === 2) {
        nameList = `${names[0]} và ${names[1]}`;
    } else {
        nameList = names.slice(0, -1).join(', ') + ` và ${names[names.length - 1]}`;
    }
    
    if (type === 'last') {
        const messages = [
            `🛡️ ${nameList} là ${names.length > 1 ? 'những cái tên' : 'cái tên'} may mắn chưa từng nếm mùi đáy bảng! Có lẽ ${names.length > 1 ? 'họ' : 'anh ấy'} đang có chiếc bùa hộ mệnh nào đó...`,
            `✨ Vị trí cuối bảng dường như sợ ${nameList}! ${names.length > 1 ? 'Những người' : 'Người'} chơi an toàn này chưa bao giờ phải nhìn tất cả mọi người từ phía dưới.`,
            `🎯 ${nameList} - ${names.length > 1 ? 'những chiến binh' : 'chiến binh'} kiên cường chưa từng để ai nhìn xuống! Đáy bảng vẫn đang chờ ${names.length > 1 ? 'họ' : 'anh ấy'}...`
        ];
        return `<p class="humor-text">${messages[Math.floor(Math.random() * messages.length)]}</p>`;
    } else {
        const messages = [
            `😅 ${nameList} vẫn đang chờ đợi khoảnh khắc vinh quang đầu tiên của ${names.length > 1 ? 'mình' : 'mình'}. Đỉnh cao còn xa lắm ${names.length > 1 ? 'các bạn' : 'bạn'} ơi!`,
            `🎪 Vị trí số 1 dường như là điều cấm kỵ với ${nameList}. ${names.length > 1 ? 'Họ' : 'Anh ấy'} đã thử mọi vị trí... trừ vị trí dẫn đầu!`,
            `🌟 ${nameList} là minh chứng cho thuyết "quan trọng là tham gia". Ngôi vương vẫn đang là giấc mơ với ${names.length > 1 ? 'những người' : 'người'} này!`
        ];
        return `<p class="humor-text">${messages[Math.floor(Math.random() * messages.length)]}</p>`;
    }
}

function renderHitCostHighlight(item) {
    return `
        <div class="stat-highlight-main">
            <div class="stat-highlight-icon">💸</div>
            <div class="stat-highlight-info">
                <div class="stat-highlight-name">${item.name}</div>
                <div class="stat-highlight-team">${item.teamName}</div>
            </div>
            <div class="stat-highlight-value negative">
                -${item.value} pts
            </div>
        </div>
        <div class="stat-highlight-detail">${item.transfers} transfers • ${item.detail}</div>
    `;
}

function renderStreakList(data) {
    if (!data || data.length === 0) {
        return '<p class="no-data">Không có dữ liệu</p>';
    }
    
    return data.map((item, idx) => `
        <div class="stat-ranking-item">
            <div class="stat-rank ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}">${idx + 1}</div>
            <div class="stat-player-info">
                <div class="stat-player-name">${item.name}</div>
                <div class="stat-player-team">${item.teamName} • Avg: ${item.avgPoints} pts</div>
            </div>
            <div class="stat-value">
                ${item.value} vòng
            </div>
        </div>
    `).join('');
}
