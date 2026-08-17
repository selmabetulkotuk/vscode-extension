const vscode = acquireVsCodeApi();

// Göz ve diğer ikonlar
const ICONS = {
    copy: `<svg viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H6v10h8V7z"/><path d="M3 1L2 2v10h2V3h6V1H3z"/></svg>`,
    edit: `<svg viewBox="0 0 16 16"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.49 1.49-3 1.51zM11 7.22L8.78 5 13 1.78 14.22 3 11 7.22z"/></svg>`,
    check: `<svg viewBox="0 0 16 16"><path d="M14.5 2.5l-9 9-4.5-4.5L2 6l3.5 3.5L13 2l1.5.5z"/></svg>`,
    trash: `<svg viewBox="0 0 16 16"><path d="M14 3h-3.538a2.998 2.998 0 00-4.924 0H2v1h1l1.014 9.122C4.1 13.913 4.545 14 5.08 14h5.84c.535 0 .98-.087 1.066-.878L13 4h1V3zm-5.006-1c.642 0 1.2.4 1.414 1H5.592c.214-.6.772-1 1.402-1zm3.848 10.912c-.024.235-.224.269-.475.269h-5.84c-.25 0-.45-.034-.474-.269L5.04 4h5.92l-.986 9.122z"/><path d="M6 5h1v7H6zm3 0h1v7H9z"/></svg>`,
    eyeOpen: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
    eyeClosed: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74-.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2z"/></svg>`,
    //Ufak sade tik/çarpı ikonları (diff onay butonları için)
    tick: `<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-6.5 6.5a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 011.06 0z"/></svg>`,
    cross: `<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`
};

// Dosya uzantısından Prism.js diliyle uyumlu bir dil adı çıkarır
function getLangFromFilename(filename) {
    if (!filename) return 'javascript';
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const map = {
        js: 'javascript', jsx: 'javascript', mjs: 'javascript',
        ts: 'javascript', tsx: 'javascript',
        py: 'python',
        cs: 'csharp',
        java: 'java',
        c: 'c',
        h: 'c',
        cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
        sql: 'sql',
        html: 'markup', htm: 'markup', xml: 'markup',
        css: 'css',
        json: 'javascript',
        sh: 'bash', bash: 'bash'
    };
    return map[ext] || 'javascript';
}


function cleanCodeGarbage(str) {
    if (!str) return '';
    let s = str;
    
    s = s.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
    
    s = s.replace(/^(JAVASCRIPT|TYPESCRIPT|CSHARP|PYTHON|JAVA|HTML|CSS|SQL|BASH|JSON|XML)\s*(?=\S)/i, '');
    return s.trim();
}

window.diffDataStore = {}; 
window.diffStateStore = {}; 
let currentMsgId = "live"; 

const sidebar = document.getElementById('sidebar');
const sessionListEl = document.getElementById('sessionList');
const newChatBtn = document.getElementById('newChatBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');

// Dil Seçim Elementleri
const langMenuBtn = document.getElementById('langMenuBtn');
const langDropdown = document.getElementById('langDropdown');
const langTR = document.getElementById('langTR');
const langEN = document.getElementById('langEN');

// Yeni Açılır Menü Elementleri
const mainMenuBtn = document.getElementById('mainMenuBtn');
const mainDropdown = document.getElementById('mainDropdown');
const menuNewChat = document.getElementById('menuNewChat');
const menuHistory = document.getElementById('menuHistory');
const menuNotepad = document.getElementById('menuNotepad');
const menuSettings = document.getElementById('menuSettings');
// Not Defteri Elementleri
const notepadOverlay = document.getElementById('notepad-overlay');
const notepadTextarea = document.getElementById('notepad-textarea');
const notepadCloseIcon = document.getElementById('notepad-close-icon');
const notepadCancelBtn = document.getElementById('notepad-cancel-btn');
const notepadSaveBtn = document.getElementById('notepad-save-btn');

const chatBox = document.getElementById('chat-box');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');

const emptyState = document.getElementById('empty-state');
const attachBtn = document.getElementById('attachBtn');
const fileUploadInput = document.getElementById('fileUploadInput');
const attachmentChips = document.getElementById('attachment-chips');
let attachedFiles = []; 

const settingsOverlay = document.getElementById('settings-overlay');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const openNativeSettingsBtn = document.getElementById('open-native-settings-btn');
const openNativeSettingsBtn2 = document.getElementById('open-native-settings-btn-2');
const settingsEndpoint = document.getElementById('settings-endpoint');
const settingsModel = document.getElementById('settings-model');
const settingsApiKey = document.getElementById('settings-apikey');
const toggleApiKeyBtn = document.getElementById('toggle-apikey-btn');
const modeToggleBtn = document.getElementById('modeToggleBtn');
const settingsNavItems = document.querySelectorAll('.orbit-settings-nav-item');
const settingsPages = document.querySelectorAll('.orbit-settings-page');
const settingsNavJumpBtns = document.querySelectorAll('.nav-jump');
const settingsLangTR = document.getElementById('settingsLangTR');
const settingsLangEN = document.getElementById('settingsLangEN');

let currentAiMessageElement = null;
let responseContentElement = null;
let accumulatedText = "";
let isUserScrollingUp = false;
let isGenerating = false;
let currentSessionId = null;
window.autoApplyMode = false;

// AÇILIR MENÜSİSTEMİ
if (mainMenuBtn && mainDropdown) {
    mainMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Sayfaya tıklanma olayını engelle
        mainDropdown.style.display = mainDropdown.style.display === 'none' ? 'flex' : 'none';
    });
}

