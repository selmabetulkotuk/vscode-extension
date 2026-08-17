import * as vscode from 'vscode';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    // Sanal dosya içeriklerini bellekte tutacağımız harita (Map)
    private contentMap = new Map<string, string>();
    
    // Dosya içeriği değiştiğinde VS Code'a "ekranı yenile" diyen tetikleyici
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    // VS Code sanal dosyayı ekrana çizeceği zaman bu fonksiyonu çağırır
    provideTextDocumentContent(uri: vscode.Uri): string {
        // ÇÖZÜM: Windows dosya yolu bug'ını aşmak için uri.toString() yerine 
        // doğrudan eşsiz uri.query kısmını anahtar olarak kullanıyoruz!
        return this.contentMap.get(uri.query) || '';
    }

    public setContent(uri: vscode.Uri, content: string) {
        // Belleğe kaydederken de sadece query kısmını kullan
        this.contentMap.set(uri.query, content);
        this._onDidChange.fire(uri);
    }
}