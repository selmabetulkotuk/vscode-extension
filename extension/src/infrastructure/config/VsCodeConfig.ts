import * as vscode from 'vscode';
import { IAppConfig } from '../../core/ports/IAppConfig';

export class VsCodeConfig implements IAppConfig {
    public getEndpoint(): string {
        return vscode.workspace.getConfiguration('ORBITAiAssistant').get<string>('endpoint') || 'http://127.0.0.1:1234/v1/chat/completions';
    }

    public getModel(): string {
        return vscode.workspace.getConfiguration('ORBITAiAssistant').get<string>('model') || 'local-model';
    }

    public getApiKey(): string {
        return vscode.workspace.getConfiguration('ORBITAiAssistant').get<string>('apiKey') || '';
    }
}