//DİL SEÇİM MENÜSÜ
const I18N = {
    tr: {
        sidebarTitle: 'Sohbetler',
        newChatBtn: '+ Yeni Sohbet',
        menuNewChat: 'Yeni Sohbet',
        menuHistory: 'Sohbet Geçmişi',
        menuNotepad: 'Not Defteri',
        menuSettings: 'Ayarlar',
        mainMenuBtnTitle: 'Menü',
        langMenuBtnTitle: 'Dil / Language',
        promptPlaceholder: ' Ne inşa etmek istediğinizi anlatın. (Enter: gönder, Shift+Enter: yeni satır)',
        attachBtnTitle: 'Dosya / Fotoğraf Ekle',
        stopBtnTitle: 'Durdur',
        sendBtnTitle: 'Gönder',
        emptyStateTitle: "ORBIT ile İnşa Et",
        emptyStateText: 'Yapay zeka yanıtları hatalı olabilir.<br><a href="#">Ajan Talimatları Oluştur</a> ile AI\'yı kod tabanınıza tanıtın.',
        notepadTitle: 'Not Defteri',
        notepadPlaceholder: "Buraya notlarınızı yazabilirsiniz... (Kaydet'e bastığınızda hafızada kalır)",
        notepadCancelBtn: 'Kapat',
        notepadSaveBtn: 'Kaydet',
        settingsCancelBtn: 'ÇIKIŞ',
        securityScanTitle: 'Zafiyet Tara',
        terminalAnalysisTitle: 'Terminal Hatasını Çöz',
        settingsTitlebarTitle: 'ORBIT Ayarları',
        navOverview: 'Genel Bakış',
        navConnection: 'Bağlantı',
        navMode: 'Uygulama Modu',
        navLanguage: 'Dil',
        navVscode: 'VS Code Ayarları',
        overviewTitle: 'ORBIT Ayarları',
        overviewSubtitle: "ORBIT'in projelerinizde nasıl çalışacağını buradan özelleştirin. Bağlantı, çalışma modu ve dil tercihlerinizi yönetin.",
        cardConnectionTitle: 'Bağlantı',
        cardConnectionDesc: 'API endpoint, model adı ve API anahtarınızı yapılandırın (LM Studio, OpenAI vb.).',
        cardConnectionBtn: 'Düzenle...',
        cardModeTitle: 'Uygulama Modu',
        cardModeDesc: 'AI önerilerinin doğrudan mı uygulanacağını yoksa önce onay mı isteneceğini belirleyin.',
        cardModeBtn: 'Düzenle...',
        cardLanguageTitle: 'Dil',
        cardLanguageDesc: 'Arayüz ve AI yanıtlarının hangi dilde olacağını seçin.',
        cardLanguageBtn: 'Düzenle...',
        cardVscodeTitle: 'VS Code Ayarları',
        cardVscodeDesc: 'Bu eklentiye ait ayarları VS Code\'un genel Ayarlar sekmesinden görüntüleyin.',
        cardVscodeBtn: 'Aç...',
        connectionTitle: 'Bağlantı Ayarları',
        connectionSubtitle: 'Yapay zeka isteklerinin gönderileceği API adresini ve modeli yapılandırın.',
        labelEndpoint: 'API Endpoint',
        labelModel: 'Model Adı',
        labelApiKey: 'API Anahtarı',
        settingsSaveBtn: 'Kaydet',
        modeTitle: 'Uygulama Modu',
        modeSubtitle: 'Manuel modda AI önerileri önce önizleme olarak gösterilir ve onayınızı bekler. Otomatik modda öneriler doğrudan uygulanır.',
        languageTitle: 'Dil Tercihi',
        languageSubtitle: 'Arayüz metinlerinin ve AI yanıtlarının hangi dilde olacağını seçin.',
        vscodeTitle: 'VS Code Ayarları',
        vscodeSubtitle: "ORBIT'in ayarları, VS Code'un yerleşik Ayarlar (Settings) sekmesinde ORBITAiAssistant altında da kayıtlıdır.",
        vscodeOpenBtn: 'VS Code Genel Ayarlarını Aç'
    },
    en: {
        sidebarTitle: 'Chats',
        newChatBtn: '+ New Chat',
        menuNewChat: 'New Chat',
        menuHistory: 'Chat History',
        menuNotepad: 'Notepad',
        menuSettings: 'Settings',
        mainMenuBtnTitle: 'Menu',
        langMenuBtnTitle: 'Language / Dil',
        promptPlaceholder: ' Describe what to build. (Enter: send, Shift+Enter: new line)',
        attachBtnTitle: 'Attach File / Image',
        stopBtnTitle: 'Stop',
        sendBtnTitle: 'Send',
        emptyStateTitle: 'Build with ORBIT',
        emptyStateText: 'AI responses may be inaccurate.<br><a href="#">Generate Agent Instructions</a> to onboard AI onto your codebase.',
        notepadTitle: 'Notepad',
        notepadPlaceholder: "You can write your notes here... (Saved once you press Save)",
        notepadCancelBtn: 'Close',
        notepadSaveBtn: 'Save',
        settingsCancelBtn: 'EXIT',
        securityScanTitle: 'Scan Vulnerabilities',
        terminalAnalysisTitle: 'Fix Terminal Error',
        settingsTitlebarTitle: 'ORBIT Settings',
        navOverview: 'Overview',
        navConnection: 'Connection',
        navMode: 'Apply Mode',
        navLanguage: 'Language',
        navVscode: 'VS Code Settings',
        overviewTitle: 'Agent Settings for ORBIT',
        overviewSubtitle: 'Customize how ORBIT works in your projects. Manage your connection, apply mode, and language preferences.',
        cardConnectionTitle: 'Connection',
        cardConnectionDesc: 'Configure your API endpoint, model name, and API key (LM Studio, OpenAI, etc.).',
        cardConnectionBtn: 'Edit...',
        cardModeTitle: 'Apply Mode',
        cardModeDesc: 'Choose whether AI suggestions are applied directly or require confirmation first.',
        cardModeBtn: 'Edit...',
        cardLanguageTitle: 'Language',
        cardLanguageDesc: 'Choose the language for the interface and AI responses.',
        cardLanguageBtn: 'Edit...',
        cardVscodeTitle: 'VS Code Settings',
        cardVscodeDesc: "View this extension's settings from VS Code's general Settings tab.",
        cardVscodeBtn: 'Open...',
        connectionTitle: 'Connection Settings',
        connectionSubtitle: 'Configure the API address and model that AI requests will be sent to.',
        labelEndpoint: 'API Endpoint',
        labelModel: 'Model Name',
        labelApiKey: 'API Key',
        settingsSaveBtn: 'Save',
        modeTitle: 'Apply Mode',
        modeSubtitle: 'In Manual mode, AI suggestions are shown as a preview and require your approval. In Auto mode, suggestions are applied directly.',
        languageTitle: 'Language Preference',
        languageSubtitle: 'Choose the language for interface text and AI responses.',
        vscodeTitle: 'VS Code Settings',
        vscodeSubtitle: "ORBIT's settings are also registered under ORBITAiAssistant in VS Code's built-in Settings tab.",
        vscodeOpenBtn: 'Open VS Code General Settings'
    }
};

