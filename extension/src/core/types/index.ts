export interface ChatMessage {
    role: string;
    content: string;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export interface ChatSessionSummary {
    id: string;
    title: string;
    updatedAt: number;
}