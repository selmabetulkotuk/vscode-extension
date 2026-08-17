# ORBIT AI ASSISTANT

**Geliştiriciler:** SELMA BETÜL KOTUK
**Platform:** VS Code Extension

## 📌 Proje Amacı ve Problem Tanımı

**Problem:** Yazılımcılar kod yazarken sürekli VS Code ile tarayıcı (ChatGPT vb.) arasında geçiş yapmak (context switching) zorunda kalıyor. Ayrıca kodların dış sunuculara gönderilmesi ciddi güvenlik/gizlilik riskleri taşıyor.

**Amaç:** Projenin dosyalarını bizzat okuyup anlayabilen, VS Code içinde doğrudan kod değişikliği yapabilen ve bu değişiklikleri **git benzeri satır satır (yeşil = eklendi, kırmızı = silindi) inline gösterebilen** "Agentic" (otonom) bir kod asistanı geliştirmek.

---

## 🚀 Temel Özellikler

- **Sohbet Arayüzü:** VS Code kenar çubuğunda (Activity Bar) çalışan, sohbet geçmişini kaydeden bir webview paneli.
- **Otonom (Agentic) Altyapı:** Yapay zeka sadece metin üretmez; `search_workspace`, `read_file`, `run_terminal` araçlarını (tool call) kullanarak projede aksiyon alabilir.
- **Sağ Tık Komutları:** Editörde seçili kod üzerinde "Bu Kodu Açıkla", "Bu Hatayı Düzelt", "Buraya Test Yaz" komutları.
- **Diff Önizleme:** "Önizle" ile değişiklik, VS Code'un yerleşik `vscode.diff` ekranında (ayrı sekmede, git benzeri yeşil/kırmızı) gösterilir.
- **Inline Diff (Uygula):** "Uygula" ile değişiklik doğrudan gerçek dosyada, satır satır **yeşil (eklenen) / kırmızı-üstü çizili (silinen)** olarak gösterilir; `Ctrl+Enter` ile kabul edilir, `Ctrl+Backspace` ile geri alınır.
- **Dinamik Model Bağlantısı:** LLM sağlayıcı bilgileri (endpoint, model, API key) koda gömülü değildir; Supabase üzerinden çalışma zamanında çekilir (bkz. [Yapay Zeka Bağlantısı](#-yapay-zeka-bağlantısı-supabase)).

---

## 🏗 Mimari (Clean Architecture)

Proje, Clean Architecture prensiplerine göre katmanlara ayrılmıştır:

```
src/
├── core/            → Arayüzler (ports) ve tipler; hiçbir dış bağımlılık içermez
├── application/      → ChatService: iş akışını yönetir (geçmiş, context, stream)
├── infrastructure/   → Dış dünyayla konuşan katman
│   ├── llm/           → LmStudioService: Supabase'den bağlantı bilgisi çekip LLM'e istek atar
│   ├── persistence/   → Sohbet geçmişini VS Code globalState'e kaydeder
│   └── config/        → VS Code ayarları ve diff içerik sağlayıcı
└── presentation/     → Kullanıcıya görünen katman
    ├── providers/      → ChatViewProvider: webview mesajlarını yönetir
    ├── decorations/    → InlineDiffManager: dosya içi yeşil/kırmızı diff gösterimi
    └── webview/        → HTML/CSS/JS arayüz dosyaları
```

**Çalışma akışı:**
1. Kullanıcı yan panelden (Webview) sorusunu yazar.
2. `ChatViewProvider`, `postMessage` ile isteği alır ve `ChatService`'e iletir.
3. `ChatService`, sohbet geçmişini ve açık dosya/seçili kod bağlamını toplar.
4. `LmStudioService`, Supabase'den güncel `endpoint`/`model`/`api_key` bilgisini çeker ve LLM'e stream isteği atar.
5. LLM bir araç (tool) kullanmak isterse, eklenti araç sonucunu üretip tekrar LLM'e besler (agentic döngü).
6. LLM bir kod değişikliği (`<change>`/`<create>`) önerirse, kullanıcı **Önizle** (ayrı sekmede diff) veya **Uygula** (dosya içinde inline yeşil/kırmızı diff) seçebilir.

---

## 🔑 Yapay Zeka Bağlantısı (Supabase)

Bu projede **iki farklı "anahtar" kavramı** vardır, karıştırmamak önemli:

| Anahtar | Nerede tutulur | Ne işe yarar | Değişince ne yapılır |
|---|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | `.env` dosyası (proje kökü) | Supabase projesine bağlanıp `ai_connections` tablosunu okumaya yarar | `.env` dosyasını güncelle → `npm run compile` (esbuild bunları derleme anında koda gömer) |
| Gerçek LLM API key (OpenAI/OpenRouter/local vb.) | **Supabase veritabanı**, `ai_connections` tablosu, `api_key` kolonu (`is_active = true` olan satır) | Asıl model çağrısında `Authorization: Bearer ...` olarak kullanılır | **Hiçbir dosyada değişiklik yapmana gerek yok** — sadece Supabase tablosundaki ilgili satırı güncelle |

`.env` dosyası örneği:

```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Not: `kbbAiAssistant.apiKey` adında bir VS Code ayarı da mevcuttur (Settings arayüzünden görünür) ama şu an gerçek LLM çağrılarında **kullanılmıyor** — sadece arayüzde saklanıyor. Asıl kullanılan değer her zaman Supabase'den (`ai_connections.api_key`) gelir.

---

## 💻 Kullanılan Teknolojiler

- **Platform:** VS Code Extension API
- **Diller:** TypeScript, Node.js, HTML, CSS
- **Derleme:** esbuild (`.env` değişkenlerini `define` ile derleme anında koda gömer)
- **Kütüphaneler:**
  - `marked` — AI'dan gelen markdown metni HTML'e çevirir
  - `prismjs` — kod bloklarını renklendirir
  - `dotenv` — `.env` dosyasını derleme sırasında okur
- **Backend/Config:** Supabase (bağlantı bilgilerini merkezi olarak yönetmek için)

---

## ⚙️ Kurulum ve Çalıştırma

```bash
# Bağımlılıkları kur
npm install

# .env dosyasını oluştur (yukarıdaki örneğe bakın)

# Derle
npm run compile
# veya geliştirme sırasında canlı izleme için:
npm run watch
```

VS Code'da `F5` tuşuna basarak **Extension Development Host** penceresini açıp eklentiyi test edebilirsin.

---

## 🎯 Komutlar

| Komut | Kısayol/Yer | Açıklama |
|---|---|---|
| `kbb.explainCode` | Sağ tık menüsü | Seçili kodu açıklamasını ister |
| `kbb.fixError` | Sağ tık menüsü | Seçili koddaki hatayı düzeltme önerisi ister |
| `kbb.writeTest` | Sağ tık menüsü | Seçili kod için test dosyası önerisi ister |
| `kbb.acceptInlineDiff` | `Ctrl+Enter` | Uygulanan inline diff'i kabul eder (eski kod silinir) |
| `kbb.rejectInlineDiff` | `Ctrl+Backspace` | Uygulanan inline diff'i geri alır (yeni kod silinir) |

---

## 🛠 Zorluklar ve Çözümleri

- **LLM'in Halüsinasyon Görmesi:** Fonksiyon aramalarında kelime bazlı arama hatalıydı; araç kullanımı (tool use) ile optimize edildi.
- **Kod Değişikliği Sorunu:** LLM'in serbest metin yerine `<change>`/`<create>` XML formatında, eski/yeni kodu net tanımlayarak cevap vermesi sağlandı.
- **Türkçe Karakter Sorunu:** Arama fonksiyonuna Türkçe karakterleri normalize eden özel bir yardımcı fonksiyon eklendi.
- **Uygula sırasında görünürlük eksikliği:** İlk sürümde "Uygula" dosyayı sessizce değiştiriyordu; `InlineDiffManager` ile artık değişiklik dosya içinde git benzeri renklendirilip kullanıcı onayına sunuluyor.

---

## 📊 Durum ve Eksikler

### Ne Bitti?
- [x] Sohbet arayüzü ve geçmişi
- [x] Farklı model/endpoint desteği (Supabase üzerinden dinamik)
- [x] Önizle (ayrı sekmede diff) mekanizması
- [x] Uygula → inline diff (yeşil/kırmızı) + Kabul Et/Geri Al mekanizması
- [x] Dosya arama araçları (search_workspace, read_file, run_terminal)

### Eksiklikler ve Bilinen Sorunlar
- [ ] Otomatik testler henüz yok, testler manuel yapılıyor.
- [ ] `changeRange` bulunamayan bazı edge-case'lerde (eski kod dosyada birebir eşleşmiyorsa) kullanıcı manuel seçim yapmak zorunda kalabiliyor.
- [ ] Çoklu dosya değişikliklerinde (bir değişkenin 5 farklı dosyada değişmesi gibi) henüz toplu diff desteği yok.

---

## 🚀 Sıradaki Adımlar

- Bir hata (Error) oluştuğunda asistanın otomatik olarak okuyup çözüm önermesi.
- Zincirleme refactoring: aynı anda birden fazla dosyada diff önizleme/uygulama.
- İlk açılışta zorunlu API/endpoint/model giriş ekranı yerine, backend'in (Supabase) varsayılan bir bağlantıyla doğrudan çalışmaya başlaması.