function applyLanguage(lang) {
    const t = I18N[lang] || I18N.tr;

    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const setHtml = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = value; };
    const setPlaceholder = (id, value) => { const el = document.getElementById(id); if (el) el.placeholder = value; };
    const setTitle = (id, value) => { const el = document.getElementById(id); if (el) el.title = value; };

    setText('sidebarTitle', t.sidebarTitle);
    setText('newChatBtn', t.newChatBtn);
    setText('menuNewChat', t.menuNewChat);
    setText('menuHistory', t.menuHistory);
    setText('menuNotepad', t.menuNotepad);
    setText('menuSettings', t.menuSettings);
    setTitle('mainMenuBtn', t.mainMenuBtnTitle);
    setTitle('langMenuBtn', t.langMenuBtnTitle);
    setPlaceholder('promptInput', t.promptPlaceholder);
    setTitle('attachBtn', t.attachBtnTitle);
    setTitle('stopBtn', t.stopBtnTitle);
    setTitle('sendBtn', t.sendBtnTitle);
    setText('emptyStateTitle', t.emptyStateTitle);
    setHtml('emptyStateText', t.emptyStateText);
    setPlaceholder('notepad-textarea', t.notepadPlaceholder);
    setText('notepad-cancel-btn', t.notepadCancelBtn);
    setText('notepad-save-btn', t.notepadSaveBtn);
    setText('settings-cancel-btn', t.settingsCancelBtn);

    // Sağ üstteki mini ikon butonlarının title'ları (statik onclick butonları)
    const securityBtn = document.querySelector('[onclick="triggerSecurityScan()"]');
    if (securityBtn) securityBtn.title = t.securityScanTitle;
    const terminalBtn = document.querySelector('[onclick="triggerTerminalAnalysis()"]');
    if (terminalBtn) terminalBtn.title = t.terminalAnalysisTitle;

    // Aktif dili görsel olarak vurgula
    if (langTR) langTR.style.fontWeight = lang === 'tr' ? 'bold' : 'normal';
    if (langEN) langEN.style.fontWeight = lang === 'en' ? 'bold' : 'normal';
    if (settingsLangTR) settingsLangTR.classList.toggle('active', lang === 'tr');
    if (settingsLangEN) settingsLangEN.classList.toggle('active', lang === 'en');

    // Tercihi kalıcı hale getir
    window.currentLang = lang;
    try {
        const prevState = vscode.getState() || {};
        vscode.setState({ ...prevState, lang });
    } catch (e) { /* getState/setState mevcut değilse sessizce geç */ }

    
    vscode.postMessage({ type: 'setLanguage', value: lang });
}

if (langMenuBtn && langDropdown) {
    langMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.style.display = langDropdown.style.display === 'none' ? 'flex' : 'none';
    });
}
if (langTR) {
    langTR.addEventListener('click', () => {
        applyLanguage('tr');
        langDropdown.style.display = 'none';
    });
}
if (langEN) {
    langEN.addEventListener('click', () => {
        applyLanguage('en');
        langDropdown.style.display = 'none';
    });
}


(function initLanguage() {
    let savedLang = 'tr';
    try {
        const state = vscode.getState();
        if (state && state.lang) savedLang = state.lang;
    } catch (e) { /* yoksay */ }
    applyLanguage(savedLang);
})();

// Menü dışına tıklanınca menüleri kapat
document.addEventListener('click', () => {
    if (mainDropdown) mainDropdown.style.display = 'none';
    if (langDropdown) langDropdown.style.display = 'none';
});

if (menuNewChat) {
    menuNewChat.addEventListener('click', () => {
        vscode.postMessage({ type: 'newChat' });
    });
}
if (menuHistory) {
    menuHistory.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
}
if (settingsOverlay) {
    settingsOverlay.style.display = 'none';
}

if (menuSettings) {
    menuSettings.addEventListener('click', () => {
        // Küçük popup yerine artık editör alanında büyük bir Ayarlar sekmesi açılıyor
        vscode.postMessage({ type: 'openSettingsPanel' });
        if (mainDropdown) mainDropdown.style.display = 'none';
    });
}

if (openNativeSettingsBtn) {
    openNativeSettingsBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openNativeSettings' });
    });
}
if (openNativeSettingsBtn2) {
    openNativeSettingsBtn2.addEventListener('click', () => {
        vscode.postMessage({ type: 'openNativeSettings' });
    });
}

// --- AYARLAR MODALI: SOL MENÜ / KART GEÇİŞLERİ ---
function switchSettingsPage(pageKey) {
    settingsNavItems.forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-page') === pageKey);
    });
    settingsPages.forEach(page => {
        page.classList.toggle('active', page.id === `page-${pageKey}`);
    });
}
settingsNavItems.forEach(item => {
    item.addEventListener('click', () => switchSettingsPage(item.getAttribute('data-page')));
});
settingsNavJumpBtns.forEach(btn => {
    btn.addEventListener('click', () => switchSettingsPage(btn.getAttribute('data-page')));
});

