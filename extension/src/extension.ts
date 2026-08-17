import * as vscode from 'vscode';
import { ChatViewProvider } from './presentation/providers/ChatViewProvider';
import { SettingsPanelProvider } from './presentation/providers/SettingsPanelProvider';
import { DiffContentProvider } from './infrastructure/config/DiffContentProvider';
import { Logger } from './utils/Logger'; 
import { InlineDiffManager } from './presentation/decorations/InlineDiffManager';
import { GitService } from './infrastructure/git/GitService';
import { LmStudioService } from './infrastructure/llm/LmStudioService'; // Huna Servisini ekledik

export function activate(context: vscode.ExtensionContext) {
    // 1. Logger'ı eklenti adıyla başlat
    Logger.initialize('ORBIT AI Assistant');
    
    // 2. Başlangıç mesajını ve testleri Logger ile Output paneline yazdır
    Logger.info('ORBIT AI Assistant Faz 3 Agentic Modu başlatıldı!');
    Logger.debug(`TEST - Supabase URL: ${process.env.SUPABASE_URL || 'BULUNAMADI'}`);
    Logger.debug(`TEST - Supabase Key: ${process.env.SUPABASE_ANON_KEY ? 'YÜKLENDİ ✅' : 'YOK ❌'}`);

    const provider = new ChatViewProvider(context);
    const diffProvider = new DiffContentProvider();
    const llmService = new LmStudioService(); // LLM servisini başlattık
    
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('ORBIT-diff', diffProvider)
    );
    provider.setDiffProvider(diffProvider);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
    );

    // 3. Promptları (komutları) tek bir push içinde düzenli şekilde kaydediyoruz
    context.subscriptions.push(
        vscode.commands.registerCommand('ORBIT.explainCode', () => provider.handleEditorCommand('Bu kodu detaylıca açıklar mısın?')),
        
        vscode.commands.registerCommand('ORBIT.fixError', () => provider.handleEditorCommand('Bu koddaki hatayı bulup düzeltir misin?\n\nLÜTFEN SADECE AŞAĞIDAKİ XML FORMATINDA CEVAP VER:\n<change file="dosya_adi.js">\n<old>\n// buraya eski kod\n</old>\n<new>\n// buraya yeni kod\n</new>\n</change>')),
        
        vscode.commands.registerCommand('ORBIT.acceptInlineDiff', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) InlineDiffManager.accept(editor);
        }),
        
        vscode.commands.registerCommand('ORBIT.rejectInlineDiff', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) InlineDiffManager.reject(editor);
        }),
        
        vscode.commands.registerCommand('ORBIT.writeTest', () => provider.handleEditorCommand('Bu kod için uygun testleri yazar mısın?\n\nLÜTFEN SADECE AŞAĞIDAKİ XML FORMATINDA CEVAP VER:\n<create file="test_dosyasi.js">\n// buraya test kodları gelecek\n</create>')),

        // Git Commit Mesajı Üretme Komutu
        vscode.commands.registerCommand('ORBIT.generateCommitMessage', async () => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.SourceControl,
                title: "Huna AI: Commit mesajı üretiliyor..."
            }, async () => {
                // 1. Değişiklikleri al
                const diff = await GitService.getStagedDiff();
                if (!diff) return;

                // 2. Yapay Zekaya Gönder (Statik mesaj silindi, gerçek API bağlandı)
                const commitMessage = await llmService.fetchCommitMessage(diff); 
                
                // 3. Git Input kutusuna yazdır
                await GitService.setCommitMessage(commitMessage);
            });
        }),

        // --- YENİ EKLENEN ÜST MENÜ (ORBIT) BUTONLARI İÇİN KOMUTLAR ---
        vscode.commands.registerCommand('ORBIT.action.newChat', () => {
            // Arayüze "Yeni sohbet aç" mesajı gönderiyoruz
            (provider as any)._view?.webview.postMessage({ type: 'newChat' });
        }),

        vscode.commands.registerCommand('ORBIT.action.history', () => {
            // Arayüze "Geçmişi aç" mesajı gönderiyoruz
            (provider as any)._view?.webview.postMessage({ type: 'toggleHistory' });
        }),

        vscode.commands.registerCommand('ORBIT.action.settings', () => {
            vscode.commands.executeCommand('ORBIT.openSettingsPanel');
        }),

        vscode.commands.registerCommand('ORBIT.openSettingsPanel', () => {
            SettingsPanelProvider.createOrShow(context, provider);
        }),

        vscode.commands.registerCommand('ORBIT.action.notepad', () => {
            // Not defteri tıklanınca alt köşede bildirim çıkar
            vscode.window.showInformationMessage("Not Defteri özelliği yakında eklenecektir.");
        })
    );
}

export function deactivate() {}