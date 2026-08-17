import * as vscode from 'vscode';
import * as Diff from 'diff';

interface PendingChange {
    addedRanges: vscode.Range[];
    removedRanges: vscode.Range[];
}

/**
 * Dosya içinde, git benzeri yeşil (eklenen) / kırmızı (silinen)
 * inline diff gösterimi ve Kabul Et / Geri Al akışını yönetir.
 */
export class InlineDiffManager {
    // GitHub/GitLab PR diff ekranındaki gibi: tam genişlik yeşil/kırmızı satır arka planı
    // + solda '+' / '-' işareti. Silinen satırlar üstü çizili DEĞİL (GitHub'da da öyle).
    private static addedDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(46, 160, 67, 0.2)',
        isWholeLine: true,
        overviewRulerColor: 'rgba(46, 160, 67, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Full,
        before: {
            contentText: '+',
            color: '#3fb950',
            fontWeight: 'bold',
            margin: '0 8px 0 4px',
        },
    });

    private static removedDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(248, 81, 73, 0.2)',
        isWholeLine: true,
        overviewRulerColor: 'rgba(248, 81, 73, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Full,
        before: {
            contentText: '-',
            color: '#f85149',
            fontWeight: 'bold',
            margin: '0 8px 0 4px',
        },
    });

    private static statusBarItem: vscode.StatusBarItem;
    private static pending = new Map<string, PendingChange>();

    private static ensureStatusBar() {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
            this.statusBarItem.text = '$(check) Kabul Et (Ctrl+Enter)   $(discard) Geri Al (Ctrl+Backspace)';
            this.statusBarItem.command = 'ORBIT.acceptInlineDiff';
        }
    }

    /**
     * oldCode -> newCode değişimini `range` konumuna yazar ve
     * satır satır yeşil/kırmızı boyar.
     */
    public static async showInlineDiff(
        editor: vscode.TextEditor,
        range: vscode.Range,
        oldCode: string,
        newCode: string
    ) {
        const eol = editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const diffParts = Diff.diffLines(oldCode, newCode);

        type Line = { text: string; type: 'same' | 'added' | 'removed' };
        const mergedLines: Line[] = [];

        for (const part of diffParts) {
            const lines = part.value.split(/\r?\n/);
            if (lines[lines.length - 1] === '') lines.pop(); // sondaki boş satırı at
            const type: Line['type'] = part.added ? 'added' : part.removed ? 'removed' : 'same';
            for (const line of lines) mergedLines.push({ text: line, type });
        }

        const mergedText = mergedLines.map(l => l.text).join(eol);

        await editor.edit(editBuilder => {
            editBuilder.replace(range, mergedText);
        });

        const addedRanges: vscode.Range[] = [];
        const removedRanges: vscode.Range[] = [];
        let currentLine = range.start.line;

        for (const l of mergedLines) {
            const lineRange = editor.document.lineAt(currentLine).range;
            if (l.type === 'added') addedRanges.push(lineRange);
            if (l.type === 'removed') removedRanges.push(lineRange);
            currentLine++;
        }

        editor.setDecorations(this.addedDecoration, addedRanges);
        editor.setDecorations(this.removedDecoration, removedRanges);

        const key = editor.document.uri.toString();
        this.pending.set(key, { addedRanges, removedRanges });

        this.ensureStatusBar();
        this.statusBarItem.show();
        vscode.commands.executeCommand('setContext', 'ORBIT.hasPendingDiff', true);
    }

    /**
     * Otomatik mod: önizleme/renklendirme göstermeden yeni kodu doğrudan yazar ve kaydeder.
     */
    public static async applyDirectly(
        editor: vscode.TextEditor,
        range: vscode.Range,
        newCode: string
    ) {
        await editor.edit(editBuilder => {
            editBuilder.replace(range, newCode);
        });
        await editor.document.save();
    }

    /** Kırmızı (eski) satırları kalıcı olarak siler, yeşil (yeni) satırlar kalır. */
    public static async accept(editor: vscode.TextEditor) {
        const pending = this.pending.get(editor.document.uri.toString());
        if (!pending) return;

        await editor.edit(editBuilder => {
            for (let i = pending.removedRanges.length - 1; i >= 0; i--) {
                const line = editor.document.lineAt(pending.removedRanges[i].start.line);
                editBuilder.delete(line.rangeIncludingLineBreak);
            }
        });

        this.clear(editor);
        await editor.document.save();
        vscode.window.showInformationMessage('Değişiklik kabul edildi ✅');
    }

    /** Yeşil (yeni) satırları siler, dosya değişiklik öncesi haline döner. */
    public static async reject(editor: vscode.TextEditor) {
        const pending = this.pending.get(editor.document.uri.toString());
        if (!pending) return;

        await editor.edit(editBuilder => {
            for (let i = pending.addedRanges.length - 1; i >= 0; i--) {
                const line = editor.document.lineAt(pending.addedRanges[i].start.line);
                editBuilder.delete(line.rangeIncludingLineBreak);
            }
        });

        this.clear(editor);
        vscode.window.showInformationMessage('Değişiklik geri alındı ↩️');
    }

    private static clear(editor: vscode.TextEditor) {
        editor.setDecorations(this.addedDecoration, []);
        editor.setDecorations(this.removedDecoration, []);
        this.pending.delete(editor.document.uri.toString());
        this.statusBarItem?.hide();
        vscode.commands.executeCommand('setContext', 'ORBIT.hasPendingDiff', false);
    }
}