// Ayarlar modalı (eğer başka bir yerden açılırsa) her zaman Genel Bakış ile başlasın
switchSettingsPage('overview');

// Dil sayfasındaki büyük TR/EN butonları da genel dil sistemine bağlanıyor
if (settingsLangTR) {
    settingsLangTR.addEventListener('click', () => applyLanguage('tr'));
}
if (settingsLangEN) {
    settingsLangEN.addEventListener('click', () => applyLanguage('en'));
}
if (menuNotepad) {
    menuNotepad.addEventListener('click', () => {
        notepadOverlay.style.display = 'flex';
        if (mainDropdown) mainDropdown.style.display = 'none'; // Menüyü kapat
        vscode.postMessage({ type: 'loadNotepad' }); // Arka plandan kayıtlı notları iste
    });
}

// Not Defteri Buton İşlemleri
function closeNotepad() { notepadOverlay.style.display = 'none'; }
if(notepadCloseIcon) notepadCloseIcon.addEventListener('click', closeNotepad);
if(notepadCancelBtn) notepadCancelBtn.addEventListener('click', closeNotepad);

if(notepadSaveBtn) {
    notepadSaveBtn.addEventListener('click', () => {
        const noteText = notepadTextarea.value;
        vscode.postMessage({ type: 'saveNotepad', value: noteText });
        closeNotepad();
    });
}
// --- DOSYA YÜKLEME SİSTEMİ ---
if (attachBtn && fileUploadInput) {
    attachBtn.addEventListener('click', () => {
        fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', (e) => {
        const files = e.target.files;
        for (let i = 0; i < files.length; i++) {
            attachedFiles.push(files[i]);
        }
        renderAttachmentChips();
        fileUploadInput.value = ''; 
    });
}

function renderAttachmentChips() {
    if (!attachmentChips) return;
    attachmentChips.innerHTML = '';
    
    attachedFiles.forEach((file, index) => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';
        const shortName = file.name.length > 18 ? file.name.substring(0, 15) + '...' : file.name;
        const isImage = file.type.startsWith('image/');
        const icon = isImage ? '🖼️' : '📄';

        chip.innerHTML = `
            <span>${icon} ${escapeHtml(shortName)}</span>
            <span class="chip-close" data-index="${index}" title="Kaldır">✕</span>
        `;
        attachmentChips.appendChild(chip);
    });

    document.querySelectorAll('.chip-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            attachedFiles.splice(idx, 1);
            renderAttachmentChips();
        });
    });
}


function renderModeToggleBtn() {
    if (window.autoApplyMode) {
        modeToggleBtn.textContent = '⚡ Otomatik';
        modeToggleBtn.title = 'Otomatik mod: AI önerileri önizleme göstermeden direkt uygulanır. Değiştirmek için tıkla.';
        modeToggleBtn.classList.add('mode-auto');
    } else {
        modeToggleBtn.textContent = '🖐️ Manuel';
        modeToggleBtn.title = 'Manuel mod: AI önerileri önce yeşil/kırmızı önizlenir, Kabul Et/Geri Al ile onaylanır. Değiştirmek için tıkla.';
        modeToggleBtn.classList.remove('mode-auto');
    }
}

modeToggleBtn.addEventListener('click', () => {
    window.autoApplyMode = !window.autoApplyMode;
    renderModeToggleBtn();
    vscode.postMessage({ type: 'setAutoApply', value: window.autoApplyMode });
});

settingsCancelBtn.addEventListener('click', () => { settingsOverlay.style.display = 'none'; });
settingsSaveBtn.addEventListener('click', () => {
    vscode.postMessage({
        type: 'saveSettings',
        value: { endpoint: settingsEndpoint ? settingsEndpoint.value : '', model: settingsModel ? settingsModel.value : '', apiKey: settingsApiKey ? settingsApiKey.value : '' }
    });
    settingsOverlay.style.display = 'none';
});

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

chatBox.addEventListener('scroll', () => {
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 50;
    isUserScrollingUp = !isAtBottom;
});

