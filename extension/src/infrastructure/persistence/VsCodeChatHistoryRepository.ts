import * as vscode from 'vscode';
import { ChatSession } from '../../core/types';
import { IChatHistoryRepository } from '../../core/ports/IChatHistoryRepository';

const STORAGE_KEY = 'ORBITAiChatSessions';

export class VsCodeChatHistoryRepository implements IChatHistoryRepository {
    constructor(private readonly _context: vscode.ExtensionContext) {}

    public loadSessions(): ChatSession[] {
        return this._context.globalState.get<ChatSession[]>(STORAGE_KEY) || [];
    }

    public async saveSessions(sessions: ChatSession[]): Promise<void> {
        await this._context.globalState.update(STORAGE_KEY, sessions);
    }
}