// FPL API URLs
const API_BASE = 'https://fantasy.premierleague.com/api';

// Detect if running locally (file://) or on server (http/https)
const isLocalFile = window.location.protocol === 'file:';

// Configure proxies based on environment
const CORS_PROXIES = isLocalFile ? [
    // For local file:// - use fastest proxies first
    { url: 'https://corsproxy.io/?', needsEncode: false },
    { url: 'https://api.codetabs.com/v1/proxy?quest=', needsEncode: false },
    { url: 'https://api.allorigins.win/raw?url=', needsEncode: true }
] : [
    // For http/https - try direct first
    { url: '', needsEncode: false }, // Direct (no proxy)
    { url: 'https://corsproxy.io/?', needsEncode: false },
    { url: 'https://api.codetabs.com/v1/proxy?quest=', needsEncode: false },
    { url: 'https://api.allorigins.win/raw?url=', needsEncode: true }
];

// Helper to fetch with optional CORS proxy
async function fetchWithProxy(endpoint, tryProxies = true) {
    const fullUrl = `${API_BASE}${endpoint}`;
    
    console.log(`📡 Fetching: ${endpoint}`);
    console.log(`🔧 Environment: ${isLocalFile ? 'Local file (file://)' : 'Web server (http/https)'}`);
    
    // Try each proxy in order
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxyConfig = CORS_PROXIES[i];
            const proxy = proxyConfig.url;
            
            // Build URL based on whether proxy needs encoding
            let url;
            if (!proxy) {
                url = fullUrl; // Direct
            } else if (proxyConfig.needsEncode) {
                url = `${proxy}${encodeURIComponent(fullUrl)}`;
            } else {
                url = `${proxy}${fullUrl}`;
            }
            
            const proxyName = !proxy ? 'Direct API' : proxy.includes('allorigins') ? 'AllOrigins' : proxy.includes('corsproxy') ? 'CorsProxy' : 'CodeTabs';
            console.log(`⏳ Attempt ${i + 1}/${CORS_PROXIES.length}: ${proxyName}`);
            
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ SUCCESS with ${proxyName}!`);
                    return data;
                }
                
                console.log(`❌ Failed: ${response.status} ${response.statusText}`);
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                if (fetchErr.name === 'AbortError') {
                    console.log(`⏱️ Timeout (5s) with ${proxyName}`);
                } else {
                    throw fetchErr;
                }
            }
        } catch (err) {
            console.log(`❌ Error: ${err.message}`);
        }
    }
    
    console.error('❌ All fetch attempts failed for:', endpoint);
    return null; // Return null instead of throwing
}

// App state
let currentEntryId = null;
let currentLeagueId = null;
let currentGameweek = null;
let leagueData = {};
let allGameweeksData = {};
let userLeagues = [];
let currentSortColumn = 'rank';
let currentSortDirection = 'asc';

// Load settings from localStorage for specific league
function loadSettings(leagueId = null) {
    // Use current league ID if not provided
    if (!leagueId) {
        leagueId = localStorage.getItem('currentLeagueId');
    }
    
    if (!leagueId) {
        // No league ID, return default settings
        return {
            maxRanks: 20,
            rankPayments: generateDefaultPayments(20)
        };
    }
    
    const savedSettings = localStorage.getItem(`fplSettings_${leagueId}`);
    if (savedSettings) {
        return JSON.parse(savedSettings);
    }
    // Default settings
    return {
        maxRanks: 20,
        rankPayments: generateDefaultPayments(20)
    };
}

function generateDefaultPayments(count) {
    const payments = {};
    for (let i = 1; i <= count; i++) {
        payments[i] = (i - 1) * 5000; // 0, 5k, 10k, 15k...
    }
    return payments;
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

// Update user info display
function updateUserInfo(userData, entryId, userStats = null) {
    const fullName = `${userData.player_first_name} ${userData.player_last_name}`;
    const teamName = userData.name;
    
    let statsHTML = '';
    if (userStats) {
        statsHTML = `
            <div class="user-stats">
                <div class="user-stat">
                    <div class="user-stat-label">Hạng</div>
                    <div class="user-stat-value">#${userStats.rank}</div>
                </div>
                <div class="user-stat">
                    <div class="user-stat-label">Tổng điểm</div>
                    <div class="user-stat-value">${userStats.totalPoints}</div>
                </div>
                <div class="user-stat">
                    <div class="user-stat-label">Tổng tiền</div>
                    <div class="user-stat-value highlight">${formatCurrency(userStats.totalPayment)}</div>
                </div>
            </div>
        `;
    }
    
    document.getElementById('currentEntryId').innerHTML = `
        <div class="user-main-info">
            <div class="user-name">${fullName}</div>
            <div class="user-details">${teamName}</div>
            <div class="user-entry-id">Entry ID: ${entryId}</div>
        </div>
        ${statsHTML}
    `;
}

// Show/hide elements
function showElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.classList.remove('hidden');
    }
}

function hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.classList.add('hidden');
    }
}

function showLoading(message = 'Đang tải dữ liệu...') {
    showElement('loading');
    hideElement('error');
    const loadingTextEl = document.getElementById('loadingText');
    if (loadingTextEl) {
        loadingTextEl.textContent = message;
    }
    updateProgress(0, '');
}

function hideLoading() {
    hideElement('loading');
    updateProgress(0, '');
}

function updateProgress(percentage, text = '') {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = percentage > 0 ? `${percentage}%` : '';
    }
    
    if (progressText) {
        progressText.textContent = text;
    }
}

function showError(message) {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.textContent = message;
    }
    showElement('error');
    hideLoading();
}

// Fetch data from FPL API
async function fetchEntryData(entryId) {
    try {
        const data = await fetchWithProxy(`/entry/${entryId}/`);
        return data;
    } catch (error) {
        throw new Error(`Lỗi kết nối: ${error.message}`);
    }
}

async function fetchLeagueStandings(leagueId, page = 1) {
    try {
        const data = await fetchWithProxy(`/leagues-classic/${leagueId}/standings/?page_standings=${page}`);
        return data;
    } catch (error) {
        throw new Error(`Lỗi kết nối: ${error.message}`);
    }
}

async function fetchH2HLeagueStandings(leagueId) {
    try {
        const data = await fetchWithProxy(`/leagues-h2h/${leagueId}/standings/`);
        return data;
    } catch (error) {
        console.error('Error fetching H2H league:', error);
        return null;
    }
}

async function fetchH2HMatches(leagueId, gameweek) {
    try {
        console.log(`Fetching H2H matches for league ${leagueId}, GW ${gameweek}`);
        const data = await fetchWithProxy(`/leagues-h2h-matches/league/${leagueId}/?event=${gameweek}&page=1`);
        return data || { results: [] };
    } catch (error) {
        console.error('Error fetching H2H matches:', error);
        return { results: [] };
    }
}

async function fetchBootstrapData() {
    try {
        return await fetchWithProxy('/bootstrap-static/');
    } catch (error) {
        console.error('Error fetching bootstrap data:', error);
        return null; // Return null instead of throwing
    }
}

// Cache helper functions
function clearOldestCaches(prefix) {
    try {
        const cacheKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                cacheKeys.push(key);
            }
        }
        
        // Sort by key name (older GWs have smaller numbers)
        cacheKeys.sort();
        
        // Remove oldest 30% of caches
        const toRemove = Math.ceil(cacheKeys.length * 0.3);
        for (let i = 0; i < toRemove && i < cacheKeys.length; i++) {
            localStorage.removeItem(cacheKeys[i]);
        }
        
        console.log(`Đã xóa ${toRemove} cache cũ`);
    } catch (error) {
        console.error('Lỗi khi dọc cache:', error);
    }
}

function getCachedGWData(leagueId, gw) {
    try {
        const cacheKey = `fplCache_gw_${gw}_league_${leagueId}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        console.error('Lỗi đọc cache:', error);
    }
    return null;
}