function escapeCodeForHtml(code) {
    return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const renderer = new marked.Renderer();
renderer.code = function(code, infostring) {
    const validLang = infostring || 'javascript';
    const safeCode = escapeCodeForHtml(code);
    return '<div class="code-container"><div class="code-header"><span>' + validLang.toUpperCase() + '</span><button class="action-btn" title="Kodu Kopyala" onclick="copyCode(this)">' + ICONS.copy + '</button></div><pre><code class="language-' + validLang + '">' + safeCode + '</code></pre></div>';
};
marked.use({ renderer });

function processAgenticTags(text, msgId = "default") {
    text = text.replace(/```[a-zA-Z]*\n?(<change[\s\S]*?<\/change>)\n?```/g, '$1');
    text = text.replace(/```[a-zA-Z]*\n?(<create[\s\S]*?<\/create>)\n?```/g, '$1');
    text = text.replace(/```[a-zA-Z]*\n?((?:<tool_call>\s*)?<tool_name>[\s\S]*?<\/args>\s*(?:<\/tool_call>)?)\n?```/g, '$1');
    text = text.replace(/```[a-zA-Z]*\n?(<(?:search_workspace|read_file|run_terminal)>[\s\S]*?<\/(?:search_workspace|read_file|run_terminal)>)\n?```/g, '$1');

    let createIndex = 0;
    const createRegex = /<create(?: file="([^"]*)")?>([\s\S]*?)<\/create>/g;
    text = text.replace(createRegex, (match, file, content) => {
        const id = `diff_${msgId}_create_${createIndex++}`;
        const safeFile = file ? file.trim() : "yeni_dosya.js";
        const cleanContent = cleanCodeGarbage(content.replace(/^\n+|\n+$/g, ''));
        window.diffDataStore[id] = { type: 'create', file: safeFile, content: cleanContent };
        
        let actionHtml = '';
        if (window.diffStateStore[id] === 'applied') {
            actionHtml = '<div class="diff-actions"><div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(76, 175, 80, 0.15); border: 1px solid rgba(76, 175, 80, 0.4); border-radius: 6px; color: #4CAF50; font-weight: bold; font-size: 13px;">✅ Dosya Oluşturuldu</div></div>';
        } else if (window.diffStateStore[id] === 'rejected') {
            actionHtml = '<div class="diff-actions"><div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(244, 67, 54, 0.15); border: 1px solid rgba(244, 67, 54, 0.4); border-radius: 6px; color: #F44336; font-weight: bold; font-size: 13px;">❌ Reddedildi</div></div>';
        } else {
            actionHtml = '<div class="diff-actions icon-only">\n<button class="diff-btn diff-btn-icon approve" title="Dosyayı Oluştur (Kabul Et)" onclick="actionApply(\''+id+'\')">'+ICONS.tick+'</button>\n<button class="diff-btn diff-btn-icon reject" title="Reddet" onclick="actionReject(\''+id+'\')">'+ICONS.cross+'</button>\n</div>';
        }

        const createLang = getLangFromFilename(safeFile);
        const codeHtml = '<div class="code-container" style="margin: 10px;">\n<div class="code-header">\n<span>OLUŞTURULACAK KOD</span>\n<button class="action-btn" title="Kodu Kopyala" onclick="copyCode(this)">'+ICONS.copy+'</button>\n</div>\n<pre><code class="language-'+createLang+'">'+escapeHtml(cleanContent)+'</code></pre>\n</div>';

        return '\n<div class="diff-block" id="block_'+id+'">\n<div class="diff-header">📄 Yeni Dosya Önerisi: <b>'+safeFile+'</b></div>\n'+codeHtml+'\n'+actionHtml+'\n</div>\n';
    });

    let changeIndex = 0;
    const changeRegex = /<change(?: file="([^"]*)")?>([\s\S]*?)<\/change>/g;
    text = text.replace(changeRegex, (match, file, innerContent) => {
        const id = `diff_${msgId}_change_${changeIndex++}`;
        const safeFile = file ? file.trim() : "mevcut_dosya"; 
        
        let oldCode = "";
        let newCode = "";
        
        const oldMatch = innerContent.match(/<old>([\s\S]*?)<\/old>/);
        const newMatch = innerContent.match(/<new>([\s\S]*?)<\/new>/);
        
        if (oldMatch && newMatch) {
            oldCode = oldMatch[1].replace(/^\n+|\n+$/g, '');
            newCode = newMatch[1].replace(/^\n+|\n+$/g, '');
        } else {
            newCode = innerContent.replace(/<\/?(?:old|new)>/g, '').replace(/^\n+|\n+$/g, '');
            oldCode = ""; 
        }

        oldCode = cleanCodeGarbage(oldCode);
        newCode = cleanCodeGarbage(newCode);

        window.diffDataStore[id] = { type: 'change', file: safeFile, oldCode: oldCode, newCode: newCode };
        
        const warning = oldCode === "" ? '<div style="padding:4px 12px; font-size:11px; color:#ffcc00; background:#332b00; border-bottom: 1px solid var(--vscode-editorGroup-border);">⚠️ Model eski kodu belirtmedi. Değişiklik seçili alanı veya dosyanın tamamını kapsayabilir.</div>\n' : "";

        let actionHtml = '';
        if (window.diffStateStore[id] === 'applied') {
            actionHtml = '<div class="diff-actions"><div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(76, 175, 80, 0.15); border: 1px solid rgba(76, 175, 80, 0.4); border-radius: 6px; color: #4CAF50; font-weight: bold; font-size: 13px;">✅ Başarıyla Uygulandı</div></div>';
        } else if (window.diffStateStore[id] === 'rejected') {
            actionHtml = '<div class="diff-actions"><div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(244, 67, 54, 0.15); border: 1px solid rgba(244, 67, 54, 0.4); border-radius: 6px; color: #F44336; font-weight: bold; font-size: 13px;">❌ Reddedildi</div></div>';
        } else {
            actionHtml = '<div class="diff-actions icon-only">\n<button class="diff-btn diff-btn-icon preview" title="Tam Ekranda Önizle" onclick="actionPreview(\''+id+'\')">'+ICONS.eyeOpen+'</button>\n<button class="diff-btn diff-btn-icon approve" title="Uygula (Kabul Et)" onclick="actionApply(\''+id+'\')">'+ICONS.tick+'</button>\n<button class="diff-btn diff-btn-icon reject" title="Reddet" onclick="actionReject(\''+id+'\')">'+ICONS.cross+'</button>\n</div>';
        }

        const changeLang = getLangFromFilename(safeFile);
        const codeHtml = '<div class="code-container" style="margin: 10px;">\n<div class="code-header">\n<span>ÖNERİLEN YENİ KOD</span>\n<button class="action-btn" title="Kodu Kopyala" onclick="copyCode(this)">'+ICONS.copy+'</button>\n</div>\n<pre><code class="language-'+changeLang+'">'+escapeHtml(newCode)+'</code></pre>\n</div>';

        return '\n<div class="diff-block" id="block_'+id+'">\n<div class="diff-header">📝 Kod Değişikliği: <b>'+safeFile+'</b></div>\n'+warning+codeHtml+'\n'+actionHtml+'\n</div>\n';
    });
    
    let toolIndex = 0;
    
    function processToolMatch(match, toolName, args) {
        const id = `tool_${msgId}_${toolIndex++}`;
        const cleanTool = toolName ? toolName.trim() : "";
        const cleanArgs = args ? args.trim() : "";
        
        window.diffDataStore[id] = { type: 'tool', toolName: cleanTool, args: cleanArgs };
        
        let actionHtml = '';
        if (window.diffStateStore[id] === 'applied') {
            actionHtml = '<div class="diff-actions"><div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(76, 175, 80, 0.15); border: 1px solid rgba(76, 175, 80, 0.4); border-radius: 6px; color: #4CAF50; font-weight: bold; font-size: 13px;">✅ Araç Çalıştırıldı (Döngü Devam Ediyor...)</div></div>';
        } else if (window.diffStateStore[id] === 'rejected') {
            actionHtml = '<div class="diff-actions"><div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(244, 67, 54, 0.15); border: 1px solid rgba(244, 67, 54, 0.4); border-radius: 6px; color: #F44336; font-weight: bold; font-size: 13px;">❌ Reddedildi</div></div>';
        } else {
            actionHtml = '<div class="diff-actions icon-only">\n<button class="diff-btn diff-btn-icon approve" title="Çalıştır (Onayla)" onclick="actionExecuteTool(\''+id+'\')">'+ICONS.tick+'</button>\n<button class="diff-btn diff-btn-icon reject" title="Reddet" onclick="actionReject(\''+id+'\')">'+ICONS.cross+'</button>\n</div>';
        }

        let displayArgs = escapeHtml(cleanArgs);
        let headerTitle = "Sistem Aracı İsteği";
        if(cleanTool === 'run_terminal') headerTitle = "Terminal Komutu Çalıştır";
        if(cleanTool === 'read_file') headerTitle = "Dosya Oku";
        if(cleanTool === 'search_workspace') headerTitle = "Projede Ara";

        const codeHtml = '<div class="code-container" style="margin: 10px;">\n<div class="code-header">\n<span>' + cleanTool.toUpperCase() + '</span>\n<button class="action-btn" title="Kodu Kopyala" onclick="copyCode(this)">'+ICONS.copy+'</button>\n</div>\n<pre style="white-space: pre-wrap; word-wrap: break-word;"><code class="language-bash">'+displayArgs+'</code></pre>\n</div>';

        return '\n<div class="diff-block" id="block_'+id+'">\n<div class="diff-header" style="background-color: var(--vscode-editorInfo-background, #1e457e); color: white;">🛠️ ' + headerTitle + '</div>\n'+codeHtml+'\n'+actionHtml+'\n</div>\n';
    }

    const toolRegex1 = /(?:<tool_call>\s*)?<tool_name>(.*?)<\/tool_name>\s*<args>([\s\S]*?)<\/args>(?:\s*<\/tool_call>)?/g;
    text = text.replace(toolRegex1, processToolMatch);

    const toolRegex2 = /<(search_workspace|read_file|run_terminal)>([\s\S]*?)<\/\1>/g;
    text = text.replace(toolRegex2, processToolMatch);

    return text;
}

