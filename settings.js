// Load settings from localStorage for specific league
async function loadSettings(leagueId = null) {
    // Use current league ID if not provided
    if (!leagueId) {
        leagueId = localStorage.getItem('currentLeagueId');
    }
    
    const playerCount = parseInt(localStorage.getItem('currentLeaguePlayerCount')) || 20;
    
    const defaultSettings = {
        maxRanks: playerCount,
        rankPayments: generateDefaultPayments(playerCount),
        startGW: 1,
        endGW: 38,
        prize1st: 0,
        prize2nd: 0,
        prize3rd: 0,
        prizeChampion: 0,
        prizeH2H: 0,
        prizeEncouragement: 0,
        encouragementName: '',
        h2hLeagueId: null,
        h2hLeagueName: '',
        stages: [],
        leagueHistory: []
    };
    
    if (!leagueId) {
        return defaultSettings;
    }
    
    // First check localStorage
    const savedSettings = localStorage.getItem(`fplSettings_${leagueId}`);
    if (savedSettings) {
        return JSON.parse(savedSettings);
    }
    
    // Try to load from default_settings.json
    try {
        const response = await fetch('default_settings.json');
        if (response.ok) {
            const defaultSettingsFile = await response.json();
            if (defaultSettingsFile[leagueId]) {
                console.log(`Loaded default settings for league ${leagueId} from file`);
                const fileSettings = defaultSettingsFile[leagueId];
                // Merge with default settings to ensure all fields exist
                return { ...defaultSettings, ...fileSettings, maxRanks: playerCount };
            }
        }
    } catch (e) {
        console.log('No default_settings.json found:', e.message);
    }
    
    // Return default settings
    return defaultSettings;
}

// Handle back button navigation
function setupBackButton() {
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            const leagueId = localStorage.getItem('currentLeagueId');
            if (leagueId) {
                // Return to the league view
                window.location.href = `index.html?returnToLeague=${leagueId}`;
            } else {
                // No league loaded, go to home
                window.location.href = 'index.html';
            }
        });
    }
}

// Format number with thousand separators
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Parse formatted number back to integer
function parseFormattedNumber(str) {
    return parseInt(str.replace(/\./g, '')) || 0;
}

// Add formatting to currency input
function addCurrencyFormatting(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    input.addEventListener('input', function(e) {
        // Get current cursor position
        const cursorPosition = this.selectionStart;
        const oldLength = this.value.length;
        
        // Remove all non-digit characters
        let value = this.value.replace(/\D/g, '');
        
        // Format with thousand separators
        if (value) {
            const formatted = formatNumber(parseInt(value));
            this.value = formatted;
            
            // Calculate new cursor position
            const newLength = formatted.length;
            const diff = newLength - oldLength;
            this.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
        } else {
            this.value = '';
        }
    });
    
    input.addEventListener('blur', function() {
        const value = parseFormattedNumber(this.value);
        this.value = formatNumber(value);
    });
    
    input.addEventListener('focus', function() {
        // Keep formatted value on focus for easier editing
        if (this.value === '0') {
            this.value = '';
        }
    });
}

// Generate default payments
function generateDefaultPayments(count) {
    const payments = {};
    for (let i = 1; i <= count; i++) {
        payments[i] = (i - 1) * 5000; // 0, 5k, 10k, 15k...
    }
    return payments;
}

// Save settings to localStorage for specific league
function saveSettings(settings, leagueId = null) {
    // Use current league ID if not provided
    if (!leagueId) {
        leagueId = localStorage.getItem('currentLeagueId');
    }
    
    if (!leagueId) {
        console.error('Cannot save settings: No league ID');
        return;
    }
    
    localStorage.setItem(`fplSettings_${leagueId}`, JSON.stringify(settings));
}