function setCachedGWData(leagueId, gw, data) {
    try {
        const cacheKey = `fplCache_gw_${gw}_league_${leagueId}`;
        localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            console.warn('Cache đầy, đang dọn dẹp...');
            // Try to clear old caches and retry
            clearOldestCaches('fplCache_gw_');
            try {
                const cacheKey = `fplCache_gw_${gw}_league_${leagueId}`;
                localStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (retryError) {
                console.error('Không thể lưu cache sau khi dọn dẹp:', retryError.message);
            }
        } else {
            console.error('Lỗi lưu cache:', error);
        }
    }
}

function getCachedPicks(entryId, gw) {
    try {
        const cacheKey = `fplCache_picks_${entryId}_gw_${gw}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        console.error('Lỗi đọc cache picks:', error);
    }
    return null;
}

function setCachedPicks(entryId, gw, data) {
    try {
        const cacheKey = `fplCache_picks_${entryId}_gw_${gw}`;
        // Only cache essential data to save space
        const essentialData = {
            picks: data.picks.map(p => ({
                element: p.element,
                position: p.position,
                multiplier: p.multiplier,
                is_captain: p.is_captain,
                is_vice_captain: p.is_vice_captain
            }))
        };
        localStorage.setItem(cacheKey, JSON.stringify(essentialData));
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            console.warn('Cache picks đầy, đang dọn dẹp...');
            // Try to clear old picks caches and retry
            clearOldestCaches('fplCache_picks_');
            try {
                const cacheKey = `fplCache_picks_${entryId}_gw_${gw}`;
                const essentialData = {
                    picks: data.picks.map(p => ({
                        element: p.element,
                        position: p.position,
                        multiplier: p.multiplier,
                        is_captain: p.is_captain,
                        is_vice_captain: p.is_vice_captain
                    }))
                };
                localStorage.setItem(cacheKey, JSON.stringify(essentialData));
            } catch (retryError) {
                // Silently fail - app will work without cache
                console.error('Không thể lưu cache picks:', retryError.message);
            }
        } else {
            console.error('Lỗi lưu cache picks:', error);
        }
    }
}

async function fetchEntryHistory(entryId) {
    try {
        const data = await fetchWithProxy(`/entry/${entryId}/history/`);
        return data;
    } catch (error) {
        console.error(`Lỗi khi lấy lịch sử entry ${entryId}:`, error);
        return null;
    }
}

async function fetchEntryPicks(entryId, gameweek, useCache = true) {
    // Check cache first
    if (useCache) {
        const cached = getCachedPicks(entryId, gameweek);
        if (cached) {
            return cached;
        }
    }
    
    try {
        const data = await fetchWithProxy(`/entry/${entryId}/event/${gameweek}/picks/`);
        
        // Cache the result
        if (data) {
            setCachedPicks(entryId, gameweek, data);
        }
        return data;
    } catch (error) {
        console.error(`Lỗi khi lấy picks của entry ${entryId} GW${gameweek}:`, error);
        return null;
    }
}

async function fetchGameweekLive(gameweek, useCache = true) {
    const cacheKey = `fplCache_live_gw_${gameweek}`;
    
    // Check cache first for completed gameweeks
    if (useCache) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    }
    
    try {
        const data = await fetchWithProxy(`/event/${gameweek}/live/`);
        if (!data || !data.elements) {
            return null;
        }
        
        const elements = data.elements;
        
        // Only cache essential player data to save space
        const essentialData = elements.map(player => ({
            id: player.id,
            stats: {
                total_points: player.stats.total_points
            }
        }));
        
        // Cache the result
        try {
            localStorage.setItem(cacheKey, JSON.stringify(essentialData));
        } catch (cacheError) {
            if (cacheError.name === 'QuotaExceededError') {
                console.warn('Cache live data đầy, đang dọn dẹp...');
                clearOldestCaches('fplCache_live_');
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(essentialData));
                } catch (retryError) {
                    console.error('Không thể lưu cache live data:', retryError.message);
                }
            }
        }
        
        return essentialData;
    } catch (error) {
        console.error(`Lỗi khi lấy live data GW${gameweek}:`, error);
        return null;
    }
}

// Initialize gameweek selector
async function initializeGameweekSelector() {
    try {
        const bootstrapData = await fetchBootstrapData();
        
        // Check if bootstrapData and events exist
        if (!bootstrapData || !bootstrapData.events || !Array.isArray(bootstrapData.events)) {
            console.error('Invalid bootstrap data');
            return 1; // Return default GW 1
        }
        
        const gameweeks = bootstrapData.events;
        const currentGW = gameweeks.find(gw => gw.is_current);
        
        const select = document.getElementById('gameweekSelect');
        if (!select) {
            console.error('gameweekSelect element not found');
            return currentGW ? currentGW.id : gameweeks[gameweeks.length - 1].id;
        }
        
        select.innerHTML = '<option value="">-- Chọn tuần --</option>';
        
        gameweeks.forEach(gw => {
            const option = document.createElement('option');
            option.value = gw.id;
            option.textContent = `GW ${gw.id}${gw.is_current ? ' (Hiện tại)' : ''}`;
            if (gw.is_current) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        return currentGW ? currentGW.id : gameweeks[gameweeks.length - 1].id;
    } catch (error) {
        console.error('Lỗi khởi tạo gameweek selector:', error);
        return 1;
    }
}

// Load user leagues
async function loadUserLeagues(entryId, skipLeagueList = false) {
    console.log('Loading leagues for entry:', entryId);
    showLoading();
    currentEntryId = entryId;
    
    try {
        const userData = await fetchEntryData(entryId);
        console.log('User data loaded:', userData);
        
        // Load both classic and H2H leagues with type markers
        userLeagues = [
            ...(userData.leagues.classic || []).map(l => ({...l, type: 'classic'})),
            ...(userData.leagues.h2h || []).map(l => ({...l, type: 'h2h'}))
        ];
        
        // Save to localStorage for settings page
        localStorage.setItem('userLeagues', JSON.stringify(userLeagues));
        
        if (userLeagues.length === 0) {
            showError('Không tìm thấy league nào cho user này');
            return;
        }
        
        // Save entry ID and user data to localStorage
        localStorage.setItem('lastEntryId', entryId);
        localStorage.setItem('userName', `${userData.player_first_name} ${userData.player_last_name}`);
        localStorage.setItem('teamName', userData.name);
        
        // Show user info and hide input section
        updateUserInfo(userData, entryId);
        showElement('userInfo');
        hideElement('entryInputSection');
        
        // Only show league list if not skipping
        if (!skipLeagueList) {
            displayLeagueList(userLeagues);
        }
        hideLoading();
        
    } catch (error) {
        console.error('Error loading leagues:', error);
        showError(error.message);
    }
}

// Display league list
function displayLeagueList(leagues) {
    const container = document.getElementById('leagueList');
    container.innerHTML = '';
    
    // Hide league details and settings when showing league list
    hideElement('classicLeagueInfo');
    hideElement('h2hLeagueInfo');
    hideElement('standings');
    hideElement('h2hStandings');
    hideElement('leagueSettings');
    hideElement('summary');
    
    // Remove H2H matches wrapper if it exists
    const h2hMatchesContainer = document.getElementById('h2hMatchesContainer');
    if (h2hMatchesContainer) {
        h2hMatchesContainer.innerHTML = '';
    }
    
    // Clear history state when showing league list
    window.history.pushState({view: 'leagueList'}, '', window.location.pathname);
    
    // Hide the "Show Leagues" button when in league selector view
    const showLeaguesBtn = document.getElementById('showLeagues');
    if (showLeaguesBtn) {
        showLeaguesBtn.style.display = 'none';
    }
    
    leagues.forEach(league => {
        const card = document.createElement('div');
        card.className = 'league-card';
        card.dataset.leagueId = league.id;
        card.dataset.leagueType = league.type || (league.scoring === 'c' ? 'classic' : 'h2h');
        
        const leagueType = league.type === 'h2h' || league.scoring === 'h' ? 'H2H' : 'Classic';
        const leagueIcon = leagueType === 'H2H' ? '⚔️' : '🏆';
        
        card.innerHTML = `
            <div class="league-card-header">
                <div class="league-card-title">${leagueIcon} ${league.name}</div>
                <div class="league-card-type">${leagueType}</div>
            </div>
            <div class="league-card-info">
                <div class="league-card-rank">Hạng: ${league.entry_rank || 'N/A'}/${league.entry_count || 'N/A'}</div>
                <div>👥 ${league.entry_count || 0} người chơi</div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            // Remove previous selection
            document.querySelectorAll('.league-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            
            // Load selected league based on type
            if (card.dataset.leagueType === 'h2h') {
                loadH2HLeague(league.id, league.name);
            } else {
                loadLeague(league.id);
            }
        });
        
        container.appendChild(card);
    });
    
    showElement('leagueSelector');
}