window.actionPreview = function(id) {
    const diffData = window.diffDataStore[id];
    if (diffData) {
        vscode.postMessage({ type: 'previewDiff', value: Object.assign({}, diffData, { id: id }) });
    }
};

window.actionApply = function(id) {
    const diffData = window.diffDataStore[id];
    if (diffData) {
        vscode.postMessage({ type: 'applyDiff', value: Object.assign({}, diffData, { id: id }) });

        const block = document.getElementById(`block_${id}`);
        if (block) {
            const actionsContainer = block.querySelector('.diff-actions');
            if (actionsContainer) {
                actionsContainer.innerHTML = '<div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(255, 193, 7, 0.15); border: 1px solid rgba(255, 193, 7, 0.4); border-radius: 6px; color: #FFC107; font-weight: bold; font-size: 13px;">⏳ Uygulanıyor...</div>';
            }
        }
    }
};

window.actionReject = function(id) {
    window.diffStateStore[id] = 'rejected';
    const block = document.getElementById(`block_${id}`);
    if(block) {
        const actionsContainer = block.querySelector('.diff-actions');
        if(actionsContainer) {
            actionsContainer.innerHTML = '<div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(244, 67, 54, 0.15); border: 1px solid rgba(244, 67, 54, 0.4); border-radius: 6px; color: #F44336; font-weight: bold; font-size: 13px;">❌ Reddedildi</div>';
        }
    }
};

window.actionExecuteTool = function(id) {
    const diffData = window.diffDataStore[id];
    if (diffData) {
        vscode.postMessage({ type: 'executeTool', value: diffData });
        window.diffStateStore[id] = 'applied'; 
        
        const block = document.getElementById(`block_${id}`);
        if(block) {
            const actionsContainer = block.querySelector('.diff-actions');
            if(actionsContainer) {
                actionsContainer.innerHTML = '<div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(76, 175, 80, 0.15); border: 1px solid rgba(76, 175, 80, 0.4); border-radius: 6px; color: #4CAF50; font-weight: bold; font-size: 13px;">✅ Araç Çalıştırıldı (Döngü Devam Ediyor...)</div>';
            }
        }
    }
};

promptInput.addEventListener('input', updateSendButtonState);

function updateSendButtonState() {
    if (isGenerating) { sendBtn.disabled = true; } 
    else { sendBtn.disabled = promptInput.value.trim() === ''; }
}

sendBtn.addEventListener('click', sendMessage);
stopBtn.addEventListener('click', stopResponse);
newChatBtn.addEventListener('click', () => vscode.postMessage({ type: 'newChat' }));
closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));

promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isGenerating && promptInput.value.trim() !== '') {
            sendMessage();
        }
    }
});

function readAttachedFile(file) {
    return new Promise((resolve) => {
        if (file.type.startsWith('image/')) {
            resolve({ name: file.name, content: null, isImage: true });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, content: reader.result, isImage: false });
        reader.onerror = () => resolve({ name: file.name, content: null, isImage: false });
        reader.readAsText(file);
    });
}

