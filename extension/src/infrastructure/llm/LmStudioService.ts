import { ChatMessage } from '../../core/types';
import { ILLMProvider } from '../../core/ports/ILLMProvider';
import { Logger } from '../../utils/Logger';

export class LmStudioService implements ILLMProvider {
    private cachedApiKey: string | null = null;
    private cachedEndpoint: string | null = null;
    private cachedModel: string | null = null;

    private readonly SUPABASE_URL = process.env.SUPABASE_URL;
    private readonly SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    constructor() {}

    private async fetchActiveConnection(): Promise<void> {
        if (this.cachedApiKey && this.cachedEndpoint && this.cachedModel) return;

        if (!this.SUPABASE_URL || !this.SUPABASE_ANON_KEY) {
            const errorMsg = "Supabase bağlantı ayarları (.env) bulunamadı.";
            Logger.error(errorMsg);
            throw new Error(errorMsg);
        }
        
        Logger.info('Supabase üzerinden aktif bağlantı ayarları çekiliyor...');

        const baseUrl = this.SUPABASE_URL.replace(/\/$/, "");
        const url = `${baseUrl}/rest/v1/ai_connections?is_active=eq.true&select=*`;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "apikey": this.SUPABASE_ANON_KEY,
                    "Authorization": `Bearer ${this.SUPABASE_ANON_KEY}`
                }
            });

            if (!response.ok) {
                const errorDetails = await response.text();
                const fullError = `Supabase Hatası! Status: ${response.status}, Detay: ${errorDetails}, URL: ${url}`;
                Logger.error(`Supabase bağlantısı başarısız oldu. Status: ${response.status}`);
                throw new Error(fullError);
            }

            const data: any = await response.json();
            
            if (data && data.length > 0) {
                const activeConfig = data[0];
                this.cachedApiKey = activeConfig.api_key ? activeConfig.api_key.trim() : null;
                this.cachedEndpoint = activeConfig.endpoint_url ? activeConfig.endpoint_url.trim() : null;
                this.cachedModel = activeConfig.model_name;
                Logger.info('Bağlantı ayarları başarıyla çekildi ve önbelleğe alındı.');
            } else {
                const errorMsg = "Veritabanında aktif bir bağlantı bulunamadı (is_active=true yok).";
                Logger.warn(errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            Logger.error("DB Config çekme hatası yaşandı", error);
            throw error;
        }
    }

    private getSafeChatUrl(): string {
        let url = this.cachedEndpoint || "";
        url = url.replace(/\/$/, ""); 
        
        if (!url.endsWith("/chat/completions")) {
            url = `${url}/chat/completions`;
        }
        return url;
    }

    public async fetchChatStream(messages: any[]): Promise<any> {
        Logger.debug('Sohbet akışı (chat stream) başlatılıyor...');
        await this.fetchActiveConnection();
        
        const chatUrl = this.getSafeChatUrl();
        Logger.debug(`İstek atılan API URL'si: ${chatUrl}`);

        try {
            const response = await fetch(chatUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.cachedApiKey}` 
                },
                body: JSON.stringify({
                    model: this.cachedModel, 
                    messages: messages,
                    stream: true,
                    temperature: 0.1,
                    max_tokens: 4096, // YENİ: Görsel modelleri cevabı yarıda kesmesin diye eklendi
                    stop: [
                        "<|im_end|>", 
                        "<end_of_turn>", 
                        "eos_token", 
                        "Kullanıcı:", 
                        "User:"
                    ]
                })
            });
            
            if (!response.ok) {
                let errorMsg = `Server error: ${response.status} ${response.statusText}`;
                Logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            if (!response.body) {
                const errorMsg = "Response body is empty or unavailable.";
                Logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            Logger.debug('Sohbet akışı başarıyla bağlandı.');
            return response;
        } catch (error) {
            Logger.error('Sohbet akışı sırasında hata oluştu', error);
            throw error;
        }
    }

    public async fetchTitleCompletion(prompt: string): Promise<string> {
        Logger.debug('Sohbet başlığı üretiliyor...');
        await this.fetchActiveConnection();

        const chatUrl = this.getSafeChatUrl();

        const headers: Record<string, string> = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.cachedApiKey || ''}`
        };

        try {
            const response = await fetch(chatUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: this.cachedModel,
                    messages: [
                        { role: 'system', content: 'Kullanıcının yazdığı metni analiz et ve bu sohbet için 2 veya 3 kelimelik çok kısa bir konu özeti başlığı oluştur. Sadece başlığı yaz, noktalama işareti veya tırnak kullanma.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3,
                    stream: false
                })
            });

            if (response.ok) {
                const data: any = await response.json();
                if (data && data.choices && data.choices.length > 0) {
                    let title = data.choices[0].message?.content || "";
                    if (title) {
                        title = title.trim().replace(/["']/g, ''); 
                        Logger.debug(`Başlık başarıyla üretildi: ${title}`);
                        return title;
                    }
                }
            } else {
                Logger.warn(`Başlık üretme sunucu hatası: ${response.status}`);
            }
        } catch (error) {
            Logger.error("Başlık üretme hatası:", error);
        }
        
        Logger.debug('Varsayılan başlık kullanılıyor.');
        return prompt.slice(0, 30).trim() + '...';
    }
    
    public async fetchCommitMessage(diff: string): Promise<string> {
        Logger.debug('Commit mesajı üretiliyor...');
        await this.fetchActiveConnection();

        const chatUrl = this.getSafeChatUrl();

        const headers: Record<string, string> = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.cachedApiKey || ''}`
        };

        const prompt = `Aşağıdaki git diff (kod değişiklikleri) çıktısını incele ve profesyonel, tek satırlık bir git commit mesajı yaz. Mesajı yazarken Türkçe kullan. Sadece commit mesajını yaz, tırnak işareti, markdown veya ekstra açıklama ekleme.\n\nDeğişiklikler:\n${diff}`;

        try {
            const response = await fetch(chatUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: this.cachedModel,
                    messages: [
                        { role: 'system', content: 'Sen kıdemli bir yazılım mühendisisin. Sadece profesyonel bir git commit mesajı üretirsin.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.2, 
                    stream: false
                })
            });

            if (response.ok) {
                const data: any = await response.json();
                if (data && data.choices && data.choices.length > 0) {
                    let commitMsg = data.choices[0].message?.content || "";
                    return commitMsg.trim(); 
                }
            } else {
                Logger.warn(`Commit üretme sunucu hatası: ${response.status}`);
            }
        } catch (error) {
            Logger.error("Commit mesajı üretme hatası:", error);
        }
        
        return "Güncellemeler yapıldı.";
    }
}