// Generate rank input fields
function generateRankInputs(maxRanks, currentPayments = {}) {
    const container = document.getElementById('rankConfig');
    container.innerHTML = '';
    
    for (let i = 1; i <= maxRanks; i++) {
        const div = document.createElement('div');
        div.className = 'rank-input';
        
        const label = document.createElement('label');
        label.textContent = `Hạng ${i}:`;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `rank${i}`;
        input.name = `rank${i}`;
        input.min = '0';
        input.step = '1000';
        input.value = currentPayments[i] || 0;
        input.placeholder = '0';
        
        div.appendChild(label);
        div.appendChild(input);
        container.appendChild(div);
    }
}

// Get current settings from form
function getFormSettings() {
    const playerCount = parseInt(document.getElementById('playerCount').value);
    const rankPayments = {};
    
    for (let i = 1; i <= playerCount; i++) {
        const input = document.getElementById(`rank${i}`);
        if (input) {
            rankPayments[i] = parseInt(input.value) || 0;
        }
    }
    
    // Collect stages
    const stages = [];
    const stageElements = document.querySelectorAll('.stage-item');
    stageElements.forEach((stageEl, index) => {
        const startGW = parseInt(stageEl.querySelector('.stage-start-gw').value) || 1;
        const endGW = parseInt(stageEl.querySelector('.stage-end-gw').value) || 1;
        const prize = parseFormattedNumber(stageEl.querySelector('.stage-prize').value);
        const name = stageEl.querySelector('.stage-name').value || `Chặng ${index + 1}`;
        
        stages.push({
            startGW,
            endGW,
            prize,
            name
        });
    });
    
    return {
        maxRanks: playerCount,
        rankPayments,
        startGW: parseInt(document.getElementById('startGW').value) || 1,
        endGW: parseInt(document.getElementById('endGW').value) || 38,
        prize1st: parseFormattedNumber(document.getElementById('prize1st').value),
        prize2nd: parseFormattedNumber(document.getElementById('prize2nd').value),
        prize3rd: parseFormattedNumber(document.getElementById('prize3rd').value),
        prizeChampion: parseFormattedNumber(document.getElementById('prizeChampion').value),
        prizeH2H: parseFormattedNumber(document.getElementById('prizeH2H').value),
        prizeEncouragement: parseFormattedNumber(document.getElementById('prizeEncouragement').value),
        encouragementName: document.getElementById('encouragementName').value || '',
        h2hLeagueId: document.getElementById('h2hLeague').value || null,
        h2hLeagueName: document.getElementById('h2hLeague').selectedOptions[0]?.text || '',
        stages,
        leagueHistory: getHistoryFromForm()
    };
}

// Calculate and update summary
function updateSummary() {
    const playerCount = parseInt(document.getElementById('playerCount').value);
    const startGW = parseInt(document.getElementById('startGW').value) || 1;
    const endGW = parseInt(document.getElementById('endGW').value) || 38;
    
    // Calculate total per GW
    let totalPerGW = 0;
    for (let i = 1; i <= playerCount; i++) {
        const input = document.getElementById(`rank${i}`);
        if (input) {
            totalPerGW += parseInt(input.value) || 0;
        }
    }
    
    // Calculate total GWs
    const totalGWs = Math.max(0, endGW - startGW + 1);
    
    // Calculate total league money
    const totalLeagueMoney = totalPerGW * totalGWs;
    
    // Calculate total prize money
    const prize1st = parseFormattedNumber(document.getElementById('prize1st').value);
    const prize2nd = parseFormattedNumber(document.getElementById('prize2nd').value);
    const prize3rd = parseFormattedNumber(document.getElementById('prize3rd').value);
    const prizeChampion = parseFormattedNumber(document.getElementById('prizeChampion').value);
    const prizeH2H = parseFormattedNumber(document.getElementById('prizeH2H').value);
    const prizeEncouragement = parseFormattedNumber(document.getElementById('prizeEncouragement').value);
    
    // Calculate total stage prizes
    let totalStagePrize = 0;
    const stageElements = document.querySelectorAll('.stage-item');
    stageElements.forEach(stageEl => {
        const prize = parseFormattedNumber(stageEl.querySelector('.stage-prize').value);
        totalStagePrize += prize;
    });
    
    const totalPrizeMoney = prize1st + prize2nd + prize3rd + prizeChampion + prizeH2H + prizeEncouragement + totalStagePrize;
    
    // Calculate celebration money
    const celebrationMoney = totalLeagueMoney - totalPrizeMoney;
    
    // Format currency
    const fmt = (amount) => new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
    
    // Update display
    document.getElementById('totalPerGW').textContent = fmt(totalPerGW);
    document.getElementById('totalGWs').textContent = totalGWs;
    document.getElementById('totalLeagueMoney').textContent = fmt(totalLeagueMoney);
    document.getElementById('totalStagePrize').textContent = fmt(totalStagePrize);
    document.getElementById('totalPrizeMoney').textContent = fmt(totalPrizeMoney);
    document.getElementById('celebrationMoney').textContent = fmt(celebrationMoney);
    
    // Highlight if negative
    const celebElement = document.getElementById('celebrationMoney');
    if (celebrationMoney < 0) {
        celebElement.style.color = '#ef4444';
    } else {
        celebElement.style.color = '#10b981';
    }
}