async function sendMessage() {
    if (isGenerating) return;
    const text = promptInput.value.trim();
    if (!text && attachedFiles.length === 0) return;

    if (emptyState) emptyState.style.display = 'none';

    let attachmentsHtml = '';
    let attachmentsPayload = []; 

    if (attachedFiles.length > 0) {
        const fileNames = attachedFiles.map(f => escapeHtml(f.name)).join(', ');
        attachmentsHtml = '<div style="margin-bottom: 5px; font-size: 11px; opacity: 0.8; word-break: break-all;">📎 ' + fileNames + '</div>';

        for (let i = 0; i < attachedFiles.length; i++) {
            const file = attachedFiles[i];
            
            if (file.type.startsWith('image/')) {
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            const MAX_SIZE = 1024;
                            let width = img.width;
                            let height = img.height;
                            
                            if (width > height && width > MAX_SIZE) {
                                height *= MAX_SIZE / width;
                                width = MAX_SIZE;
                            } else if (height > MAX_SIZE) {
                                width *= MAX_SIZE / height;
                                height = MAX_SIZE;
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            resolve(canvas.toDataURL('image/jpeg', 0.8));
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                });
                
                attachmentsPayload.push({
                    name: file.name,
                    isImage: true,
                    content: base64
                });
            } else {
                const textContent = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsText(file);
                });
                
                attachmentsPayload.push({
                    name: file.name,
                    isImage: false,
                    content: textContent
                });
            }
        }
    }

    const userMsgHtml = '<div class="msg user"><div class="user-text">' + attachmentsHtml + escapeHtml(text) + '</div><div class="msg-footer"><button class="action-btn" title="Düzenle" onclick="editUserMessage(this)" data-text="' + escapeAttribute(text) + '">' + ICONS.edit + '</button><button class="action-btn" title="Kopyala" onclick="copyUserMessage(this)" data-text="' + escapeAttribute(text) + '">' + ICONS.copy + '</button></div></div>';

    chatBox.insertAdjacentHTML('beforeend', userMsgHtml);
    
    vscode.postMessage({ 
        type: 'sendMessage', 
        value: { text: text, attachments: attachmentsPayload, lang: window.currentLang || 'tr' } 
    });
    
    promptInput.value = '';
    attachedFiles = [];
    renderAttachmentChips();

    isUserScrollingUp = false;
    chatBox.scrollTop = chatBox.scrollHeight;
    setGeneratingState(true);
}

function stopResponse() {
    vscode.postMessage({ type: 'stopResponse' });
    setGeneratingState(false);
}

function setGeneratingState(generating) {
    isGenerating = generating;
    updateSendButtonState();
    stopBtn.style.display = generating ? 'flex' : 'none';
    sendBtn.style.display = generating ? 'none' : 'flex';
}

window.editUserMessage = function(button) {
    const text = button.getAttribute('data-text');
    promptInput.value = text;
    promptInput.focus();
    promptInput.setSelectionRange(text.length, text.length);
    updateSendButtonState();
};

window.copyUserMessage = function(button) {
    const text = button.getAttribute('data-text');
    navigator.clipboard.writeText(text).then(() => {
        button.innerHTML = ICONS.check;
        setTimeout(() => { button.innerHTML = ICONS.copy; }, 2000);
    });
};

window.copyCode = function(button) {
    const codeElement = button.parentElement.nextElementSibling.querySelector('code');
    navigator.clipboard.writeText(codeElement.innerText).then(() => {
        button.innerHTML = ICONS.check;
        setTimeout(() => { button.innerHTML = ICONS.copy; }, 2000);
    });
};

window.copyFullMessage = function(button) {
    const rawText = button.getAttribute('data-raw-text');
    navigator.clipboard.writeText(rawText).then(() => {
        button.innerHTML = ICONS.check;
        setTimeout(() => { button.innerHTML = ICONS.copy; }, 2000);
    });
};

window.selectSession = function(sessionId) {
    if (sessionId === currentSessionId) return;
    vscode.postMessage({ type: 'selectSession', value: sessionId });
};

window.deleteSession = function(event, sessionId) {
    event.stopPropagation();
    vscode.postMessage({ type: 'deleteSession', value: sessionId });
};

function renderSessionList(sessions) {
    sessionListEl.innerHTML = '';
    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item' + (s.id === currentSessionId ? ' active' : '');
        item.setAttribute('onclick', "selectSession('" + s.id + "')");
        const titleSpan = document.createElement('span');
        titleSpan.className = 'session-title';
        titleSpan.textContent = s.title;
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'session-delete-btn action-btn';
        deleteBtn.title = 'Sohbeti Sil';
        deleteBtn.innerHTML = ICONS.trash;
        deleteBtn.setAttribute('onclick', "deleteSession(event, '" + s.id + "')");
        item.appendChild(titleSpan);
        item.appendChild(deleteBtn);
        sessionListEl.appendChild(item);
    });
}

function resetChatViewToBlank() {
    currentSessionId = null;
    chatBox.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
}

