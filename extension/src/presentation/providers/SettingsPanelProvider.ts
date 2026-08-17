import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatViewProvider } from './ChatViewProvider';

/**
 * ORBIT Ayarlarını, VS Code'un normal Ayarlar sekmesi gibi
 * editör alanında büyük bir sekme (WebviewPanel) olarak açar.
 * (Copilot'un "Agent Customizations" paneline benzer bir deneyim.)
 */
export class SettingsPanelProvider {
    public static currentPanel: SettingsPanelProvider | undefined;
    public static readonly viewType = 'ORBIT.settingsPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private readonly _chatProvider: ChatViewProvider;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(context: vscode.ExtensionContext, chatProvider: ChatViewProvider) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SettingsPanelProvider.currentPanel) {
            SettingsPanelProvider.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            SettingsPanelProvider.viewType,
            'ORBIT Ayarları',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [context.extensionUri],
                retainContextWhenHidden: true
            }
        );

        SettingsPanelProvider.currentPanel = new SettingsPanelProvider(panel, context, chatProvider);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, chatProvider: ChatViewProvider) {
        this._panel = panel;
        this._context = context;
        this._chatProvider = chatProvider;

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready': {
                    const config = vscode.workspace.getConfiguration('ORBITAiAssistant');
                    this._panel.webview.postMessage({
                        type: 'initSettings',
                        endpoint: config.get<string>('endpoint') || '',
                        model: config.get<string>('model') || '',
                        apiKey: config.get<string>('apiKey') || '',
                        autoApply: config.get<boolean>('autoApply') || false,
                        lang: this._chatProvider.getCurrentLang()
                    });
                    break;
                }
                case 'saveSettings': {
                    const updateConfig = vscode.workspace.getConfiguration('ORBITAiAssistant');
                    await updateConfig.update('endpoint', data.value.endpoint, vscode.ConfigurationTarget.Global);
                    await updateConfig.update('model', data.value.model, vscode.ConfigurationTarget.Global);
                    if (typeof data.value.apiKey === 'string') {
                        await updateConfig.update('apiKey', data.value.apiKey, vscode.ConfigurationTarget.Global);
                    }
                    vscode.window.showInformationMessage('ORBIT ayarları kaydedildi.');
                    break;
                }
                case 'setAutoApply': {
                    await vscode.workspace.getConfiguration('ORBITAiAssistant').update('autoApply', !!data.value, vscode.ConfigurationTarget.Global);
                    break;
                }
                case 'setLanguage': {
                    this._chatProvider.setCurrentLang(data.value || 'tr');
                    break;
                }
                case 'openNativeSettings': {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'ORBITAiAssistant');
                    break;
                }
            }
        }, null, this._disposables);
    }

    private dispose() {
        SettingsPanelProvider.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        try {
            const htmlPath = path.join(this._context.extensionUri.fsPath, 'src', 'presentation', 'webview', 'settings.html');
            const cssPath = path.join(this._context.extensionUri.fsPath, 'src', 'presentation', 'webview', 'style.css');
            const jsPath = path.join(this._context.extensionUri.fsPath, 'src', 'presentation', 'webview', 'settings.js');

            let htmlContent = fs.readFileSync(htmlPath, 'utf8');

            const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
            const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));

            htmlContent = htmlContent.replace('{{CSS_URI}}', cssUri.toString());
            htmlContent = htmlContent.replace('{{JS_URI}}', jsUri.toString());
            htmlContent = htmlContent.replace(/\{\{cspSource\}\}/g, webview.cspSource);

            return htmlContent;
        } catch (error) {
            return `<!DOCTYPE html><html><body><h1>Ayarlar arayüzü okunamadı!</h1><p>${error}</p></body></html>`;
        }
    }
}