// Apply auto increment
function applyAutoIncrement() {
    const playerCount = parseInt(document.getElementById('playerCount').value);
    const incrementAmount = parseInt(document.getElementById('incrementAmount').value) || 5000;
    
    for (let i = 1; i <= playerCount; i++) {
        const input = document.getElementById(`rank${i}`);
        if (input) {
            input.value = (i - 1) * incrementAmount;
        }
    }
}

// Generate stage item HTML
function createStageElement(stage = {}, index = 0) {
    const stageDiv = document.createElement('div');
    stageDiv.className = 'stage-item';
    
    const stageName = stage.name || `Sprint ${index + 1}`;
    const startGW = stage.startGW || 1;
    const endGW = stage.endGW || 5;
    const prize = stage.prize || 0;
    
    stageDiv.innerHTML = `
        <div class="stage-header">
            <input type="text" class="stage-name" value="${stageName}" placeholder="Tên chặng">
            <button type="button" class="btn-remove-stage" title="Xóa chặng">✕</button>
        </div>
        <div class="stage-body">
            <div class="form-group">
                <label>GW bắt đầu:</label>
                <input type="number" class="stage-start-gw" min="1" max="38" value="${startGW}">
            </div>
            <div class="form-group">
                <label>GW kết thúc:</label>
                <input type="number" class="stage-end-gw" min="1" max="38" value="${endGW}">
            </div>
            <div class="form-group">
                <label>Tiền thưởng (VND):</label>
                <input type="text" class="stage-prize" value="${formatNumber(prize)}" placeholder="0">
            </div>
        </div>
    `;
    
    // Add event listeners
    const removeBtn = stageDiv.querySelector('.btn-remove-stage');
    removeBtn.addEventListener('click', () => {
        stageDiv.remove();
        updateSummary();
    });
    
    // Add currency formatting to prize input
    const prizeInput = stageDiv.querySelector('.stage-prize');
    prizeInput.addEventListener('input', function() {
        const cursorPosition = this.selectionStart;
        const oldLength = this.value.length;
        
        let value = this.value.replace(/\D/g, '');
        
        if (value) {
            const formatted = formatNumber(parseInt(value));
            this.value = formatted;
            
            const newLength = formatted.length;
            const diff = newLength - oldLength;
            this.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
        } else {
            this.value = '';
        }
    });
    
    prizeInput.addEventListener('blur', function() {
        const value = parseFormattedNumber(this.value);
        this.value = formatNumber(value);
    });
    
    // Add listeners for summary update
    stageDiv.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateSummary);
    });
    
    return stageDiv;
}

