// Version configuration
const APP_VERSION = '1.0.2';
const BUILD_DATE = '2026-09-02';

// Display version in footer
function displayVersion() {
    const versionElements = document.querySelectorAll('.app-version');
    versionElements.forEach(el => {
        el.textContent = `v${APP_VERSION}`;
    });
    
    const buildDateElements = document.querySelectorAll('.build-date');
    buildDateElements.forEach(el => {
        el.textContent = BUILD_DATE;
    });
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', displayVersion);
} else {
    displayVersion();
}
