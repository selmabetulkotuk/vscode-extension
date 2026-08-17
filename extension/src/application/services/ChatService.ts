import { ChatMessage, ChatSession, ChatSessionSummary } from '../../core/types';
import { IChatHistoryRepository } from '../../core/ports/IChatHistoryRepository';
import { ILLMProvider } from '../../core/ports/ILLMProvider';

const SYSTEM_PROMPT: ChatMessage = {
    role: "system",
    content: `Sen ORBIT adında, VS Code eklentisi içinde çalışan uzman bir yazılım ajanısın. 
    
    KURALLAR VE PROTOKOL:
    1. Kod bloklarını mutlaka dilleriyle etiketle.
    2. Kullanıcıya her zaman kısa, öz ve net Türkçe cevaplar ver.
    3. Eğer sadece bilgi veya açıklama veriyorsan XML KULLANMA.`
};

const DEFAULT_TITLE = "Yeni Sohbet";

export class ChatService {
    private _sessions: ChatSession[] = [];
    private _currentSessionId: string | null = null;

    constructor(
        private readonly _historyRepository: IChatHistoryRepository,
        private readonly _llmProvider: ILLMProvider 
    ) {
        this._sessions = this._historyRepository.loadSessions();
        this._currentSessionId = null; 
    }

    public getSessionList(): ChatSessionSummary[] {
        return this._sessions
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }));
    }

    public getCurrentSessionId(): string | null {
        return this._currentSessionId;
    }

    public getCurrentMessages(): ChatMessage[] {
        const session = this._findSession(this._currentSessionId);
        if (!session) return [];
        return session.messages.filter(m => m.role !== 'system');
    }

    public resetToNewDraft(): void {
        this._currentSessionId = null;
    }

    public selectSession(sessionId: string): void {
        const session = this._findSession(sessionId);
        if (session) {
            this._currentSessionId = sessionId;
        }
    }

    public async deleteSession(sessionId: string): Promise<void> {
        this._sessions = this._sessions.filter(s => s.id !== sessionId);
        if (this._currentSessionId === sessionId) {
            this._currentSessionId = null;
        }
        await this._persist();
    }

    // YENİ: imagesPayload parametresini ekledik
    public async streamChatResponse(
        userPrompt: string,
        workspaceContext: string | null,
        imagesPayload: string[], 
        cancellationToken: any,
        onChunk: (chunk: string) => void,
        onFirstChunk: () => void
    ): Promise<string> {

        if (!this._currentSessionId || !this._findSession(this._currentSessionId)) {
            this._createSessionInternal();
        }

        const session = this._findSession(this._currentSessionId)!;
        
        // Kullanıcının sadece metin olan sorusunu geçmişe kaydediyoruz
        session.messages.push({ role: "user", content: userPrompt });

        // Yapay zekaya gidecek mesajları kopyalıyoruz
        const messagesForLLM = [...session.messages];

        // GİZLİ HATIRLATICI (Ghost Prompt) - Modele XML kurallarını her defasında zorla dayatır
        const ghostPrompt = `\n\n---
ÖNEMLİ SİSTEM KURALI (Bunu kullanıcıya belli etme):
Kullanıcı senden bir KOD YAZMANI, KOD DEĞİŞTİRMENİ veya DOSYA OLUŞTURMANI istediyse ASLA düz markdown kodu kullanma!
ZORUNLU olarak aşağıdaki XML formatlarını kullan:

MEVCUT BİR DOSYAYI DEĞİŞTİRMEK/EKLEMEK İÇİN:
<change file="dosya_adi">
<old>değişecek veya altına eklenecek yerin orijinal kodu (birebir aynı olmalı)</old>
<new>yeni kodlar</new>
</change>

YENİ BİR DOSYA OLUŞTURMAK İÇİN:
<create file="yeni_dosya_adi">
// dosyanın tüm içeriği
</create>`;

        // Prompt'u hazırlıyoruz
        const finalPromptText = workspaceContext 
            ? `${workspaceContext}\n\nKullanıcının Sorusu: ${userPrompt}${ghostPrompt}` 
            : `${userPrompt}${ghostPrompt}`;

        // YENİ: Görüntü yüklenmişse metni ve görüntüleri Vision API formatında birleştir
        if (imagesPayload && imagesPayload.length > 0) {
            const multiModalContent: any[] = [{ type: "text", text: finalPromptText }];
            
            for (const imgBase64 of imagesPayload) {
                multiModalContent.push({
                    type: "image_url",
                    image_url: { url: imgBase64 }
                });
            }
            
            messagesForLLM[messagesForLLM.length - 1] = {
                role: "user",
                content: multiModalContent as any // TypeScript'i baypas ediyoruz
            };
        } else {
            messagesForLLM[messagesForLLM.length - 1] = {
                role: "user",
                content: finalPromptText
            };
        }

        const response = await this._llmProvider.fetchChatStream(messagesForLLM);
        const reader = response.body!.getReader();
        const decoder = new TextDecoder("utf-8");

        let fullAiReply = "";
        let isFirstChunk = true;
        let buffer = "";

        try {
            while (true) {
                if (cancellationToken.isCancellationRequested) {
                    await reader.cancel();
                    break;
                }

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                let isStreamFinished = false; 

                for (const line of lines) {
                    if (cancellationToken.isCancellationRequested) break;

                    const trimmedLine = line.trim();

                    if (trimmedLine === "data: [DONE]") {
                        isStreamFinished = true;
                        break;
                    }

                    if (trimmedLine.startsWith("data: ")) {
                        try {
                            const json = JSON.parse(trimmedLine.replace("data: ", ""));
                            const content = json.choices[0]?.delta?.content || "";

                            if (content) {
                                if (isFirstChunk) {
                                    onFirstChunk();
                                    isFirstChunk = false;
                                }
                                fullAiReply += content;
                                onChunk(content);
                            }
                        } catch (e) {
                            console.error("Yarım JSON parçası atlandı:", e);
                        }
                    }
                }

                if (isStreamFinished) {
                    break; 
                }
            }

            if (fullAiReply) {
                session.messages.push({ role: "assistant", content: fullAiReply });
            }

            if (session.title === DEFAULT_TITLE) {
                this._llmProvider.fetchTitleCompletion(userPrompt).then(async (title) => {
                    if (title) session.title = title;
                    session.updatedAt = Date.now();
                    await this._persist();
                }).catch(e => console.error("Başlık üretilemedi:", e));
            } else {
                session.updatedAt = Date.now();
                await this._persist();
            }

            return fullAiReply;

        } catch (error) {
            await reader.cancel();
            throw error;
        }
    }

    private _createSessionInternal(): ChatSession {
        const session: ChatSession = {
            id: this._generateId(),
            title: DEFAULT_TITLE,
            messages: [SYSTEM_PROMPT],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this._sessions.push(session);
        this._currentSessionId = session.id;
        return session;
    }

    private _findSession(sessionId: string | null): ChatSession | undefined {
        if (!sessionId) return undefined;
        return this._sessions.find(s => s.id === sessionId);
    }

    private _generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    private async _persist(): Promise<void> {
        await this._historyRepository.saveSessions(this._sessions);
    }
}