// Add new stage
function addStage(stage) {
    const stagesList = document.getElementById('stagesList');
    const currentStages = stagesList.querySelectorAll('.stage-item').length;
    
    // If no stage data provided, calculate defaults from previous stage
    if (!stage) {
        stage = {};
        
        // Get last stage if exists
        const lastStageElement = stagesList.querySelector('.stage-item:last-child');
        if (lastStageElement) {
            const lastEndGW = parseInt(lastStageElement.querySelector('.stage-end-gw').value) || 0;
            const lastPrize = parseFormattedNumber(lastStageElement.querySelector('.stage-prize').value);
            
            // Start from next GW after last stage
            stage.startGW = lastEndGW + 1;
            stage.endGW = lastEndGW + 5; // Default 5 GWs
            stage.prize = lastPrize; // Same prize as previous stage
        } else {
            // First stage defaults
            stage.startGW = 1;
            stage.endGW = 5;
            stage.prize = 0;
        }
    }
    
    const stageElement = createStageElement(stage, currentStages);
    stagesList.appendChild(stageElement);
    
    updateSummary();
}

// Load stages from settings
function loadStages(stages = []) {
    const stagesList = document.getElementById('stagesList');
    stagesList.innerHTML = '';
    
    stages.forEach((stage, index) => {
        const stageElement = createStageElement(stage, index);
        stagesList.appendChild(stageElement);
    });
}

// Generate history item HTML
function createHistoryElement(history = {}, index = 0, isNew = false) {
    const historyDiv = document.createElement('div');
    historyDiv.className = 'history-item';
    
    const year = history.year || '';
    // Default league name to current league name for new items
    const currentLeagueName = localStorage.getItem('currentLeagueName') || '';
    const leagueName = history.leagueName || (isNew ? currentLeagueName : '');
    const champion = history.champion || '';
    const teamName = history.teamName || '';
    
    // Get players list from localStorage
    const playersListStr = localStorage.getItem('currentLeaguePlayers');
    const playersList = playersListStr ? JSON.parse(playersListStr) : [];
    
    // Generate player options
    const playerOptions = playersList.map(p => 
        `<option value="${p.name}" data-team="${p.teamName}" ${p.name === champion ? 'selected' : ''}>${p.name}</option>`
    ).join('');
    
    historyDiv.innerHTML = `
        <div class="history-header">
            <span class="history-trophy">🏆</span>
            <button type="button" class="btn-remove-history" title="Xóa">✕</button>
        </div>
        <div class="history-body">
            <div class="form-group">
                <label>Mùa giải:</label>
                <input type="text" class="history-year" value="${year}" placeholder="Ví dụ: 2023-24">
            </div>
            <div class="form-group">
                <label>Tên League:</label>
                <input type="text" class="history-league-name" value="${leagueName}" placeholder="Tên mini league">
            </div>
            <div class="form-group">
                <label>Nhà vô địch:</label>
                <div class="history-player-select">
                    <select class="history-champion-select">
                        <option value="">-- Chọn từ danh sách --</option>
                        ${playerOptions}
                        <option value="__custom__">✏️ Nhập tên khác...</option>
                    </select>
                    <input type="text" class="history-champion" value="${champion}" placeholder="Tên người chơi" style="${playersList.length > 0 && !champion ? 'display:none;' : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Tên đội:</label>
                <input type="text" class="history-team-name" value="${teamName}" placeholder="Tên đội FPL">
            </div>
        </div>
    `;
    
    // Add event listener for remove button
    const removeBtn = historyDiv.querySelector('.btn-remove-history');
    removeBtn.addEventListener('click', () => {
        historyDiv.remove();
    });
    
    // Add event listener for player select
    const championSelect = historyDiv.querySelector('.history-champion-select');
    const championInput = historyDiv.querySelector('.history-champion');
    const teamNameInput = historyDiv.querySelector('.history-team-name');
    
    if (championSelect) {
        championSelect.addEventListener('change', function() {
            const selectedValue = this.value;
            const selectedOption = this.selectedOptions[0];
            
            if (selectedValue === '__custom__') {
                // Show input for custom entry
                championInput.style.display = '';
                championInput.value = '';
                championInput.focus();
            } else if (selectedValue) {
                // Use selected player
                championInput.style.display = 'none';
                championInput.value = selectedValue;
                // Auto-fill team name
                const teamNameFromData = selectedOption.dataset.team;
                if (teamNameFromData) {
                    teamNameInput.value = teamNameFromData;
                }
            } else {
                // No selection
                championInput.style.display = playersList.length > 0 ? 'none' : '';
                championInput.value = '';
            }
        });
        
        // If champion value exists but not in list, show input
        if (champion && !playersList.find(p => p.name === champion)) {
            championSelect.value = '__custom__';
            championInput.style.display = '';
        }
    }
    
    return historyDiv;
}

