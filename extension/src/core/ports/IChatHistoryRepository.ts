import { ChatSession } from '../types';

export interface IChatHistoryRepository {
    loadSessions(): ChatSession[];
    saveSessions(sessions: ChatSession[]): Promise<void>;
}