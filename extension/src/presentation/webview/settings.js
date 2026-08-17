const vscode = acquireVsCodeApi();

const ICONS = {
    eyeOpen: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
    eyeClosed: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74-.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2z"/></svg>`
};

// --- Elementler ---
const settingsEndpoint = document.getElementById('settings-endpoint');
const settingsModel = document.getElementById('settings-model');
const settingsApiKey = document.getElementById('settings-apikey');
const toggleApiKeyBtn = document.getElementById('toggle-apikey-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const saveConfirmMsg = document.getElementById('save-confirm-msg');
const modeToggleBtn = document.getElementById('modeToggleBtn');
const openNativeSettingsBtn = document.getElementById('open-native-settings-btn');
const openNativeSettingsBtn2 = document.getElementById('open-native-settings-btn-2');
const settingsLangTR = document.getElementById('settingsLangTR');
const settingsLangEN = document.getElementById('settingsLangEN');
const navItems = document.querySelectorAll('.orbit-settings-nav-item');
const pages = document.querySelectorAll('.orbit-settings-page');
const navJumpBtns = document.querySelectorAll('.nav-jump');

let currentLang = 'tr';
let autoApplyMode = false;

// --- Sayfa Geçişleri (Sol menü + kart "Düzenle..." butonları) ---
function switchPage(pageKey) {
    navItems.forEach(item => item.classList.toggle('active', item.getAttribute('data-page') === pageKey));
    pages.forEach(page => page.classList.toggle('active', page.id === `page-${pageKey}`));
}
navItems.forEach(item => item.addEventListener('click', () => switchPage(item.getAttribute('data-page'))));
navJumpBtns.forEach(btn => btn.addEventListener('click', () => switchPage(btn.getAttribute('data-page'))));

// --- API Key göster/gizle ---
if (toggleApiKeyBtn && settingsApiKey) {
    toggleApiKeyBtn.addEventListener('click', () => {
        if (settingsApiKey.type === 'password') {
            settingsApiKey.type = 'text';
            toggleApiKeyBtn.innerHTML = ICONS.eyeClosed;
            toggleApiKeyBtn.title = 'Şifreyi Gizle';
        } else {
            settingsApiKey.type = 'password';
            toggleApiKeyBtn.innerHTML = ICONS.eyeOpen;
            toggleApiKeyBtn.title = 'Şifreyi Göster';
        }
    });
}

// --- Bağlantı Ayarlarını Kaydet ---
if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
        vscode.postMessage({
            type: 'saveSettings',
            value: {
                endpoint: settingsEndpoint ? settingsEndpoint.value : '',
                model: settingsModel ? settingsModel.value : '',
                apiKey: settingsApiKey ? settingsApiKey.value : ''
            }
        });
        if (saveConfirmMsg) {
            saveConfirmMsg.style.display = 'inline';
            setTimeout(() => { saveConfirmMsg.style.display = 'none'; }, 2000);
        }
    });
}

// --- Uygulama Modu (Manuel / Otomatik) ---
function renderModeToggleBtn() {
    if (!modeToggleBtn) return;
    if (autoApplyMode) {
        modeToggleBtn.textContent = '⚡ Otomatik';
        modeToggleBtn.title = 'Otomatik mod: AI önerileri önizleme göstermeden direkt uygulanır. Değiştirmek için tıkla.';
        modeToggleBtn.classList.add('mode-auto');
    } else {
        modeToggleBtn.textContent = '🖐️ Manuel';
        modeToggleBtn.title = 'Manuel mod: AI önerileri önce yeşil/kırmızı önizlenir, Kabul Et/Geri Al ile onaylanır. Değiştirmek için tıkla.';
        modeToggleBtn.classList.remove('mode-auto');
    }
}
if (modeToggleBtn) {
    modeToggleBtn.addEventListener('click', () => {
        autoApplyMode = !autoApplyMode;
        renderModeToggleBtn();
        vscode.postMessage({ type: 'setAutoApply', value: autoApplyMode });
    });
}

// --- VS Code Genel Ayarlarını Aç ---
if (openNativeSettingsBtn) {
    openNativeSettingsBtn.addEventListener('click', () => vscode.postMessage({ type: 'openNativeSettings' }));
}
if (openNativeSettingsBtn2) {
    openNativeSettingsBtn2.addEventListener('click', () => vscode.postMessage({ type: 'openNativeSettings' }));
}

// --- Dil Seçimi ---
function applyLanguageUi(lang) {
    currentLang = lang;
    if (settingsLangTR) settingsLangTR.classList.toggle('active', lang === 'tr');
    if (settingsLangEN) settingsLangEN.classList.toggle('active', lang === 'en');
}
if (settingsLangTR) {
    settingsLangTR.addEventListener('click', () => {
        applyLanguageUi('tr');
        vscode.postMessage({ type: 'setLanguage', value: 'tr' });
    });
}
if (settingsLangEN) {
    settingsLangEN.addEventListener('click', () => {
        applyLanguageUi('en');
        vscode.postMessage({ type: 'setLanguage', value: 'en' });
    });
}

// --- Extension'dan gelen mesajları dinle ---
window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'initSettings') {
        if (settingsEndpoint) settingsEndpoint.value = message.endpoint || '';
        if (settingsModel) settingsModel.value = message.model || '';
        if (settingsApiKey) settingsApiKey.value = message.apiKey || '';
        autoApplyMode = !!message.autoApply;
        renderModeToggleBtn();
        applyLanguageUi(message.lang || 'tr');
    }
});

// Panel açıldığında güncel ayarları iste
vscode.postMessage({ type: 'ready' });