window.addEventListener('message', event => {
    const message = event.data;

    if (message.type === 'triggerCommand') {
        promptInput.value = message.value;
        sendMessage();
    }
    else if (message.type === 'initSettings') {
        if(settingsEndpoint) settingsEndpoint.value = message.endpoint;
        if(settingsModel) settingsModel.value = message.model;
        if(settingsApiKey) settingsApiKey.value = message.apiKey;
        window.autoApplyMode = !!message.autoApply;
        renderModeToggleBtn();
    
    }
    else if (message.type === 'loadSessionList') {
        renderSessionList(message.value);
        currentSessionId = message.activeId;
    }
    else if (message.type === 'resetToBlank') {
        resetChatViewToBlank();
    }
    else if (message.type === 'loadHistory') {
        currentSessionId = message.sessionId || null;
        const history = message.value;
        chatBox.innerHTML = '';
        
        if (emptyState) {
            emptyState.style.display = history.length > 0 ? 'none' : 'flex';
        }

        let msgIndex = 0; 
        history.forEach(msg => {
            msgIndex++;
            if (msg.role === 'system') return;
            if (msg.role === 'user') {
                chatBox.insertAdjacentHTML('beforeend', '<div class="msg user"><div class="user-text">' + escapeHtml(msg.content) + '</div><div class="msg-footer"><button class="action-btn" title="Düzenle" onclick="editUserMessage(this)" data-text="' + escapeAttribute(msg.content) + '">' + ICONS.edit + '</button><button class="action-btn" title="Kopyala" onclick="copyUserMessage(this)" data-text="' + escapeAttribute(msg.content) + '">' + ICONS.copy + '</button></div></div>');
            } else if (msg.role === 'assistant') {
                let parsedContent = msg.content;
                try { 
                    const uiText = processAgenticTags(msg.content, "hist_" + msgIndex);
                    parsedContent = marked.parse(uiText); 
                } catch(e) {}
                chatBox.insertAdjacentHTML('beforeend', '<div class="msg ai"><div class="msg-author">ORBIT AI ASISTANI</div><div>' + parsedContent + '</div><div class="msg-footer"><button class="action-btn" title="Tüm Yanıtı Kopyala" onclick="copyFullMessage(this)" data-raw-text="' + escapeAttribute(msg.content) + '">' + ICONS.copy + '</button></div></div>');
            }
        });
        setTimeout(() => Prism.highlightAllUnder(chatBox), 50);
        chatBox.scrollTop = chatBox.scrollHeight;
        sidebar.classList.remove('open');
    }
    else if (message.type === 'startResponse') {
        if (emptyState) emptyState.style.display = 'none';
        accumulatedText = "";
        currentMsgId = "live_" + Date.now();
        currentAiMessageElement = document.createElement('div');
        currentAiMessageElement.className = 'msg ai';
        currentAiMessageElement.innerHTML = '<div class="msg-author">ORBIT AI ASISTANI</div><div class="thinking">düşünüyor...</div>';
        chatBox.appendChild(currentAiMessageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        setGeneratingState(true);
    }
    else if (message.type === 'clearThinking') {
        if (currentAiMessageElement) {
            const thinkingElem = currentAiMessageElement.querySelector('.thinking');
            if (thinkingElem) thinkingElem.remove();
            
            if(!responseContentElement || !currentAiMessageElement.contains(responseContentElement)){
                 responseContentElement = document.createElement('div');
                 currentAiMessageElement.appendChild(responseContentElement);
            }
        }
    }
    else if (message.type === 'appendChunk') {
        if (!responseContentElement) {
            if(currentAiMessageElement) {
                responseContentElement = document.createElement('div');
                currentAiMessageElement.appendChild(responseContentElement);
            } else { return; }
        }
        accumulatedText += message.value;
        try {
            const processedText = processAgenticTags(accumulatedText, currentMsgId);
            responseContentElement.innerHTML = marked.parse(processedText);
            Prism.highlightAllUnder(responseContentElement);
        } catch(err) {
            responseContentElement.innerText = accumulatedText;
        }

        let footer = currentAiMessageElement.querySelector('.msg-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'msg-footer';
            currentAiMessageElement.appendChild(footer);
        }
        footer.innerHTML = '<button class="action-btn" title="Tüm Yanıtı Kopyala" onclick="copyFullMessage(this)" data-raw-text="' + escapeAttribute(accumulatedText) + '">' + ICONS.copy + '</button>';

        if (!isUserScrollingUp) {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }
    else if (message.type === 'responseStopped') {
        if (currentAiMessageElement) {
            const thinkingElem = currentAiMessageElement.querySelector('.thinking');
            if (thinkingElem) {
                thinkingElem.className = 'stopped-msg';
                thinkingElem.innerText = 'Yanıt durduruldu.';
            } else {
                const stopInfo = document.createElement('div');
                stopInfo.className = 'stopped-msg';
                stopInfo.innerText = 'Yanıt durduruldu.';
                currentAiMessageElement.appendChild(stopInfo);
            }
        }
        setGeneratingState(false);
    }
    else if (message.type === 'addError') {
        chatBox.insertAdjacentHTML('beforeend', '<div class="msg ai" style="border-color: red;"><b>Hata:</b> ' + message.value + '</div>');
        setGeneratingState(false);
    }
    else if (message.type === 'applyResult') {
        const id = message.id;
        const block = document.getElementById(`block_${id}`);
        if (block) {
            const actionsContainer = block.querySelector('.diff-actions');
            if (actionsContainer) {
                if (message.success) {
                    window.diffStateStore[id] = 'applied';
                    actionsContainer.innerHTML = '<div style="display: flex; justify-content: center; width: 100%; padding: 8px; background-color: rgba(76, 175, 80, 0.15); border: 1px solid rgba(76, 175, 80, 0.4); border-radius: 6px; color: #4CAF50; font-weight: bold; font-size: 13px;">✅ Başarıyla Uygulandı</div>';
                } else {
                    delete window.diffStateStore[id];
                    actionsContainer.innerHTML = '<div style="width: 100%;"><div style="padding: 8px; background-color: rgba(244, 67, 54, 0.15); border: 1px solid rgba(244, 67, 54, 0.4); border-radius: 6px; color: #F44336; font-weight: bold; font-size: 13px; margin-bottom: 6px;">❌ Uygulanamadı: ' + escapeHtml(message.message || 'Bilinmeyen hata') + '</div><div class="diff-actions">\n<button class="diff-btn approve" onclick="actionApply(\'' + id + '\')">Tekrar Dene</button>\n<button class="diff-btn reject" onclick="actionReject(\'' + id + '\')">Reddet</button>\n</div></div>';
                }
            }
        }
    }
    else if (message.type === 'endResponse') {
        setGeneratingState(false);
    }
    else if (message.type === 'initNotepad') {
        if (notepadTextarea) notepadTextarea.value = message.value || '';
    }
    else if (message.type === 'openNotepad') { 
        if (notepadOverlay) notepadOverlay.style.display = 'flex';
        vscode.postMessage({ type: 'loadNotepad' });
    }
});

function escapeHtml(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escapeAttribute(text) { return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function triggerSecurityScan() {
    vscode.postMessage({ type: 'scanSecurity' });
    setGeneratingState(true);
}

function triggerTerminalAnalysis() {
    vscode.postMessage({ type: 'analyzeTerminal' });
    setGeneratingState(true);
}
updateSendButtonState();
vscode.postMessage({ type: 'ready' });