// Add new history item
function addHistory(history) {
    const historyList = document.getElementById('historyList');
    
    if (!history) {
        history = {};
    }
    
    // isNew = true for new items to auto-fill league name
    const historyElement = createHistoryElement(history, historyList.children.length, true);
    historyList.appendChild(historyElement);
}

// Load history from settings
function loadHistory(historyArray = []) {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    
    historyArray.forEach((history, index) => {
        const historyElement = createHistoryElement(history, index);
        historyList.appendChild(historyElement);
    });
}

// Get history from form
function getHistoryFromForm() {
    const historyList = [];
    const historyElements = document.querySelectorAll('.history-item');
    
    historyElements.forEach(historyEl => {
        const year = historyEl.querySelector('.history-year').value.trim();
        const leagueName = historyEl.querySelector('.history-league-name').value.trim();
        
        // Get champion from input (which is updated by select)
        const championInput = historyEl.querySelector('.history-champion');
        const champion = championInput.value.trim();
        
        const teamName = historyEl.querySelector('.history-team-name').value.trim();
        
        if (year || champion) { // Only save if at least year or champion is filled
            historyList.push({
                year,
                leagueName,
                champion,
                teamName
            });
        }
    });
    
    return historyList;
}

// Load H2H leagues from localStorage
function loadH2HLeagues() {
    const userLeaguesStr = localStorage.getItem('userLeagues');
    if (!userLeaguesStr) return;
    
    try {
        const userLeagues = JSON.parse(userLeaguesStr);
        const h2hLeagueSelect = document.getElementById('h2hLeague');
        
        // Clear existing options (except the first one)
        while (h2hLeagueSelect.options.length > 1) {
            h2hLeagueSelect.remove(1);
        }
        
        // Filter and add only H2H leagues
        userLeagues.forEach(league => {
            const leagueType = league.type === 'h2h' ? 'H2H' : league.scoring === 'h' ? 'H2H' : 'Classic';
            
            // Only add H2H leagues
            if (leagueType === 'H2H') {
                const option = document.createElement('option');
                option.value = league.id;
                option.textContent = `${league.name}`;
                option.dataset.leagueName = league.name;
                option.dataset.leagueType = leagueType;
                h2hLeagueSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Error loading H2H leagues:', error);
    }
}

// Update H2H league info
function updateH2HLeagueInfo() {
    const h2hLeagueSelect = document.getElementById('h2hLeague');
    const selectedOption = h2hLeagueSelect.selectedOptions[0];
    const h2hLeagueInfo = document.getElementById('h2hLeagueInfo');
    const h2hLeagueDetails = document.getElementById('h2hLeagueDetails');
    
    if (h2hLeagueSelect.value && selectedOption) {
        const leagueName = selectedOption.dataset.leagueName || selectedOption.textContent;
        const leagueType = selectedOption.dataset.leagueType || '';
        h2hLeagueDetails.textContent = `Đã chọn: ${leagueName} ${leagueType ? `(${leagueType})` : ''}`;
        h2hLeagueInfo.style.display = 'block';
    } else {
        h2hLeagueInfo.style.display = 'none';
    }
    
    updateSummary();
}

// Show save message
function showSaveMessage() {
    const messageEl = document.getElementById('saveMessage');
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}

// Initialize page
async function initializePage() {
    const settings = await loadSettings();
    
    // Load league info from localStorage
    const leagueId = localStorage.getItem('currentLeagueId') || 'Chưa có';
    const leagueName = localStorage.getItem('currentLeagueName') || 'Chưa chọn league';
    const playerCount = parseInt(localStorage.getItem('currentLeaguePlayerCount')) || 20;
    
    document.getElementById('leagueId').value = leagueId;
    document.getElementById('leagueName').value = leagueName;
    document.getElementById('playerCount').value = playerCount;
    document.getElementById('startGW').value = settings.startGW || 1;
    document.getElementById('endGW').value = settings.endGW || 38;
    document.getElementById('prize1st').value = formatNumber(settings.prize1st || 0);
    document.getElementById('prize2nd').value = formatNumber(settings.prize2nd || 0);
    document.getElementById('prize3rd').value = formatNumber(settings.prize3rd || 0);
    document.getElementById('prizeChampion').value = formatNumber(settings.prizeChampion || 0);
    document.getElementById('prizeH2H').value = formatNumber(settings.prizeH2H || 0);
    document.getElementById('prizeEncouragement').value = formatNumber(settings.prizeEncouragement || 0);
    document.getElementById('encouragementName').value = settings.encouragementName || '';
    
    // Add currency formatting to prize inputs
    addCurrencyFormatting('prize1st');
    addCurrencyFormatting('prize2nd');
    addCurrencyFormatting('prize3rd');
    addCurrencyFormatting('prizeChampion');
    addCurrencyFormatting('prizeH2H');
    addCurrencyFormatting('prizeEncouragement');
    
    // Load H2H leagues from localStorage
    loadH2HLeagues();
    
    // Set selected H2H league
    if (settings.h2hLeagueId) {
        document.getElementById('h2hLeague').value = settings.h2hLeagueId;
        updateH2HLeagueInfo();
    }
    
    // Generate rank inputs based on player count
    generateRankInputs(playerCount, settings.rankPayments);
    
    // Load stages
    loadStages(settings.stages || []);
    
    // Load league history
    loadHistory(settings.leagueHistory || []);
    
    // Update summary
    updateSummary();
    
    // Add event listeners for real-time updates
    document.getElementById('startGW').addEventListener('input', updateSummary);
    document.getElementById('endGW').addEventListener('input', updateSummary);
    document.getElementById('prize1st').addEventListener('input', updateSummary);
    document.getElementById('prize2nd').addEventListener('input', updateSummary);
    document.getElementById('prize3rd').addEventListener('input', updateSummary);
    document.getElementById('prizeChampion').addEventListener('input', updateSummary);
    document.getElementById('prizeH2H').addEventListener('input', updateSummary);
    document.getElementById('prizeEncouragement').addEventListener('input', updateSummary);
    
    // Add listener for H2H league selection
    document.getElementById('h2hLeague').addEventListener('change', updateH2HLeagueInfo);
    
    // Add listeners to all rank inputs
    for (let i = 1; i <= playerCount; i++) {
        const input = document.getElementById(`rank${i}`);
        if (input) {
            input.addEventListener('input', updateSummary);
        }
    }
}

// Event listeners
document.getElementById('autoIncrement').addEventListener('change', (e) => {
    const incrementGroup = document.getElementById('incrementGroup');
    if (e.target.checked) {
        incrementGroup.style.display = 'block';
    } else {
        incrementGroup.style.display = 'none';
    }
});

document.getElementById('applyIncrement').addEventListener('click', () => {
    applyAutoIncrement();
    updateSummary();
});

document.getElementById('addStageBtn').addEventListener('click', () => {
    addStage();
});

document.getElementById('addHistoryBtn').addEventListener('click', () => {
    addHistory();
});

document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const settings = getFormSettings();
    saveSettings(settings);
    showSaveMessage();
});

document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn đặt lại về cài đặt mặc định?')) {
        const playerCount = parseInt(document.getElementById('playerCount').value);
        const defaultSettings = {
            maxRanks: playerCount,
            rankPayments: generateDefaultPayments(playerCount),
            startGW: 1,
            endGW: 38,
            prize1st: 0,
            prize2nd: 0,
            prize3rd: 0,
            prizeChampion: 0,
            prizeH2H: 0,
            prizeEncouragement: 0,
            encouragementName: '',
            h2hLeagueId: null,
            h2hLeagueName: '',
            stages: [],
            leagueHistory: []
        };
        
        saveSettings(defaultSettings);
        
        // Update form
        document.getElementById('startGW').value = 1;
        document.getElementById('endGW').value = 38;
        document.getElementById('prize1st').value = formatNumber(0);
        document.getElementById('prize2nd').value = formatNumber(0);
        document.getElementById('prize3rd').value = formatNumber(0);
        document.getElementById('prizeChampion').value = formatNumber(0);
        document.getElementById('prizeH2H').value = formatNumber(0);
        document.getElementById('prizeEncouragement').value = formatNumber(0);
        document.getElementById('encouragementName').value = '';
        document.getElementById('h2hLeague').value = '';
        document.getElementById('h2hLeagueInfo').style.display = 'none';
        
        generateRankInputs(playerCount, defaultSettings.rankPayments);
        loadStages([]);
        loadHistory([]);
        updateSummary();
        showSaveMessage();
    }
});

