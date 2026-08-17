import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';
import { ChatService } from '../../application/services/ChatService';
import { VsCodeChatHistoryRepository } from '../../infrastructure/persistence/VsCodeChatHistoryRepository';
import { VsCodeConfig } from '../../infrastructure/config/VsCodeConfig';
import { LmStudioService } from '../../infrastructure/llm/LmStudioService';
import { DiffContentProvider } from '../../infrastructure/config/DiffContentProvider';
import { InlineDiffManager } from '../decorations/InlineDiffManager';
import { Logger } from '../../utils/Logger';

const execAsync = util.promisify(exec);

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiChatView';

    private _view?: vscode.WebviewView;
    private _cancellationTokenSource?: vscode.CancellationTokenSource;
    private _chatService: ChatService;
    private _diffProvider?: DiffContentProvider;
    
    private _externalFilePaths: Map<string, string> = new Map();
    private _lastAttachments: Map<string, string> = new Map();
    private _currentLang: string = 'tr';

    constructor(private readonly _context: vscode.ExtensionContext) {
        const historyRepository = new VsCodeChatHistoryRepository(this._context);
        const config = new VsCodeConfig();
        const llmProvider = new LmStudioService();
        
        this._chatService = new ChatService(historyRepository, llmProvider);
    }

    public setDiffProvider(diffProvider: DiffContentProvider) {
        this._diffProvider = diffProvider;
    }

    public getCurrentLang(): string {
        return this._currentLang;
    }

    public setCurrentLang(lang: string) {
        this._currentLang = lang || 'tr';
    }

    public handleEditorCommand(prompt: string) {
        vscode.commands.executeCommand('aiChatView.focus'); 
        setTimeout(() => {
            this._postMessageToWebview({ type: 'triggerCommand', value: prompt });
        }, 500);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'scanSecurity':
                    const securityPrompt = `[SİBER GÜVENLİK ANALİZİ]\nLütfen şu an açık olan dosyadaki veya seçili koddaki potansiyel siber güvenlik zafiyetlerini (SQL Injection, XSS, kimlik bilgisi sızıntısı, zayıf şifreleme, yetkisiz erişim vb.) bir sızma testi (penetration test) uzmanı gibi incele. Zafiyet bulursan nasıl istismar edilebileceğini kısaca açıkla ve ardından güvenli halini XML formatında (<change>) öner.`;
                    await this._handleSendMessage(securityPrompt);
                    this._sendSessionList();
                    break;
                case 'analyzeTerminal':
                    await this._handleAnalyzeTerminal();
                    this._sendSessionList();
                    break;
                case 'ready':
                    this._sendSessionList();
                    const activeId = this._chatService.getCurrentSessionId();
                    if (activeId) {
                        this._postMessageToWebview({
                            type: 'loadHistory',
                            value: this._chatService.getCurrentMessages(),
                            sessionId: activeId
                        });
                    }
                    const config = vscode.workspace.getConfiguration('ORBITAiAssistant');
                    this._postMessageToWebview({
                        type: 'initSettings',
                        endpoint: config.get<string>('endpoint') || '',
                        model: config.get<string>('model') || '',
                        apiKey: config.get<string>('apiKey') || '',
                        autoApply: config.get<boolean>('autoApply') || false,
                        lang: this._currentLang
                    });
                    break;
                case 'saveNotepad':
                    this._context.globalState.update('ORBIT.savedNotes', data.value);
                    vscode.window.showInformationMessage('Notlar başarıyla kaydedildi.');
                    break;
                case 'loadNotepad':
                    const savedNotes = this._context.globalState.get<string>('ORBIT.savedNotes') || '';
                    this._view?.webview.postMessage({ type: 'initNotepad', value: savedNotes });
                    break;
                case 'setAutoApply':
                    await vscode.workspace.getConfiguration('ORBITAiAssistant').update('autoApply', !!data.value, vscode.ConfigurationTarget.Global);
                    break;
                case 'saveSettings':
                    const updateConfig = vscode.workspace.getConfiguration('ORBITAiAssistant');
                    await updateConfig.update('endpoint', data.value.endpoint, vscode.ConfigurationTarget.Global);
                    await updateConfig.update('model', data.value.model, vscode.ConfigurationTarget.Global);
                    if (typeof data.value.apiKey === 'string') {
                        await updateConfig.update('apiKey', data.value.apiKey, vscode.ConfigurationTarget.Global);
                    }
                    break;
                case 'newChat':
                    this._chatService.resetToNewDraft();
                    this._postMessageToWebview({ type: 'resetToBlank' });
                    this._sendSessionList();
                    break;
                case 'selectSession':
                    this._chatService.selectSession(data.value);
                    this._postMessageToWebview({
                        type: 'loadHistory',
                        value: this._chatService.getCurrentMessages(),
                        sessionId: this._chatService.getCurrentSessionId()
                    });
                    this._sendSessionList();
                    break;
                case 'deleteSession':
                    await this._chatService.deleteSession(data.value);
                    if (!this._chatService.getCurrentSessionId()) {
                        this._postMessageToWebview({ type: 'resetToBlank' });
                    }
                    this._sendSessionList();
                    break;
                case 'sendMessage':
                    if (typeof data.value === 'string') {
                        await this._handleSendMessage(data.value);
                    } else {
                        if (data.value.lang) { this._currentLang = data.value.lang; }
                        await this._handleSendMessage(data.value.text, false, data.value.attachments);
                    }
                    this._sendSessionList();
                    break;
                case 'setLanguage':
                    this._currentLang = data.value || 'tr';
                    break;
                case 'openNativeSettings':
                    // VS Code'un genel Ayarlar sekmesini, bu eklentinin ayarlarına filtrelenmiş şekilde aç
                    vscode.commands.executeCommand('workbench.action.openSettings', 'ORBITAiAssistant');
                    break;
                case 'openSettingsPanel':
                    // Ayarlar paneli
                    vscode.commands.executeCommand('ORBIT.openSettingsPanel');
                    break;
                case 'stopResponse':
                    this._handleStopResponse();
                    break;
                case 'previewDiff':
                    await this._handlePreviewDiff(data.value);
                    break;
                case 'applyDiff':
                    await this._handleApplyDiff(data.value);
                    break;
                case 'executeTool':
                    await this._handleExecuteTool(data.value);
                    break;
            }
        });
    }

    private async _resolveTargetUri(diffData: any): Promise<vscode.Uri | null> {
        const diffDataFile = diffData.file;
        const diffFileName = path.basename(diffDataFile);

        if (path.isAbsolute(diffDataFile)) return vscode.Uri.file(diffDataFile);
        if (this._externalFilePaths.has(diffDataFile)) return vscode.Uri.file(this._externalFilePaths.get(diffDataFile)!);
        if (this._externalFilePaths.has(diffFileName)) return vscode.Uri.file(this._externalFilePaths.get(diffFileName)!);
        if (diffDataFile === "mevcut_dosya" && this._externalFilePaths.has("mevcut_dosya")) {
            return vscode.Uri.file(this._externalFilePaths.get("mevcut_dosya")!);
        }

        if (diffDataFile !== "mevcut_dosya") {
            for (const doc of vscode.workspace.textDocuments) {
                if (path.basename(doc.fileName) === diffFileName || doc.fileName.endsWith(diffDataFile)) {
                    return doc.uri;
                }
            }
        }

        const editor = vscode.window.activeTextEditor;
        if (diffDataFile === "mevcut_dosya") {
            if (editor) return editor.document.uri;
            vscode.window.showErrorMessage("Aktif bir dosya veya önceden çağrılmış dış dosya bulunamadı.");
            return null;
        }

        const rootFolders = vscode.workspace.workspaceFolders;
        if (rootFolders) {
            const searchPattern = `**/${diffFileName}`;
            const foundFiles = await vscode.workspace.findFiles(searchPattern, '{**/node_modules/**,**/out/**,**/dist/**}');

            if (foundFiles.length === 1) {
                return foundFiles[0]; 
            } else if (foundFiles.length > 1) {
                if (editor && path.basename(editor.document.uri.fsPath) === diffFileName) {
                    return editor.document.uri;
                }
                vscode.window.showWarningMessage(`Projede ${foundFiles.length} adet "${diffFileName}" bulundu! Lütfen değiştirmek istediğiniz dosyayı VS Code'da açıp öyle Uygula'ya basın.`);
                return null; 
            }
        }

        if (rootFolders) {
            return vscode.Uri.file(path.join(rootFolders[0].uri.fsPath, diffDataFile));
        }

        vscode.window.showErrorMessage(`"${diffFileName}" dosyasını bulamadık. Klasör açık değilse lütfen dosyanın tam yolunu yazın.`);
        return null;
    }

    private _cleanGarbage(str: string): string {
        if (!str) return "";
        let s = str;
        s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        s = s.replace(/```[a-zA-Z]*/g, '').replace(/```/g, '');
        s = s.replace(/JAVASCRIPT/gi, '').replace(/TYPESCRIPT/gi, ''); 
        return s.trim();
    }

  private async _handleApplyDiff(diffData: any) {
        const diffId = diffData.id;
        const reportResult = (success: boolean, message?: string) => {
            if (diffId) {
                this._postMessageToWebview({ type: 'applyResult', id: diffId, success, message });
            }
        };

        const targetUri = await this._resolveTargetUri(diffData);
        if (!targetUri) {
            reportResult(false, 'Hedef dosya bulunamadı.');
            return;
        }

        diffData.oldCode = this._cleanGarbage(diffData.oldCode);
        diffData.newCode = this._cleanGarbage(diffData.newCode);
        if (diffData.type === 'create') diffData.content = this._cleanGarbage(diffData.content);

        const edit = new vscode.WorkspaceEdit();
        const targetPath = targetUri.fsPath;

        let changeRange: vscode.Range | undefined;

        if (diffData.type === 'create') {
            edit.createFile(targetUri, { ignoreIfExists: true });
            edit.insert(targetUri, new vscode.Position(0, 0), diffData.content);
        } else if (diffData.type === 'change') {
            try {
                await vscode.workspace.fs.stat(targetUri);
            } catch (e) {
                const msg = `"${path.basename(targetPath)}" adında bir dosya sistemde bulunamadı.`;
                vscode.window.showErrorMessage(msg);
                reportResult(false, msg);
                return;
            }

            try {
                const doc = await vscode.workspace.openTextDocument(targetUri);
                const text = doc.getText();
                
                if (diffData.oldCode === "") {
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document.uri.toString() === targetUri.toString() && !editor.selection.isEmpty) {
                        changeRange = editor.selection;
                    } else {
                        changeRange = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length));
                    }
                } else {
                    const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
                    let normalizedOldCode = diffData.oldCode.replace(/\r?\n/g, eol);

                    let startIndex = text.indexOf(normalizedOldCode);
                    let matchedLength = normalizedOldCode.length;
                    
                    if (startIndex === -1) {
                        normalizedOldCode = normalizedOldCode.trim();
                        startIndex = text.indexOf(normalizedOldCode);
                        matchedLength = normalizedOldCode.length;
                    }

                    if (startIndex === -1) {
                        let safeOld = diffData.oldCode.replace(/\.{3,}/g, ' ___WILDCARD___ ');
                        const tokens = safeOld.trim().split(/\s+/);
                        if (tokens.length > 0 && tokens[0] !== "") {
                            const escapeRegExp = (str: string) => {
                                if (str === "___WILDCARD___") return "[\\s\\S]*?";
                                return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            };
                            const regexPattern = tokens.map(escapeRegExp).join('\\s+');
                            try {
                                const regex = new RegExp(regexPattern);
                                const match = regex.exec(text);
                                if (match) {
                                    startIndex = match.index;
                                    matchedLength = match[0].length;
                                }
                            } catch (err) {}
                        }
                    }

                    if (startIndex !== -1) {
                        const startPos = doc.positionAt(startIndex);
                        const endPos = doc.positionAt(startIndex + matchedLength);
                        changeRange = new vscode.Range(startPos, endPos);
                    } else {
                        const editor = vscode.window.activeTextEditor;
                        if (editor && editor.document.uri.toString() === targetUri.toString() && !editor.selection.isEmpty) {
                            changeRange = editor.selection;
                        } else {
                            const msg = 'Eski kod parçası dosyada tam olarak bulunamadı. Değiştirmek istediğiniz kodu manuel seçip tekrar uygulayın.';
                            vscode.window.showErrorMessage(msg);
                            reportResult(false, msg);
                            return;
                        }
                    }
                }
            } catch (error) {
                const msg = `Dosya açılamadı: ${targetPath}`;
                vscode.window.showErrorMessage(msg);
                reportResult(false, msg);
                return;
            }
        }

        const autoApply = vscode.workspace.getConfiguration('ORBITAiAssistant').get<boolean>('autoApply') || false;

        try {
            if (diffData.type === 'create') {
                const success = await vscode.workspace.applyEdit(edit);
                if (!success) {
                    const msg = 'Dosya oluşturulamadı!';
                    vscode.window.showErrorMessage(msg);
                    reportResult(false, msg);
                    return;
                }
                const doc = await vscode.workspace.openTextDocument(targetUri);
                const editor = await vscode.window.showTextDocument(doc, { preview: false });

                if (autoApply) {
                    await doc.save();
                } else {
                    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
                    await InlineDiffManager.showInlineDiff(editor, fullRange, "", diffData.content);
                    await doc.save();
                }

            } else {
                if (!changeRange) {
                    reportResult(false, 'Değişiklik aralığı belirlenemedi.');
                    return;
                }

                const doc = await vscode.workspace.openTextDocument(targetUri);
                const editor = await vscode.window.showTextDocument(doc, { preview: false });

                if (autoApply) {
                    await InlineDiffManager.applyDirectly(editor, changeRange, diffData.newCode);
                } else {
                    await InlineDiffManager.showInlineDiff(editor, changeRange, diffData.oldCode, diffData.newCode);
                    await doc.save();
                }
            }

            reportResult(true);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('Diff uygulanırken hata oluştu.', error);
            vscode.window.showErrorMessage(`Değişiklik uygulanırken bir hata oluştu: ${msg}`);
            reportResult(false, msg);
        }
    }

    private async _handlePreviewDiff(diffData: any) {
        if (!this._diffProvider) return;

        const targetUri = await this._resolveTargetUri(diffData);
        if (!targetUri) return;

        const newCode = this._cleanGarbage(diffData.type === 'create' ? diffData.content : diffData.newCode);
        let oldCode = this._cleanGarbage(diffData.oldCode || '');

        if (diffData.type !== 'create' && (oldCode === '' || diffData.oldCode === '')) {
            try {
                const doc = await vscode.workspace.openTextDocument(targetUri);
                oldCode = doc.getText();
            } catch {
                oldCode = '';
            }
        }

        const fileName = path.basename(targetUri.fsPath);
        const stamp = Date.now();
        const oldUri = vscode.Uri.parse(`ORBIT-diff:${fileName} (Mevcut)?${stamp}-old`);
        const newUri = vscode.Uri.parse(`ORBIT-diff:${fileName} (Önerilen)?${stamp}-new`);

        this._diffProvider.setContent(oldUri, oldCode);
        this._diffProvider.setContent(newUri, newCode);

        await vscode.commands.executeCommand(
            'vscode.diff',
            oldUri,
            newUri,
            `${fileName}: Mevcut ↔ Önerilen (Önizleme)`,
            { preview: true }
        );
    }
    private async _handleExecuteTool(data: { toolName: string, args: string }) {
        this._postMessageToWebview({ type: 'startResponse' }); 
        this._postMessageToWebview({ type: 'appendChunk', value: `*🛠️ Arka planda çalıştırılıyor: ${data.toolName}*...\n\n` });
        
        let resultStr = "";
        let isError = false;

        try {
            if (data.toolName === 'run_terminal') {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const cwd = workspaceFolders ? workspaceFolders[0].uri.fsPath : undefined;
                if (!cwd) {
                    resultStr = "Hata: Açık bir çalışma alanı (workspace) yok.";
                    isError = true;
                } else {
                    const { stdout, stderr } = await execAsync(data.args, { cwd, timeout: 30000 });
                    resultStr = stdout || stderr || "Komut başarıyla çalıştı (Çıktı yok).";
                }
            } 
            else if (data.toolName === 'read_file') {
                const filePath = data.args.trim();
                const attachedContent = this._lastAttachments.get(path.basename(filePath));

                if (attachedContent !== undefined) {
                    resultStr = `[Dosya: ${filePath}] (Kullanıcı tarafından eklenmişti)\n${attachedContent}`;
                } else {
                let targetUri: vscode.Uri | null = null;
                
                if (path.isAbsolute(filePath)) {
                    targetUri = vscode.Uri.file(filePath);
                } else {
                    const files = await vscode.workspace.findFiles(`**/${path.basename(filePath)}`, '{**/node_modules/**,**/out/**,**/dist/**}');
                    if (files.length > 0) targetUri = files[0];
                }

                if (targetUri) {
                    const doc = await vscode.workspace.openTextDocument(targetUri);
                    let fileText = doc.getText();
                    if (fileText.length > 3000) fileText = fileText.substring(0, 3000) + "\n...[DOSYA ÇOK UZUN OLDUĞU İÇİN GÜVENLİK AMACIYLA KESİLDİ]...";
                    resultStr = `[Dosya: ${path.basename(targetUri.fsPath)}]\n${fileText}`;
                } else {
                    resultStr = `Hata: "${filePath}" dosyası bulunamadı. Lütfen tam dosya yolunu belirt.`;
                    isError = true;
                }
                }
            }
            else if (data.toolName === 'search_workspace') {
                const normalizeTr = (str: string) => str.replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ş/g, 'S').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ç/g, 'C');

                let rawQuery = data.args.trim().toLowerCase(); 
                rawQuery = normalizeTr(rawQuery); 

                const stopWords = ["hangi", "dosyada", "nerede", "bulunur", "fonksiyon", "fonksiyonu", "fonksiyonlari", "fonksiyonları", "ve", "ile", "için", "icin", "var", "yok", "mi", "mu", "nedir", "peki", "kac", "kacıncı", "kaçıncı", "satır", "satırda", "satir", "satirda"];
                const keywords = rawQuery.split(/[\s,.'"?]+/).filter(w => w.length > 2 && !stopWords.includes(w));
                
                if (keywords.length === 0) keywords.push(rawQuery);

const files = await vscode.workspace.findFiles('**/*.{js,ts,dart,py,html,css,json,md,txt,php,jsx,tsx,vue,svelte,java,c,cpp,cs,go,rs,rb,swift,sql}', '{**/node_modules/**,**/out/**,**/dist/**,.git/**,.vscode/**,**/vendor/**}');                const foundFiles = new Set<string>();
                
                for (const f of files) { 
                    try {
                        const content = fs.readFileSync(f.fsPath, 'utf8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const lineLower = normalizeTr(lines[i].toLowerCase());
                            const isMatch = keywords.some(kw => lineLower.includes(kw));
                            if (isMatch) {
                                foundFiles.add(`${path.basename(f.fsPath)} (Satır: ${i+1})`);
                                break; 
                            }
                        }
                    } catch (e) {}
                    if (foundFiles.size >= 10) break; 
                }
                
                if (foundFiles.size > 0) {
                    resultStr = `Aranan kelimeler şu dosyalarda bulundu: ${Array.from(foundFiles).join(', ')}`;
                } else {
                    resultStr = `Bulunamadı. (Arka planda sadece şu kelimeler arandı: ${keywords.join(', ')})`;
                    isError = true;
                }
            }
            else {
                resultStr = `Hata: Bilinmeyen araç "${data.toolName}"`;
                isError = true;
            }
        } catch (error: any) {
            resultStr = `Araç çalıştırılırken hata oluştu: ${error.message}`;
            isError = true;
        }

        this._postMessageToWebview({ type: 'clearThinking' });
        this._postMessageToWebview({ type: 'endResponse' });

        let followUpPrompt = "";
        if (isError) {
            followUpPrompt = `[Sistem Notu: ${data.toolName} aracı çalıştırıldı ancak hata alındı]\nHATA DETAYI:\n${resultStr}\n\nLütfen bu durumu bana Türkçe olarak açıkla. Başka bir araç (XML) KULLANMA.`;
        } else {
            followUpPrompt = `[Sistem Notu: ${data.toolName} aracı başarıyla çalıştı]\nELDE EDİLEN VERİ:\n${resultStr}\n\nSİSTEM KURALI: Yukarıdaki veriye bakarak kullanıcıya SADECE dosya adlarını ve satır numaralarını söyle. Kesinlikle kod (\`\`\`) yazma. Kesinlikle <change> veya <create> gibi XML etiketleri KULLANMA! Sadece "İstediğiniz kelime ... dosyasında ... satırda bulunuyor" de.`;
        }
        
        await this._handleSendMessage(followUpPrompt, true); 
    }

    private _sendSessionList() {
        this._postMessageToWebview({
            type: 'loadSessionList',
            value: this._chatService.getSessionList(),
            activeId: this._chatService.getCurrentSessionId()
        });
    }

    private async _handleSendMessage(userPrompt: string, isToolFeedback: boolean = false, attachments?: { name: string, content: string | null, isImage: boolean }[]) {
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
        }

        this._cancellationTokenSource = new vscode.CancellationTokenSource();
        this._postMessageToWebview({ type: 'startResponse' });

        this._externalFilePaths.delete("mevcut_dosya");

        let workspaceContext: string | null = null;
        let imagesPayload: string[] = []; //Fotoğraf verilerini depolayacağımız dizi

        const editor = vscode.window.activeTextEditor;
        const hasAttachments = !!attachments && attachments.length > 0;

        this._lastAttachments.clear();
        if (hasAttachments) {
            for (const att of attachments!) {
                if (!att.isImage && att.content !== null) {
                    this._lastAttachments.set(att.name, att.content);
                }
            }
        }

        const MAX_CONTEXT_LENGTH = 3000;

        if (editor && !hasAttachments) {
            const relativePath = vscode.workspace.asRelativePath(editor.document.fileName);
            const selection = editor.selection;
            
            if (!selection.isEmpty) {
                let selectedText = editor.document.getText(selection);
                if (selectedText.length > MAX_CONTEXT_LENGTH) selectedText = selectedText.substring(0, MAX_CONTEXT_LENGTH) + "\n...[SEÇİLİ METİN ÇOK UZUN OLDUĞU İÇİN GÜVENLİK AMACIYLA KESİLDİ]...";
                workspaceContext = `[Mevcut Açık Dosya: ${relativePath} - SEÇİLİ KOD]\n\`\`\`\n${selectedText}\n\`\`\``;
            } else {
                let fullText = editor.document.getText();
                if (fullText.length > MAX_CONTEXT_LENGTH) fullText = fullText.substring(0, MAX_CONTEXT_LENGTH) + "\n...[DOSYA ÇOK UZUN OLDUĞU İÇİN GÜVENLİK AMACIYLA KESİLDİ]...";
                workspaceContext = `[Mevcut Açık Dosya: ${relativePath} - TÜM KOD]\n\`\`\`\n${fullText}\n\`\`\``;
            }
        }

        if (hasAttachments) {
            let attachmentsContext = `\n[KULLANICININ BU MESAJA ÖZEL OLARAK EKLEDİĞİ DOSYA(LAR) - İÇERİK ZATEN AŞAĞIDA]\n`;
            attachmentsContext += `ÇOK ÖNEMLİ KURAL: Bu dosyanın/dosyaların TAM İÇERİĞİ zaten aşağıda verilmiştir. Kullanıcı bu dosya(lar) hakkında soru soruyor.\n`;
            attachmentsContext += `BU DOSYALAR İÇİN read_file, search_workspace VEYA BAŞKA HİÇBİR ARAÇ ÇAĞIRMA. İçerik zaten elinde, hiçbir araca ihtiyacın yok. Doğrudan aşağıdaki içeriğe bakarak cevap ver.\n`;
            attachmentsContext += `VS Code'da o an açık olan başka bir sekme varsa onu YOK SAY, sadece aşağıdaki eklenen dosya(lar)a odaklan.\n`;
            
            for (const att of attachments!) {
                // YENİ: Görsel dosyası yakalandığında imagesPayload dizisine itiyoruz
                if (att.isImage && att.content) {
                    imagesPayload.push(att.content); 
                    attachmentsContext += `\n[GÖRSEL DOSYASI EKLENDİ: ${att.name}] (Bu görselin verisi doğrudan modelin Vision API'sine iletildi)\n`;
                    continue;
                }
                
                // Normal dosya okunamadıysa
                if (att.content === null) {
                    attachmentsContext += `\n[DOSYA: ${att.name}] (Okunamayan dosya türü)\n`;
                    continue;
                }
                
                // Normal metin dosyasıysa
                let content = att.content;
                if (content.length > MAX_CONTEXT_LENGTH) {
                    content = content.substring(0, MAX_CONTEXT_LENGTH) + "\n...[DOSYA ÇOK UZUN OLDUĞU İÇİN GÜVENLİK AMACIYLA KESİLDİ]...";
                }
                attachmentsContext += `\n[DOSYA: ${att.name}]\n\`\`\`\n${content}\n\`\`\`\n`;
            }
            workspaceContext = attachmentsContext + (workspaceContext ? workspaceContext : "");
        }

        const LANG_NAMES: { [key: string]: string } = {
            tr: 'Türkçe',
            en: 'English'
        };
        const langName = LANG_NAMES[this._currentLang] || 'Türkçe';
        Logger.debug(`Aktif yanıt dili: ${langName} (${this._currentLang})`);
        const languageDirective = this._currentLang === 'en'
            ? `[LANGUAGE RULE] Always respond in English only, regardless of the language of the code, file names, or any context provided below. Do not switch to Turkish under any circumstance.\n\n`
            : `[DİL KURALI] Aşağıdaki bağlamda hangi dilde içerik olursa olsun, kullanıcıya SADECE Türkçe yanıt ver.\n\n`;

        if (!isToolFeedback) {
           let agentPrompt = languageDirective;
           agentPrompt += `\n[SİSTEM KURALLARI VE ARAÇ KULLANIMI]\n`;
            agentPrompt += `Sen bir yapay zeka asistanısın. Gerekli durumlarda projede işlem yapmak için SADECE aşağıdaki araçları kullanabilirsin:\n\n`;

            agentPrompt += `[ARAÇ LİSTESİ]\n`;
            agentPrompt += `1. search_workspace: Projede kelime arar.\n`;
            agentPrompt += `2. read_file: Belirtilen dosyanın içeriğini okur.\n`;
            agentPrompt += `3. run_terminal: Terminalde komut çalıştırır.\n\n`;

            if (hasAttachments) {
                agentPrompt += `[EN ÖNEMLİ KURAL - DİKKAT]\n`;
                agentPrompt += `Kullanıcı bu mesaja bir veya daha fazla dosya EKLEDİ ve içeriği aşağıda [KULLANICININ BU MESAJA ÖZEL OLARAK EKLEDİĞİ DOSYA(LAR)] bölümünde SANA ZATEN VERİLDİ.\n`;
                agentPrompt += `Bu eklenen dosya(lar) hakkında soru sorulduğunda ASLA read_file veya başka bir araç çağırma. Aracı çağırmak yerine doğrudan sana verilen içeriği oku ve cevapla.\n\n`;
            }

            agentPrompt += `[ÖRNEK SENARYOLAR - ÇOK ÖNEMLİ]\n`;
            agentPrompt += `Kullanıcı: "Projeden auth.js dosyasını okur musun?" (dosya EKLENMEMİŞ, sadece isim söylenmiş)\n`;
            agentPrompt += `Sen: <tool_call>\n<tool_name>read_file</tool_name>\n<args>auth.js</args>\n</tool_call>\n\n`;

            agentPrompt += `Kullanıcı: "Bu dosya ne içeriyor?" (dosya 📎 ile EKLENMİŞ ve içeriği yukarıda verilmiş)\n`;
            agentPrompt += `Sen: (Hiçbir araç çağırmadan) Bu dosya ... işlevini yapıyor, içinde ... fonksiyonu var...\n\n`;

            agentPrompt += `Kullanıcı: "Terminalde npm run build çalıştır"\n`;
            agentPrompt += `Sen: <tool_call>\n<tool_name>run_terminal</tool_name>\n<args>npm run build</args>\n</tool_call>\n\n`;

            agentPrompt += `Kullanıcı: "Projede veritabani kelimesini bul"\n`;
            agentPrompt += `Sen: <tool_call>\n<tool_name>search_workspace</tool_name>\n<args>veritabani</args>\n</tool_call>\n\n`;

            if (this._currentLang === 'en') {
                agentPrompt += `User: "Hi, how are you?"\n`;
                agentPrompt += `You: Hi! How can I help you today?\n\n`;
            } else {
                agentPrompt += `Kullanıcı: "Merhaba, nasılsın?"\n`;
                agentPrompt += `Sen: Merhaba! Size nasıl yardımcı olabilirim?\n\n`;
            }

            agentPrompt += `ÖNEMLİ DİKKAT: Araç kullanırken ASLA ekstra açıklama veya markdown (\`\`\`) kullanma. Sadece <tool_call> etiketini bas ve dur.\n`;
            agentPrompt += `[SİSTEM KURALLARI BİTİŞ]\n\n`;
            workspaceContext = agentPrompt + (workspaceContext ? workspaceContext : "");
        } else {
            workspaceContext = languageDirective + (workspaceContext ? workspaceContext : "");
        }

        const extractPaths = (text: string) => {
            const paths = new Set<string>();
            let match;
            
            const quotedRegex = /["']([^"']+)["']/g;
            while ((match = quotedRegex.exec(text)) !== null) {
                paths.add(match[1]);
            }
            
            const plainRegex = /([a-zA-Z]:\\[^\s<>|"?*]+|\/[^\s<>|"?*]+)/g;
            while ((match = plainRegex.exec(text)) !== null) {
                paths.add(match[1]);
            }

            const fileRegex = /(?:[\w-]+\/)*[\w.-]+\.(dart|js|ts|jsx|tsx|py|html|css|scss|json|md|txt|java|c|cpp|cs|go|rs|php|rb|swift|vue|svelte)\b/g;
            while ((match = fileRegex.exec(text)) !== null) {
                paths.add(match[0]);
            }
            
            return Array.from(paths);
        };

        const foundPaths = isToolFeedback ? [] : extractPaths(userPrompt);
        let extraFilesContext = "";

        for (const fp of foundPaths) {
            try {
                let fileUri: vscode.Uri | null = null;

                if (path.isAbsolute(fp) && fs.existsSync(fp)) {
                    fileUri = vscode.Uri.file(fp);
                } else {
                    const files = await vscode.workspace.findFiles(`**/${path.basename(fp)}`, '{**/node_modules/**,**/out/**,**/dist/**}');
                    if (files.length > 0) {
                        fileUri = files[0];
                    }
                }

                if (fileUri) {
                    const doc = await vscode.workspace.openTextDocument(fileUri);
                    let content = doc.getText();
                    
                    if (content.length > MAX_CONTEXT_LENGTH) {
                        content = content.substring(0, MAX_CONTEXT_LENGTH) + "\n...[DIŞ DOSYA ÇOK UZUN OLDUĞU İÇİN GÜVENLİK AMACIYLA KESİLDİ]...";
                    }
                    
                    extraFilesContext += `\n[DIŞ DOSYA BAŞLANGICI: ${fileUri.fsPath}]\n`;
                    extraFilesContext += `SİSTEM KURALI: Bu dosyada kod değiştirmek için SADECE AŞAĞIDAKİ XML FORMATINI KULLANMALISIN!\n`;
                    extraFilesContext += `ÇOK ÖNEMLİ DİKKAT: <old> etiketine dosyanın ŞU ANKİ (DEĞİŞMEMİŞ) halini, <new> etiketine YENİ halini yazacaksın. <old> etiketinin içine asla yeni ürettiğin kodları yazma!\n`;
                    extraFilesContext += `ÖRNEK KULLANIM:\n`;
                    extraFilesContext += `<change file="${path.basename(fileUri.fsPath)}">\n`;
                    extraFilesContext += `<old>\nfunction topla(a, b) {\n    return a + b;\n}\n</old>\n`;
                    extraFilesContext += `<new>\nfunction topla(a, b, c) {\n    return a + b + c;\n}\n</new>\n`;
                    extraFilesContext += `</change>\n`;
                    extraFilesContext += `\nŞu Anki Gerçek Dosya İçeriği:\n\`\`\`\n${content}\n\`\`\`\n[DIŞ DOSYA BİTİŞİ]\n`;
                    
                    this._externalFilePaths.set(path.basename(fileUri.fsPath), fileUri.fsPath); 
                    this._externalFilePaths.set("mevcut_dosya", fileUri.fsPath); 
                }
            } catch (e) {
                console.error("Dosya okuma hatası:", e);
            }
        }

        if (extraFilesContext) {
            workspaceContext = (workspaceContext ? workspaceContext + "\n" : "") + extraFilesContext;
        }

        try {
            //streamChatResponse artık imagesPayload verisini de alıyor
            await (this._chatService.streamChatResponse as any)(
                userPrompt,
                workspaceContext,
                imagesPayload, //GÖRSELLERİN BASE64 HALİ BURADA GÖNDERİLİYOR
                this._cancellationTokenSource.token,
                (chunk: string) => {
                    if (this._cancellationTokenSource?.token.isCancellationRequested) return;
                    this._postMessageToWebview({ type: 'appendChunk', value: chunk });
                },
                () => {
                    if (this._cancellationTokenSource?.token.isCancellationRequested) return;
                    this._postMessageToWebview({ type: 'clearThinking' });
                }
            );
        } catch (error: any) {
            let errMsg = error.message || "Failed to connect to LLM server!";
            if (!this._cancellationTokenSource?.token.isCancellationRequested) {
                this._postMessageToWebview({ type: 'addError', value: errMsg });
            }
        } finally {
            this._postMessageToWebview({ type: 'clearThinking' });
            this._postMessageToWebview({ type: 'endResponse' });
        }
    }
    private async _handleAnalyzeTerminal() {
        try {
            if (!vscode.window.activeTerminal) {
                vscode.window.showErrorMessage("Aktif bir terminal bulunamadı. Lütfen önce bir terminal açın.");
                this._postMessageToWebview({ type: 'endResponse' }); 
                return;
            }

            // VS Code uzantılarının terminal okuması için kullanılan zekice bir hile:
            // 1. Kullanıcının mevcut panosunukaydet
            const oldClipboard = await vscode.env.clipboard.readText();
            
            // 2. Terminali seç ve kopyala
            await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
            await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
            await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');
            
            // 3. Kopyalanan terminal metnini al
            let terminalText = await vscode.env.clipboard.readText();
            
            // 4. Kullanıcının eski panosunu geri yükle
            await vscode.env.clipboard.writeText(oldClipboard);

            if (!terminalText || terminalText.trim() === '') {
                vscode.window.showWarningMessage("Terminal boş veya okunamadı.");
                this._postMessageToWebview({ type: 'endResponse' }); 
                return;
            }

            // Hafıza (Token) şişmesini önlemek için sadece son 100 satırı alıyoruz
            const lines = terminalText.split('\n');
            const lastLines = lines.slice(-100).join('\n');

            const prompt = `[TERMINAL HATA ANALİZİ]\nTerminalde aşağıdaki çıktı/hata alındı. Lütfen bu durumu analiz et, sorunun nedenini açıkla ve çözüm yolunu (gerekiyorsa XML <change> veya <run_terminal> aracı ile) sun:\n\n\`\`\`\n${lastLines}\n\`\`\``;
            
            await this._handleSendMessage(prompt);

        } catch (error) {
            Logger.error("Terminal okuma hatası:", error);
            vscode.window.showErrorMessage("Terminal okunurken bir hata oluştu.");
            this._postMessageToWebview({ type: 'endResponse' }); 
        }
    }

    private _handleStopResponse() {
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
        }
        this._postMessageToWebview({ type: 'responseStopped' });
        this._postMessageToWebview({ type: 'endResponse' }); 
    }

    private _postMessageToWebview(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        try {
            const htmlPath = path.join(this._context.extensionUri.fsPath, 'src', 'presentation', 'webview', 'index.html');
            const cssPath = path.join(this._context.extensionUri.fsPath, 'src', 'presentation', 'webview', 'style.css');
            const jsPath = path.join(this._context.extensionUri.fsPath, 'src', 'presentation', 'webview', 'main.js');

            let htmlContent = fs.readFileSync(htmlPath, 'utf8');

            const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
            const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));

            htmlContent = htmlContent.replace('{{CSS_URI}}', cssUri.toString());
            htmlContent = htmlContent.replace('{{JS_URI}}', jsUri.toString());

            return htmlContent;
        } catch (error) {
            return `<!DOCTYPE html><html><body><h1>Arayüz dosyası okunamadı!</h1><p>${error}</p></body></html>`;
        }
    }
}