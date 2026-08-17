import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel;

    // Logger'ı başlatıp VS Code Output panelinde sekme açar
    public static initialize(channelName: string): void {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel(channelName);
        }
    }

    public static info(message: string): void {
        this.log('INFO', message);
    }

    public static warn(message: string): void {
        this.log('WARN', message);
    }

    public static error(message: string, error?: unknown): void {
        this.log('ERROR', message);
        if (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[Detay]: ${errorMsg}`);
        }
    }

    public static debug(message: string): void {
        this.log('DEBUG', message);
    }

    // Paneli otomatik olarak kullanıcıya gösterir
    public static show(): void {
        if (this.outputChannel) {
            this.outputChannel.show(true); // true = odağı kaybetmeden göster
        }
    }

    private static log(level: string, message: string): void {
        if (!this.outputChannel) {
            return;
        }
        
        // Zaman damgası oluştur (Örn: 14:30:15)
        const now = new Date();
        const timeString = now.toLocaleTimeString('tr-TR', { hour12: false });
        
        this.outputChannel.appendLine(`[${timeString}] [${level}] ${message}`);
    }
}