// Export settings to JSON file
document.getElementById('exportBtn').addEventListener('click', () => {
    const settings = getFormSettings();
    const leagueId = localStorage.getItem('currentLeagueId');
    const leagueName = localStorage.getItem('currentLeagueName') || 'Unknown';
    
    // Create export object with metadata
    const exportData = {
        _meta: {
            leagueId: leagueId,
            leagueName: leagueName,
            exportDate: new Date().toISOString(),
            version: '1.0'
        },
        settings: settings
    };
    
    // Create and download JSON file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fpl_settings_${leagueId}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Import settings from JSON file
document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Validate import data
        if (!importData.settings) {
            alert('File không hợp lệ: Không tìm thấy settings');
            return;
        }
        
        const settings = importData.settings;
        
        // Apply settings to form
        document.getElementById('startGW').value = settings.startGW || 1;
        document.getElementById('endGW').value = settings.endGW || 38;
        document.getElementById('prize1st').value = formatNumber(settings.prize1st || 0);
        document.getElementById('prize2nd').value = formatNumber(settings.prize2nd || 0);
        document.getElementById('prize3rd').value = formatNumber(settings.prize3rd || 0);
        document.getElementById('prizeChampion').value = formatNumber(settings.prizeChampion || 0);
        document.getElementById('prizeH2H').value = formatNumber(settings.prizeH2H || 0);
        document.getElementById('prizeEncouragement').value = formatNumber(settings.prizeEncouragement || 0);
        document.getElementById('encouragementName').value = settings.encouragementName || '';
        
        // Load rank payments
        const playerCount = parseInt(document.getElementById('playerCount').value);
        generateRankInputs(playerCount, settings.rankPayments || {});
        
        // Load stages
        loadStages(settings.stages || []);
        
        // Load history
        loadHistory(settings.leagueHistory || []);
        
        // Update H2H league if available
        if (settings.h2hLeagueId) {
            const h2hSelect = document.getElementById('h2hLeague');
            if (h2hSelect) {
                h2hSelect.value = settings.h2hLeagueId;
                // Trigger change to show info
                h2hSelect.dispatchEvent(new Event('change'));
            }
        }
        
        updateSummary();
        
        alert('✅ Import thành công! Nhấn "Lưu cài đặt" để lưu lại.');
    } catch (error) {
        console.error('Import error:', error);
        alert('Lỗi khi import: ' + error.message);
    }
    
    // Reset file input
    e.target.value = '';
});

// Handle back button navigation
function setupBackButton() {
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            const leagueId = localStorage.getItem('currentLeagueId');
            if (leagueId) {
                // Return to the league view
                window.location.href = `index.html?returnToLeague=${leagueId}`;
            } else {
                // No league loaded, go to home
                window.location.href = 'index.html';
            }
        });
    }
}

// Load default settings from default_settings.json if no saved settings exist
async function loadDefaultSettingsFromFile(leagueId) {
    try {
        const response = await fetch('default_settings.json');
        if (!response.ok) return null;
        
        const defaultSettings = await response.json();
        if (defaultSettings[leagueId]) {
            console.log(`Loaded default settings for league ${leagueId}`);
            return defaultSettings[leagueId];
        }
    } catch (e) {
        console.log('No default_settings.json found or error loading:', e.message);
    }
    return null;
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    setupBackButton();
    initializePage();
});
