import { ChatMessage } from '../types';

/**
 * Tüm yapay zeka sağlayıcılarının (LM Studio, OpenAI, Huna vb.) 
 * uyması gereken ortak sözleşme (Interface).
 */
export interface ILLMProvider {
    /**
     * Sohbet mesajlarını alır ve stream (akış) yanıtı döner.
     */
    fetchChatStream(messages: ChatMessage[]): Promise<Response>;

    /**
     * Geçmiş listesi için ilk mesaja bakarak kısa bir özet başlık üretir.
     */
    fetchTitleCompletion(prompt: string): Promise<string>;
}