// Load H2H league data
async function loadH2HLeague(leagueId, leagueName) {
    showLoading('Đang tải dữ liệu H2H league...');
    currentLeagueId = leagueId;
    
    // Hide league selector and previous data
    hideElement('leagueSelector');
    hideElement('classicLeagueInfo');
    hideElement('h2hLeagueInfo');
    hideElement('standings');
    hideElement('h2hStandings');
    hideElement('summary');
    hideElement('leagueSettings');
    
    // Show the "Show Leagues" button when in league detail view
    const showLeaguesBtn = document.getElementById('showLeagues');
    if (showLeaguesBtn) {
        showLeaguesBtn.style.display = '';
    }
    
    try {
        // Fetch H2H league standings
        const h2hData = await fetchH2HLeagueStandings(leagueId);
        
        if (!h2hData || !h2hData.standings || !h2hData.standings.results) {
            showError('Không thể tải dữ liệu H2H league');
            return;
        }
        
        // Initialize gameweek selector
        const currentGW = await initializeGameweekSelector();
        
        // Display H2H standings with matches
        await displayH2HStandings(h2hData, leagueName, currentGW);
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading H2H league:', error);
        showError(error.message || 'Lỗi khi tải H2H league');
    }
}

// Display H2H standings table
async function displayH2HStandings(h2hData, leagueName, initialGameweek) {
    const standings = h2hData.standings.results;
    
    // Get bootstrap data for gameweek list
    const bootstrapData = await fetchBootstrapData();
    
    // Check if bootstrapData is valid
    if (!bootstrapData || !bootstrapData.events || !Array.isArray(bootstrapData.events)) {
        console.error('Invalid bootstrap data in H2H standings');
        // Use fallback
        const currentGWId = initialGameweek || 1;
        displayH2HStandingsTable(standings, currentGWId);
        return;
    }
    
    const gameweeks = bootstrapData.events;
    const currentGW = gameweeks.find(gw => gw.is_current);
    const currentGWId = currentGW ? currentGW.id : gameweeks[gameweeks.length - 1].id;
    
    // Create info section with gameweek selector
    const leagueInfoEl = document.getElementById('h2hLeagueInfo');
    leagueInfoEl.innerHTML = `
        <div class="league-header">
            <div>
                <h2>⚔️ ${leagueName || 'H2H League'}</h2>
                <div class="gw-info-inline">
                    <span class="gw-range-label">League H2H</span>
                    <span class="gw-remaining">${standings.length} người chơi</span>
                </div>
            </div>
            <div class="league-actions">
                <select id="h2hGameweekSelect" class="gameweek-select-compact">
                    ${gameweeks.map(gw => `
                        <option value="${gw.id}" ${gw.id === initialGameweek ? 'selected' : ''}>
                            GW ${gw.id}${gw.is_current ? ' (Hiện tại)' : ''}
                        </option>
                    `).join('')}
                </select>
            </div>
        </div>
    `;
    showElement('h2hLeagueInfo');
    
    // Push state for browser back button
    window.history.pushState({view: 'league', leagueId: currentLeagueId}, '', `#league-${currentLeagueId}`);
    
    // Display matches section first
    await displayH2HMatchesSection(initialGameweek);
    
    // Build H2H standings table using separate element
    const tbody = document.getElementById('h2hStandingsBody');
    tbody.innerHTML = '';
    
    standings.forEach((entry, index) => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>
                <div class="rank-cell">
                    <strong>${entry.rank}</strong>
                </div>
            </td>
            <td>
                <div class="player-cell">
                    <span class="player-name">${entry.player_name}</span>
                    <span class="team-name">${entry.entry_name}</span>
                </div>
            </td>
            <td style="text-align: center;">${entry.matches_played || 0}</td>
            <td style="text-align: center;">${entry.matches_won || 0}</td>
            <td style="text-align: center;">${entry.matches_drawn || 0}</td>
            <td style="text-align: center;">${entry.matches_lost || 0}</td>
            <td style="text-align: center;"><strong>${entry.points_for || 0}</strong></td>
            <td style="text-align: center;">${entry.points_against || 0}</td>
            <td style="text-align: center; font-weight: 600;">${entry.total || 0}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Show H2H standings section
    showElement('h2hStandings');
}

// Display H2H matches section with gameweek selector
async function displayH2HMatchesSection(initialGameweek) {
    // Use dedicated H2H matches container
    const matchesContainer = document.getElementById('h2hMatchesContainer');
    
    // Check if h2h-matches-wrapper already exists, remove it
    let matchesWrapper = matchesContainer.querySelector('#h2h-matches-wrapper');
    if (matchesWrapper) {
        matchesWrapper.remove();
    }
    
    // Create new matches wrapper
    matchesWrapper = document.createElement('div');
    matchesWrapper.id = 'h2h-matches-wrapper';
    matchesWrapper.className = 'h2h-matches-section';
    matchesWrapper.innerHTML = `
        <h3>⚽ Kết quả các trận đấu GW<span id="currentH2HGW">${initialGameweek}</span></h3>
        <div id="h2hMatchesList" class="h2h-matches-container">
            <div class="loading-matches">Đang tải...</div>
        </div>
    `;
    
    // Insert into H2H container
    matchesContainer.appendChild(matchesWrapper);
    
    // Load initial matches
    await loadH2HMatches(currentLeagueId, initialGameweek);
    
    // Setup H2H gameweek selector listener
    const gwSelect = document.getElementById('h2hGameweekSelect');
    if (gwSelect) {
        // Clone to remove all listeners
        const newGwSelect = gwSelect.cloneNode(true);
        gwSelect.parentNode.replaceChild(newGwSelect, gwSelect);
        
        // Add new listener for H2H
        newGwSelect.addEventListener('change', async (e) => {
            const selectedGW = parseInt(e.target.value);
            const gwDisplay = document.getElementById('currentH2HGW');
            if (gwDisplay) {
                gwDisplay.textContent = selectedGW;
            }
            await loadH2HMatches(currentLeagueId, selectedGW);
        });
    }
}

// Load and display H2H matches for a specific gameweek
async function loadH2HMatches(leagueId, gameweek) {
    const container = document.getElementById('h2hMatchesList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-matches">Đang tải...</div>';
    
    console.log('Loading H2H matches for league:', leagueId, 'gameweek:', gameweek);
    
    try {
        const matchesData = await fetchH2HMatches(leagueId, gameweek);
        
        console.log('H2H matches data:', matchesData);
        
        if (!matchesData) {
            container.innerHTML = '<div class="no-matches">Dữ liệu trận đấu H2H hiện không khả dụng</div>';
            return;
        }
        
        // Handle different API response structures
        let matches = [];
        if (Array.isArray(matchesData)) {
            matches = matchesData;
        } else if (matchesData.results && Array.isArray(matchesData.results)) {
            matches = matchesData.results;
        }
        
        if (matches.length === 0) {
            container.innerHTML = '<div class="no-matches">Không có trận đấu nào trong gameweek này hoặc API không hỗ trợ</div>';
            return;
        }
        
        let matchesHTML = '<div class="matches-grid">';
        
        matches.forEach((match, index) => {
            // Log first match to see structure
            if (index === 0) {
                console.log('Sample match data:', match);
                console.log('Match keys:', Object.keys(match));
            }
            
            const entry1Name = match.entry_1_name || match.entry1_name || 'N/A';
            const entry2Name = match.entry_2_name || match.entry2_name || 'N/A';
            const entry1Player = match.entry_1_player_name || match.entry1_player_name || '';
            const entry2Player = match.entry_2_player_name || match.entry2_player_name || '';
            
            // Check if match has been played - try different field names
            const hasStarted = match.started === true || match.has_started === true;
            const hasFinished = match.finished === true || match.finished_time !== null || match.event_day !== null;
            
            let scoreDisplay = '';
            let matchClass = 'match-card';
            
            // Try different field names for points
            const score1 = match.entry_1_points || match.entry1_points || match.entry_1_total || 0;
            const score2 = match.entry_2_points || match.entry2_points || match.entry_2_total || 0;
            
            if (hasFinished) {
                scoreDisplay = `<div class="match-score">${score1} - ${score2}</div>`;
                
                // Determine winner
                if (score1 > score2) {
                    matchClass += ' winner-left';
                } else if (score2 > score1) {
                    matchClass += ' winner-right';
                } else {
                    matchClass += ' draw';
                }
            } else if (hasStarted) {
                scoreDisplay = `<div class="match-score live">${score1} - ${score2} <span class="live-badge">LIVE</span></div>`;
                matchClass += ' match-live';
            } else {
                scoreDisplay = '<div class="match-score not-started">-</div>';
                matchClass += ' match-not-started';
            }
            
            matchesHTML += `
                <div class="${matchClass}">
                    <div class="match-team match-team-left">
                        <div class="team-name">${entry1Name}</div>
                        <div class="player-name">${entry1Player}</div>
                    </div>
                    ${scoreDisplay}
                    <div class="match-team match-team-right">
                        <div class="team-name">${entry2Name}</div>
                        <div class="player-name">${entry2Player}</div>
                    </div>
                </div>
            `;
        });
        
        matchesHTML += '</div>';
        container.innerHTML = matchesHTML;
        
    } catch (error) {
        console.error('Error loading H2H matches:', error);
        container.innerHTML = '<div class="error-matches">Lỗi khi tải dữ liệu trận đấu</div>';
    }
}

// Load league data
async function loadLeague(leagueId) {
    showLoading();
    currentLeagueId = leagueId;
    
    // Hide league selector and previous data
    hideElement('leagueSelector');
    hideElement('standings');
    hideElement('summary');
    
    // Show the "Show Leagues" button when in league detail view
    const showLeaguesBtn = document.getElementById('showLeagues');
    if (showLeaguesBtn) {
        showLeaguesBtn.style.display = '';
    }
    
    try {
        // Fetch league standings
        const data = await fetchLeagueStandings(leagueId);
        leagueData = data;
        
        // Save current league info to localStorage for settings navigation
        localStorage.setItem('currentLeagueId', leagueId);
        localStorage.setItem('currentLeagueName', data.league.name);
        localStorage.setItem('currentLeaguePlayerCount', data.standings.results.length);
        
        // Display league name
        const leagueNameEl = document.getElementById('leagueName');
        if (leagueNameEl) {
            leagueNameEl.textContent = data.league.name;
        }
        showElement('classicLeagueInfo');
        
        // Push state for browser back button
        window.history.pushState({view: 'league', leagueId: leagueId}, '', `#league-${leagueId}`);
        
        // Initialize gameweek selector
        const currentGW = await initializeGameweekSelector();
        currentGameweek = currentGW;
        
        // Reset gameweek data for new league
        allGameweeksData = {};
        
        // Load all entries' history for the current gameweek
        await loadGameweekData(currentGW);
        
        hideLoading();
        
    } catch (error) {
        showError(error.message);
    }
}

// Load gameweek specific data
async function loadGameweekData(gameweek) {
    showLoading('Đang tải dữ liệu các gameweeks...');
    currentGameweek = gameweek;
    
    try {
        // Get bootstrap data to check which GWs are finished
        const bootstrapData = await fetchBootstrapData();
        
        // Check if bootstrapData is valid and get current GW
        let currentGWId = gameweek; // Default to parameter
        if (bootstrapData && bootstrapData.events && Array.isArray(bootstrapData.events)) {
            const currentGWInfo = bootstrapData.events.find(e => e.is_current);
            currentGWId = currentGWInfo ? currentGWInfo.id : gameweek;
        } else {
            console.error('Invalid bootstrap data, using gameweek from parameter');
        }
        
        // If we don't have full history yet, load all gameweeks data
        if (!allGameweeksData['fullHistory']) {
            const standings = leagueData.standings.results;
            const allEntriesHistory = {};
            const totalEntries = standings.length;
            
            // Fetch history for each entry (with progress)
            updateProgress(10, 'Đang tải dữ liệu người chơi...');
            for (let i = 0; i < standings.length; i++) {
                const standing = standings[i];
                const progress = 10 + Math.round(((i + 1) / totalEntries) * 30); // 10-40% for loading data
                updateProgress(progress, `Đang tải dữ liệu người chơi ${i + 1}/${totalEntries}...`);
                
                const history = await fetchEntryHistory(standing.entry);
                if (history && history.current) {
                    allEntriesHistory[standing.entry] = {
                        playerName: standing.player_name,
                        entryName: standing.entry_name,
                        history: history.current
                    };
                }
                
                // Small delay to prevent rate limiting
                if (i < standings.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            updateProgress(45, 'Đang xử lý dữ liệu các gameweeks...');
            
            // Calculate ranks for all gameweeks
            const totalGW = gameweek;
            
            for (let gw = 1; gw <= gameweek; gw++) {
                const gwProgress = 45 + Math.round((gw / totalGW) * 50); // 45-95% for processing
                updateProgress(gwProgress, `Đang xử lý GW ${gw}/${totalGW}...`);
                
                // Check if we have cached data for this GW (only for completed GWs)
                const isCompletedGW = gw < currentGWId;
                let gwData = null;
                
                if (isCompletedGW) {
                    gwData = getCachedGWData(currentLeagueId, gw);
                }
                
                if (!gwData) {
                    // Build gwData from history
                    gwData = [];
                    
                    Object.keys(allEntriesHistory).forEach(entryId => {
                        const entryData = allEntriesHistory[entryId];
                        
                        // Check if history exists
                        if (!entryData || !entryData.history || !Array.isArray(entryData.history)) {
                            return;
                        }
                        
                        const gwHistory = entryData.history.find(h => h.event === gw);
                        
                        if (gwHistory) {
                            // Calculate total transfers up to this GW
                            let totalTransfers = 0;
                            entryData.history.forEach(h => {
                                if (h.event <= gw) {
                                    totalTransfers += h.event_transfers || 0;
                                }
                            });
                            
                            gwData.push({
                                entry: parseInt(entryId),
                                playerName: entryData.playerName,
                                entryName: entryData.entryName,
                                gwPoints: gwHistory.points,
                                totalPoints: gwHistory.total_points,
                                gwRank: gwHistory.rank,
                                totalTransfers: totalTransfers,
                                // Tiebreaker stats will be loaded on-demand
                                captainPoints: null,
                                vicePoints: null,
                                benchPoints: null
                            });
                        }
                    });
                    
                    // Sort and rank - will load picks if needed
                    await sortAndRankGWData(gwData, gw, currentGWId);
                    
                    // Cache completed gameweeks
                    if (isCompletedGW) {
                        setCachedGWData(currentLeagueId, gw, gwData);
                    }
                }
                
                allGameweeksData[gw] = gwData;
                
                // Small delay to keep UI responsive
                if (gw < gameweek) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            allGameweeksData['fullHistory'] = true;
            updateProgress(100, 'Hoàn thành!');
        }
        
        await displayStandings(gameweek);
        hideLoading();
        
    } catch (error) {
        console.error('Error loading gameweek data:', error);
        showError(`Lỗi khi tải dữ liệu GW${gameweek}: ${error.message}`);
    }
}

// Sort and rank GW data, loading picks only when needed for tiebreaker
async function sortAndRankGWData(gwData, gw, currentGWId) {
    const isCurrentGW = gw === currentGWId;
    const useCache = !isCurrentGW; // Don't use cache for current GW as it may change
    
    // First pass: identify entries with duplicate GW points
    const gwPointsGroups = {};
    gwData.forEach(entry => {
        const points = entry.gwPoints;
        if (!gwPointsGroups[points]) {
            gwPointsGroups[points] = [];
        }
        gwPointsGroups[points].push(entry);
    });
    
    // Find groups with duplicates that need tiebreaker
    const needTiebreakerEntries = [];
    Object.keys(gwPointsGroups).forEach(points => {
        if (gwPointsGroups[points].length > 1) {
            needTiebreakerEntries.push(...gwPointsGroups[points]);
        }
    });
    
    // Load picks and calculate tiebreaker stats only for entries with duplicate points
    if (needTiebreakerEntries.length > 0) {
        // Load live data for this gameweek
        const liveData = await fetchGameweekLive(gw, useCache);
        const playersPointsMap = {};
        if (liveData) {
            liveData.forEach(player => {
                playersPointsMap[player.id] = player.stats.total_points;
            });
        }
        
        // Load picks for entries that need tiebreaker
        for (const entry of needTiebreakerEntries) {
            const picks = await fetchEntryPicks(entry.entry, gw, useCache);
            
            if (picks && picks.picks && playersPointsMap) {
                let captainPoints = 0;
                let vicePoints = 0;
                let benchPoints = 0;
                
                picks.picks.forEach(pick => {
                    const playerPoints = playersPointsMap[pick.element] || 0;
                    
                    // Captain (multiplier 2 or 3)
                    if (pick.multiplier > 1 && pick.is_captain) {
                        captainPoints = playerPoints;
                    }
                    // Vice captain
                    if (pick.is_vice_captain) {
                        vicePoints = playerPoints;
                    }
                    // Bench players (position > 11)
                    if (pick.position > 11) {
                        benchPoints += playerPoints;
                    }
                });
                
                // Update entry with tiebreaker stats
                entry.captainPoints = captainPoints;
                entry.vicePoints = vicePoints;
                entry.benchPoints = benchPoints;
            }
            
            // Small delay to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    
    // Sort by GW points with tiebreaker and add rank for payment calculation
    const gwDataForRank = [...gwData].sort((a, b) => compareTiebreakerGW(a, b));
    gwDataForRank.forEach((entry, index) => {
        const originalEntry = gwData.find(e => e.entry === entry.entry);
        originalEntry.rank = index + 1; // Rank by GW points for payment
    });
    
    // For total points ranking, identify duplicate total points
    const totalPointsGroups = {};
    gwData.forEach(entry => {
        const points = entry.totalPoints;
        if (!totalPointsGroups[points]) {
            totalPointsGroups[points] = [];
        }
        totalPointsGroups[points].push(entry);
    });
    
    // Sort by total points with tiebreaker and add rankByTotal for display
    gwData.sort((a, b) => compareTiebreakerTotal(a, b));
    gwData.forEach((entry, index) => {
        entry.rankByTotal = index + 1; // Rank by total points for display
    });
}

// Tiebreaker comparison function for GW ranking (for payment)
// Returns: negative if a should rank higher, positive if b should rank higher, 0 if equal
function compareTiebreakerGW(a, b) {
    // 1. Compare by GW points
    const pointsDiff = b.gwPoints - a.gwPoints;
    if (pointsDiff !== 0) return pointsDiff;
    
    // Points are equal, apply tiebreaker rules (if stats are available):
    
    // If tiebreaker stats are not loaded, consider them equal
    if (a.captainPoints === null || b.captainPoints === null) {
        return 0;
    }
    
    // 2. Captain points (higher is better)
    const captainDiff = b.captainPoints - a.captainPoints;
    if (captainDiff !== 0) return captainDiff;
    
    // 3. Vice captain points (higher is better)
    const viceDiff = b.vicePoints - a.vicePoints;
    if (viceDiff !== 0) return viceDiff;
    
    // 4. Bench points (higher is better)
    const benchDiff = b.benchPoints - a.benchPoints;
    if (benchDiff !== 0) return benchDiff;
    
    // 5. Total points - LOWER is better (người có tổng điểm thấp hơn được ưu tiên)
    const totalDiff = a.totalPoints - b.totalPoints;
    return totalDiff;
}

// Tiebreaker comparison function for Total ranking (for display)
// Returns: negative if a should rank higher, positive if b should rank higher, 0 if equal
function compareTiebreakerTotal(a, b) {
    // 1. Compare by total points
    const pointsDiff = b.totalPoints - a.totalPoints;
    if (pointsDiff !== 0) return pointsDiff;
    
    // Points are equal, apply tiebreaker rule:
    // 2. Total transfers - LOWER is better (ai transfer ít hơn xếp trên)
    const transfersDiff = a.totalTransfers - b.totalTransfers;
    return transfersDiff;
}

// Calculate cumulative payment for an entry up to a specific gameweek
function calculateCumulativePayment(entry, upToGameweek, settings) {
    let cumulative = 0;
    
    // Use startGW from settings, default to 1
    const startGW = settings.startGW || 1;
    
    // Calculate based on all loaded gameweeks from startGW
    for (let gw = startGW; gw <= upToGameweek; gw++) {
        const gwData = allGameweeksData[gw];
        if (gwData) {
            const entryInGW = gwData.find(e => e.entry === entry.entry);
            if (entryInGW) {
                const payment = settings.rankPayments[entryInGW.rank] || 0;
                cumulative += payment;
            }
        }
    }
    
    return cumulative;
}

// Sort table data
function sortTableData(data, column, direction) {
    return [...data].sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        // Special handling for rankByTotal - always use numeric comparison
        if (column === 'rankByTotal') {
            const diff = parseInt(aVal) - parseInt(bVal);
            return direction === 'asc' ? diff : -diff;
        }
        
        // Handle string comparison
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (direction === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
    });
}

// Display league settings info
async function displayLeagueSettings(currentGameweek, sortedData) {
    const settings = loadSettings();
    const startGW = settings.startGW || 1;
    const endGW = settings.endGW || 38;
    
    // GW Range - with null checks
    const gwRangeInfo = document.getElementById('gwRangeInfo');
    if (gwRangeInfo) {
        gwRangeInfo.textContent = `GW${startGW} - GW${endGW}`;
    }
    
    const remainingGWs = Math.max(0, endGW - currentGameweek);
    const remainingGWsEl = document.getElementById('remainingGWs');
    if (remainingGWsEl) {
        remainingGWsEl.textContent = `Còn ${remainingGWs} vòng`;
    }
    
    // Combined Awards List (Prize + Current Winner)
    const mainAwardsHTML = [];
    const secondaryAwardsHTML = [];
    
    // Check if league has ended
    const isLeagueEnded = currentGameweek >= endGW;
    const provisionalText = isLeagueEnded ? '' : ' <span style="font-size: 0.8rem; color: #6b7280; font-style: italic;">(tạm tính)</span>';
    
    // Sort by total points
    const byTotalPoints = sortedData.length > 0 ? [...sortedData].sort((a, b) => b.totalPoints - a.totalPoints) : [];
    
    // Prepare individual award items
    let championHTML = '';
    let secondHTML = '';
    let thirdHTML = '';
    
    // Champion award (combined with first place)
    if (settings.prizeChampion > 0 || settings.prize1st > 0) {
        const champion = byTotalPoints[0] || null;
        const totalPrize = (settings.prizeChampion || 0) + (settings.prize1st || 0);
        const cupText = settings.prizeChampion > 0 ? ' + Cúp Vô Địch' : '';
        championHTML = `
            <div class="award-item champion">
                <div class="award-icon">🏆</div>
                <div class="award-info">
                    <div class="award-title">Vô Địch${provisionalText}</div>
                    <div class="award-amount">${formatCurrency(totalPrize)}${cupText}</div>
                </div>
                <div class="award-winner">
                    ${champion ? `
                        <div class="winner-info">
                            <span class="winner-name">${champion.playerName}</span>
                            <span class="winner-team">(${champion.entryName})</span>
                        </div>
                        <div class="winner-points">${champion.totalPoints} điểm</div>
                    ` : '<div class="winner-tbd">Chưa xác định</div>'}
                </div>
            </div>
        `;
    }
    
    // Second place
    if (settings.prize2nd > 0) {
        const second = byTotalPoints[1] || null;
        secondHTML = `
            <div class="award-item second">
                <div class="award-icon">🥈</div>
                <div class="award-info">
                    <div class="award-title">Giải Nhì${provisionalText}</div>
                    <div class="award-amount">${formatCurrency(settings.prize2nd)}</div>
                </div>
                <div class="award-winner">
                    ${second ? `
                        <div class="winner-info">
                            <span class="winner-name">${second.playerName}</span>
                            <span class="winner-team">(${second.entryName})</span>
                        </div>
                        <div class="winner-points">${second.totalPoints} điểm</div>
                    ` : '<div class="winner-tbd">Chưa xác định</div>'}
                </div>
            </div>
        `;
    }
    
    // Third place
    if (settings.prize3rd > 0) {
        const third = byTotalPoints[2] || null;
        thirdHTML = `
            <div class="award-item third">
                <div class="award-icon">🥉</div>
                <div class="award-info">
                    <div class="award-title">Giải Ba${provisionalText}</div>
                    <div class="award-amount">${formatCurrency(settings.prize3rd)}</div>
                </div>
                <div class="award-winner">
                    ${third ? `
                        <div class="winner-info">
                            <span class="winner-name">${third.playerName}</span>
                            <span class="winner-team">(${third.entryName})</span>
                        </div>
                        <div class="winner-points">${third.totalPoints} điểm</div>
                    ` : '<div class="winner-tbd">Chưa xác định</div>'}
                </div>
            </div>
        `;
    }
    
    // Add to mainAwardsHTML in order: 2nd, Champion, 3rd for podium layout
    if (secondHTML) mainAwardsHTML.push(secondHTML);
    if (championHTML) mainAwardsHTML.push(championHTML);
    if (thirdHTML) mainAwardsHTML.push(thirdHTML);
    
    // H2H Prize (Secondary Awards)
    if (settings.prizeH2H > 0 && settings.h2hLeagueId) {
        // Fetch H2H league data
        let h2hWinner = null;
        try {
            const h2hData = await fetchH2HLeagueStandings(settings.h2hLeagueId);
            if (h2hData && h2hData.standings && h2hData.standings.results && h2hData.standings.results.length > 0) {
                const topEntry = h2hData.standings.results[0];
                h2hWinner = {
                    playerName: topEntry.player_name,
                    entryName: topEntry.entry_name,
                    rank: topEntry.rank,
                    points: topEntry.points_for
                };
            }
        } catch (error) {
            console.error('Error loading H2H winner:', error);
        }
        
        secondaryAwardsHTML.push(`
            <div class="award-item" style="border-color: #f59e0b; background: linear-gradient(135deg, #fffbeb, #fef3c7);">
                <div class="award-icon">⚔️</div>
                <div class="award-info">
                    <div class="award-title">Vô Địch H2H${provisionalText}</div>
                    <div class="award-subtitle">${settings.h2hLeagueName || 'H2H League'}</div>
                    <div class="award-amount">${formatCurrency(settings.prizeH2H)}</div>
                </div>
                <div class="award-winner">
                    ${h2hWinner ? `
                        <div class="winner-info">
                            <span class="winner-name">${h2hWinner.playerName}</span>
                            <span class="winner-team">(${h2hWinner.entryName})</span>
                        </div>
                        <div class="winner-points">Hạng ${h2hWinner.rank} - ${h2hWinner.points} điểm</div>
                    ` : '<div class="winner-tbd">Đang tải...</div>'}
                </div>
            </div>
        `);
    }
    
    // Stage prizes (Secondary Awards)
    if (settings.stages && settings.stages.length > 0) {
        settings.stages.forEach(stage => {
            if (stage.prize > 0) {
                const stageWinner = findStageWinner(stage, currentGameweek);
                const isStageEnded = currentGameweek >= stage.endGW;
                const stageProvisionalText = isStageEnded ? '' : ' <span style="font-size: 0.8rem; color: #6b7280; font-style: italic;">(tạm tính)</span>';
                
                secondaryAwardsHTML.push(`
                    <div class="award-item stage">
                        <div class="award-icon">🏅</div>
                        <div class="award-info">
                            <div class="award-title">${stage.name}${stageProvisionalText}</div>
                            <div class="award-subtitle">GW${stage.startGW} - GW${stage.endGW}</div>
                            <div class="award-amount">${formatCurrency(stage.prize)}</div>
                        </div>
                        <div class="award-winner">
                            ${stageWinner ? `
                                <div class="winner-info">
                                    <span class="winner-name">${stageWinner.playerName}</span>
                                    <span class="winner-team">(${stageWinner.entryName})</span>
                                </div>
                                <div class="winner-points">GW${stageWinner.gw}: ${stageWinner.points} điểm</div>
                            ` : '<div class="winner-tbd">Chưa xác định</div>'}
                        </div>
                    </div>
                `);
            }
        });
    }
    
    // Build final HTML with sections
    let finalHTML = '';
    
    if (mainAwardsHTML.length > 0) {
        finalHTML += `<div class="awards-main-section">${mainAwardsHTML.join('')}</div>`;
    }
    
    if (secondaryAwardsHTML.length > 0) {
        finalHTML += `
            <div class="awards-secondary-section">
                <div class="awards-section-divider">
                    <span>Giải Phụ</span>
                </div>
                ${secondaryAwardsHTML.join('')}
            </div>
        `;
    }
    
    if (mainAwardsHTML.length === 0 && secondaryAwardsHTML.length === 0) {
        finalHTML = '<div class="settings-info-sub">Chưa cấu hình giải thưởng</div>';
    }
    
    document.getElementById('awardsList').innerHTML = finalHTML;
    
    showElement('leagueSettings');
}

// Find winner for a stage (highest single GW score in the range)
function findStageWinner(stage, currentGameweek) {
    let maxPoints = 0;
    let winner = null;
    
    // Only check GWs that have passed
    const endGW = Math.min(stage.endGW, currentGameweek);
    
    // Check each GW in the stage range
    for (let gw = stage.startGW; gw <= endGW; gw++) {
        const gwData = allGameweeksData[gw];
        if (gwData && gwData.length > 0) {
            gwData.forEach(entry => {
                if (entry.gwPoints > maxPoints) {
                    maxPoints = entry.gwPoints;
                    winner = {
                        ...entry,
                        gw: gw,
                        points: entry.gwPoints
                    };
                }
            });
        }
    }
    
    return winner;
}

// Display standings table
async function displayStandings(gameweek) {
    const settings = loadSettings();
    let data = allGameweeksData[gameweek];
    
    if (!data || data.length === 0) {
        showError('Không có dữ liệu cho gameweek này');
        return;
    }
    
    const currentGWEl = document.getElementById('currentGW');
    if (currentGWEl) {
        currentGWEl.textContent = gameweek;
    }
    
    // Calculate cumulative payments and add to data
    data = data.map(entry => ({
        ...entry,
        payment: settings.rankPayments[entry.rank] || 0,
        cumulativePayment: calculateCumulativePayment(entry, gameweek, settings)
    }));
    
    // rankByTotal is already calculated in loadUserLeagues based on total points
    
    // Calculate rank changes from previous gameweek based on total points
    const previousGW = gameweek - 1;
    const previousGWData = previousGW > 0 ? allGameweeksData[previousGW] : null;
    
    // Map to store previous ranks by total points
    const previousRanks = {};
    if (previousGWData) {
        const prevSorted = [...previousGWData].sort((a, b) => b.totalPoints - a.totalPoints);
        prevSorted.forEach((entry, index) => {
            previousRanks[entry.entry] = index + 1;
        });
    }
    
    // Apply sorting
    const sortedData = sortTableData(data, currentSortColumn, currentSortDirection);
    
    const tbody = document.getElementById('standingsBody');
    tbody.innerHTML = '';
    
    let totalFund = 0;
    
    sortedData.forEach(entry => {
        totalFund += entry.payment;
        
        // Calculate rank change based on total points ranking
        let rankChange = '';
        if (previousRanks[entry.entry]) {
            const prevRank = previousRanks[entry.entry];
            const currentRank = entry.rankByTotal;
            const change = prevRank - currentRank; // Positive means improved (went up)
            
            if (change > 0) {
                rankChange = `<span class="rank-change up">↑ ${change}</span>`;
            } else if (change < 0) {
                rankChange = `<span class="rank-change down">↓ ${Math.abs(change)}</span>`;
            } else {
                rankChange = `<span class="rank-change same">—</span>`;
            }
        }
        
        // Check if there are other entries with same GW points (need to show tiebreaker)
        const sameGWPoints = data.filter(e => e.gwPoints === entry.gwPoints);
        let gwPointsDisplay = `<strong>${entry.gwPoints}</strong>`;
        if (sameGWPoints.length > 1 && entry.captainPoints !== null) {
            gwPointsDisplay += `<div class="tiebreaker-info">C:${entry.captainPoints} | V:${entry.vicePoints} | B:${entry.benchPoints}</div>`;
        }
        
        // Check if there are other entries with same total points (need to show tiebreaker)
        const sameTotalPoints = data.filter(e => e.totalPoints === entry.totalPoints);
        let totalPointsDisplay = `${entry.totalPoints}`;
        if (sameTotalPoints.length > 1) {
            totalPointsDisplay += `<div class="tiebreaker-info">Transfers: ${entry.totalTransfers}</div>`;
        }
        
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>
                <div class="rank-cell">
                    <strong>${entry.rankByTotal}</strong>
                    ${rankChange}
                </div>
            </td>
            <td>
                <div class="player-cell">
                    <span class="player-name">${entry.playerName}</span>
                    <span class="team-name">${entry.entryName}</span>
                </div>
            </td>
            <td>${gwPointsDisplay}</td>
            <td>${totalPointsDisplay}</td>
            <td class="money">${formatCurrency(entry.payment)}</td>
            <td class="money"><strong>${formatCurrency(entry.cumulativePayment)}</strong></td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Update sort indicators
    updateSortIndicators();
    
    // Calculate total league fund (all GWs)
    let totalLeagueFund = 0;
    for (let gw = 1; gw <= gameweek; gw++) {
        const gwData = allGameweeksData[gw];
        if (gwData && Array.isArray(gwData)) {
            gwData.forEach(entry => {
                const payment = settings.rankPayments[entry.rank] || 0;
                totalLeagueFund += payment;
            });
        }
    }
    
    // Update summary
    const totalGWFundEl = document.getElementById('totalGWFund');
    const totalLeagueFundEl = document.getElementById('totalLeagueFund');
    const totalPlayersEl = document.getElementById('totalPlayers');
    
    if (totalGWFundEl) totalGWFundEl.textContent = formatCurrency(totalFund);
    if (totalLeagueFundEl) totalLeagueFundEl.textContent = formatCurrency(totalLeagueFund);
    if (totalPlayersEl) totalPlayersEl.textContent = sortedData.length;
    
    // Update user stats if current entry is in the league
    const userEntry = sortedData.find(entry => entry.entry === currentEntryId);
    if (userEntry) {
        const userData = {
            player_first_name: localStorage.getItem('userName')?.split(' ')[0] || '',
            player_last_name: localStorage.getItem('userName')?.split(' ').slice(1).join(' ') || '',
            name: localStorage.getItem('teamName') || ''
        };
        const userStats = {
            rank: userEntry.rank,
            totalPoints: userEntry.totalPoints,
            totalPayment: userEntry.cumulativePayment
        };
        updateUserInfo(userData, currentEntryId, userStats);
    }
    
    // Display league settings info
    await displayLeagueSettings(gameweek, sortedData);
    
    showElement('standings');
    displaySummary();
}

// Update sort indicators in table headers
function updateSortIndicators() {
    const headers = document.querySelectorAll('#standingsTable th[data-sort]');
    headers.forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.sort === currentSortColumn) {
            header.classList.add(`sort-${currentSortDirection}`);
        }
    });
}

// Display cumulative summary
function displaySummary() {
    // Just show the summary section
    showElement('summary');
}

// Load last used entry ID on page load and auto-load leagues
window.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded');
    
    // Setup event listeners
    const loadUserBtn = document.getElementById('loadUser');
    const changeUserBtn = document.getElementById('changeUser');
    const showLeaguesBtn = document.getElementById('showLeagues');
    const gameweekSelect = document.getElementById('gameweekSelect');
    
    console.log('Load user button:', loadUserBtn);
    console.log('Change user button:', changeUserBtn);
    
    if (loadUserBtn) {
        loadUserBtn.addEventListener('click', () => {
            console.log('Load user button clicked');
            const entryId = document.getElementById('entryId').value.trim();
            if (!entryId) {
                showError('Vui lòng nhập Entry ID');
                return;
            }
            
            // Reset data
            allGameweeksData = {};
            hideElement('leagueInfo');
            hideElement('standings');
            hideElement('summary');
            hideElement('leagueSelector');
            
            loadUserLeagues(entryId);
        });
    }
    
    if (showLeaguesBtn) {
        showLeaguesBtn.addEventListener('click', () => {
            console.log('Show leagues button clicked');
            // Hide league detail and show league selector
            hideElement('leagueInfo');
            hideElement('standings');
            hideElement('summary');
            
            // Show league list if we have leagues loaded
            if (userLeagues && userLeagues.length > 0) {
                displayLeagueList(userLeagues);
                showElement('leagueSelector');
            }
        });
    }
    
    if (changeUserBtn) {
        changeUserBtn.addEventListener('click', () => {
            console.log('Change user button clicked');
            // Show input section and hide user info
            hideElement('userInfo');
            showElement('entryInputSection');
            
            // Reset data
            allGameweeksData = {};
            hideElement('leagueInfo');
            hideElement('standings');
            hideElement('summary');
            hideElement('leagueSelector');
            
            // Clear input and focus
            document.getElementById('entryId').value = '232782';
            document.getElementById('entryId').focus();
        });
    }
    
    // Gameweek selector
    if (gameweekSelect) {
        gameweekSelect.addEventListener('change', (e) => {
            const gameweek = e.target.value;
            if (gameweek) {
                loadGameweekData(parseInt(gameweek));
            }
        });
    }
    
    // Add sort functionality to table headers
    document.addEventListener('click', async (e) => {
        const header = e.target.closest('th[data-sort]');
        if (!header) return;
        
        const column = header.dataset.sort;
        
        // Toggle direction if same column, otherwise reset to asc
        if (currentSortColumn === column) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = column;
            currentSortDirection = 'asc';
        }
        
        // Re-display with new sort
        if (currentGameweek && allGameweeksData[currentGameweek]) {
            await displayStandings(currentGameweek);
        }
    });
    
    // Check if returning from settings with a league to load
    const urlParams = new URLSearchParams(window.location.search);
    const returnToLeague = urlParams.get('returnToLeague');
    
    // Auto-load if entry ID exists
    const lastEntryId = localStorage.getItem('lastEntryId') || '232782';
    console.log('Last entry ID:', lastEntryId);
    
    document.getElementById('entryId').value = lastEntryId;
    
    // If returning from settings, load directly to league (skip league list)
    if (returnToLeague) {
        // Clear URL parameter
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Load user data but skip showing league list
        await loadUserLeagues(lastEntryId, true);
        
        // Load the league directly
        loadLeague(returnToLeague);
    } else {
        // Normal flow: show league list
        await loadUserLeagues(lastEntryId);
    }
});

// Handle browser back button
window.addEventListener('popstate', (event) => {
    // When user presses back button, return to league list
    if (userLeagues && userLeagues.length > 0) {
        displayLeagueList(userLeagues);
    }
});
