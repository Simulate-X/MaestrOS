# MaestrOS — İlerleme Raporu

> **Hazırlayan:** Sude  
> **Başlangıç:** Haziran 2026  
> **Durum:** Aktif geliştirme — kişisel platforma dönüşüyor 🚀
> **Son güncelleme:** 3 Haziran 2026

### Bugün Tamamlananlar (3 Haziran)
- ✅ `.gitignore` + `.env.example` oluşturuldu
- ✅ `maestros-frontend/` → `frontend/` yeniden adlandırıldı
- ✅ `ui` servisi Docker Compose'a eklendi (`docker compose up -d` tek komutla çalışıyor)
- ✅ `PROGRESS.md` yol haritası + vizyon belgesi oluşturuldu
- ✅ Paperclip referans projesi incelendi, mimari farklar not edildi
- ✅ Ollama'da 14 model keşfedildi (hardcode 3'e karşı)

### Sıradaki Oturumda Yapılacaklar
1. Scheduler'ı restart et, yeni test ticket'ı oluştur, Live Ops'tan izle
2. Mevcut blocked ticket'ları incele (#20, #15) — neden blocked?
3. Provider sistemi yeniden tasarımına başla (dinamik Ollama model listesi)
4. YouTube şirketi için ilk skill dosyalarını yaz

---

## MaestrOS Nedir?

MaestrOS, yapay zeka ajanlarından oluşan sanal bir şirketi yönetmek için geliştirilmiş bir **kontrol düzlemi** (control plane).  
Referans proje: `C:\My_OS\Maestr_OS` (Paperclip — Node.js/TypeScript ile yazılmış orijinal versiyon)  
MaestrOS ise aynı fikrin **Python/FastAPI** ile yeniden yazılmış, daha sade versiyonu.

### Temel Kavramlar

| Kavram | Açıklama |
|--------|----------|
| **Agent** | Bir yapay zeka "çalışan" (CEO, Engineer, QA Lead…) |
| **Ticket** | Bir iş görevi / talep |
| **Run** | Bir ajanın bir görevi tamamlama girişimi |
| **Workflow** | Görevin geçtiği aşamalar zinciri (Plan → Build → Review → Ship) |
| **Phase** | Zincirdeki tek bir adım |
| **Audit Log** | Değiştirilemez olay kayıt defteri |
| **Budget** | Her ajanın / şirketin harcama limiti |

---

## Sistem Mimarisi

```
┌─────────────────────────────────────────────────┐
│              Dashboard (React + Vite)            │
│         localhost:5173  ←→  localhost:8080       │
└──────────────────┬──────────────────────────────┘
                   │ REST API (FastAPI)
┌──────────────────▼──────────────────────────────┐
│            Control Plane (Python)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ API      │  │Scheduler │  │   Services   │  │
│  │ /agents  │  │(5s tick) │  │ claim.py     │  │
│  │ /tickets │  │          │  │ wake.py      │  │
│  │ /runs    │  │          │  │ auto_chain.py│  │
│  │ /audit   │  │          │  │ budget.py    │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└──────────────────┬──────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│PostgreSQL│  │  Ollama  │  │ Cloud APIs   │
│(tickets,│  │ (lokal   │  │ Anthropic    │
│ agents, │  │  modeller│  │ OpenRouter   │
│ runs…)  │  │         )│  │              │
└─────────┘  └──────────┘  └──────────────┘
```

---

## Tamamlanan Çalışmalar

### ✅ Faz 0 — Temel Altyapı
- FastAPI kontrol düzlemi
- PostgreSQL veritabanı (SQLAlchemy 2.0 async ORM)
- Alembic migration sistemi
- 5 temel model: Company, Agent, Skill, Ticket, Run
- SKIP LOCKED ile atomik ticket claim mekanizması
- Docker Compose: control-plane + db + ollama + scheduler

### ✅ Faz 1 — Zamanlayıcı
- `scheduler/` servisi — her 5 saniyede bir aktif ajanları kontrol eder
- Orphan ticket recovery (kilitli kalan görevleri kurtarır)
- Graceful shutdown (SIGTERM ile temiz kapanma)

### ✅ Faz 2 — Workflow Zinciri
- YAML'dan workflow ayrıştırıcı
- Plan → Build → Review → Ship otomatik zinciri
- İnsan onay kapıları (`human_approval`)
- Context document enjeksiyonu (skill + bağlam belgesi)

### ✅ Faz 2.5 — Verdict Sistemi
- Ajanlar `` ```verdict `` bloğu ile karar verir (`approve`, `rework`, `ship`, `hold`…)
- Geriye dönük dallanma (QA rework isterse Build'e döner)
- Döngü limiti (`max_reworks`) — sonsuz döngü engeli

### ✅ Faz 2.6 — Verdict İyileştirmeleri
- `ship` fazı simetrisi
- `Phase.default_verdict` alanı
- Semantik validasyon

### ✅ Faz 4.1 — Bulut Adaptörleri
- `AnthropicAdapter` (claude-haiku, claude-sonnet)
- `OpenRouterAdapter` (yüzlerce modele erişim)
- Token ve dolar bazlı maliyet hesaplama

### ✅ Faz 4.1.1 — Maliyet Düzeltmeleri
- OpenRouter'dan gerçek maliyet okuma (`usage.cost`)
- Model adı slug düzeltmesi (`llama-3.3-70b-instruct`)
- Sıfır maliyetli model uyarısı

### ✅ Faz 4.2 — Bütçe Hiyerarşisi
- Agent düzeyinde bütçe (aşıldığında agent duraklar)
- Şirket düzeyinde bütçe (aşıldığında scheduler atlar)
- `reporting_to` — org chart (kime rapor veriyor)
- Döngü tespiti (A→B→A şeklinde hiyerarşi hatası)

### ✅ Faz 4.5 — Frontend Bağlantısı (Port)
- `GET /runs` endpoint (filtreli run geçmişi)
- `audit_log` tablosu + `emit_audit()` — değiştirilemez olay kaydı
- 12 noktada audit emission (hire, approve, reject, paused_budget…)
- `cost_spent_period` — bütçe gauge'ları için gerçek harcama verisi
- CORS middleware (frontend ↔ backend iletişimi)
- Decimal → float düzeltmesi (JSON serializasyonu)
- TypeScript tip hataları düzeltildi

### ✅ Dashboard (frontend/)
- 6 view: Live Ops, Inbox, Roster, Workflow Canvas, Tickets, Audit
- Gerçek backend verisine bağlandı (`VITE_USE_MOCK=false`)
- TR/EN dil desteği
- Mock mod (demo/standalone) + live mod

---

## Mevcut Durum

```
Servisler (docker compose up -d ile hepsi tek seferde):
  ✅ db (PostgreSQL)   → internal (healthcheck ile)
  ✅ ollama            → localhost:11434 (healthcheck ile)
  ✅ control-plane     → localhost:8080 (healthcheck ile)
  ✅ scheduler         → her 5s tick (control-plane sağlıklı olduktan sonra başlar)
  ✅ ui (frontend)     → localhost:5173 (Docker'da, node:20-alpine)

Başlatma komutu:
  docker compose up -d      # tüm sistem
  docker compose down       # durdur
  docker compose restart scheduler  # sadece scheduler'ı yeniden başlat

Proje yapısı:
  MaestrOS/
  ├── control-plane/   ← Backend (Python/FastAPI)
  ├── frontend/        ← Dashboard (React/Vite) — eskisi: maestros-frontend
  ├── skills/          ← Ajan sistem prompt'ları (.md dosyaları)
  ├── workflows/       ← Workflow tanımları (.yaml dosyaları)
  ├── .env             ← Gizli ayarlar (GitHub'a GİTMEZ)
  ├── .env.example     ← Şablon (GitHub'a gider)
  ├── .gitignore       ← GitHub güvenliği
  ├── docker-compose.yml
  └── PROGRESS.md      ← Bu dosya

Testler:
  ✅ 88/88 unit test geçiyor
  ✅ 0 TypeScript hatası

Alembic migration: a8b9c0d1e2f3 (HEAD)
```

---

## Bilinen Sorunlar

| # | Sorun | Etki | Öncelik |
|---|-------|------|---------|
| S1 | Ollama model listesi hardcode | Yeni model kurulunca arayüzde görünmüyor | 🟡 |
| S2 | OpenAI direkt adapter yok | GPT modelleri sadece OpenRouter üzerinden | 🟡 |
| ~~S3~~ | ~~UI Docker'da çalışmıyor~~ | ~~Her oturumda npm run dev gerekiyor~~ | ✅ **Çözüldü** |
| S4 | `compute_agent_spent` limitsiz ajanlarda 0 döner | Budget limiti olmayan ajanların gerçek harcaması görünmüyor | 🟢 |
| S5 | Live Ops feed'i animasyonlu değil (live modda) | Gerçek eventler var ama yeni event eklenmez | 🟢 |
| S6 | `GET /agents?company_id=X` filtresi backend'de yok | Tüm ajanlar döner, client filtreler (tek şirkette sorun değil) | 🟢 |
| S7 | UI'da "Yeni Ticket Oluştur" formu yok | Ticket sadece API/terminal'den oluşturulabiliyor | 🟡 |

---

## Mimari Gözlem — Provider Sistemi Yeniden Tasarlanmalı

> *3 Haziran 2026 — Paperclip referans projesi incelendi (`C:\My_OS\Maestr_OS`)*

**Mevcut MaestrOS yaklaşımı (basit ama kısıtlı):**
```
provider: "ollama" | "anthropic" | "openrouter"
model: hardcode listeden seç ya da elle yaz
```

**Paperclip'in yaklaşımı (esnek, genişletilebilir):**
```
adapter type: "claude-code" | "codex" | "cursor-cloud" | "opencode" | "gemini-cli" | ...
model: adapter'dan dinamik olarak çekilir, aranabilir dropdown
```

**Paperclip'te öğrenilen farklar:**
- Adapter'lar bağımsız npm paketleri — yeni adapter eklemek için core'a dokunmak gerekmez
- Her adapter kendi model listesini, config şemasını ve UI parser'ını sağlar
- Model seçimi arama destekli dropdown (çok sayıda model için önemli)
- `GET /api/adapters/:type/config-schema` — UI formu adapter'dan dinamik gelir

**Ollama API'sinin döndürdüğü gerçek model listesi** (`localhost:11434/api/tags`):
```
qwen-msi-14b:latest        (özel fine-tune, 14.8B)
minimax-m2.7:cloud         (bulut model, remote)
qwen2.5-coder:14b          (mevcut sistemde hardcode)
qwen2.5-coder:7b-instruct-q4_K_M
qwen2.5:1.5b-instruct-q4_K_M
gemma-msi-26B:latest       (özel fine-tune, 25.2B)
gemma-msi:latest           (özel fine-tune, 30.7B)
gpt-oss:120b-cloud         (bulut model, remote)
qwen2.5:latest
llama3.1:latest
mxbai-embed-large:latest   (embedding modeli — ajan için uygun değil)
mag-mell-r1:latest
tinyllama:latest
violet-lotus:latest
```
→ Hardcode 3 modele karşı gerçekte 14 model var. Bazıları cloud-remote, bazıları local.

**Önerilen yeniden tasarım:**
1. Backend: `GET /api/ollama/models` — Ollama API'den dinamik model listesi
2. Backend: Her provider'ın yeteneklerini tanımlayan bir yapı (remote? local? embedding mi?)
3. Frontend: Hardcode `MODEL_CATALOG` kaldırılır, API'den çekilir
4. İleride: Paperclip gibi plugin tabanlı adapter sistemi

**Not:** S1 ve S2 nolu sorunlar bu yeniden tasarımın parçası. Küçük patch yerine bütünsel çözüm daha mantıklı.

---

## Kişisel Platform Vizyonu

> *"Herşeyi tek bir yerden yönetebileceğim bir platforma çevireceğiz."* — Sude, Haziran 2026

MaestrOS başlangıçta bir öğrenme projesi olarak kuruldu. Ama sistem çok şirketi, çok ajan takımını ve çok workflow tipini zaten destekliyor. Bu altyapıyı kişisel bir AI platform'a dönüştürmek için sadece doğru şirket + ajan + skill tanımları yeterli.

### Planlanan Şirket Yapısı

```
MaestrOS (platform)
│
├── 🏢 Yazılım Şirketi          (mevcut — babadan miras)
│    Workflow: Plan → Build → Review → Ship
│    Ajanlar: CEO, Engineer, QA Lead
│
├── 📺 YouTube Otomasyon        (eklenecek)
│    Workflow: Araştırma → Script → SEO → Thumbnail Prompt
│    Ajanlar:
│      - Trend Araştırmacı   → "Bu hafta hangi konular izleniyor?"
│      - Script Yazarı       → "15 dakikalık eğitim videosu yaz"
│      - SEO Uzmanı          → "Başlık + description + 10 tag üret"
│      - Görsel Yönetmen     → "Thumbnail için Midjourney prompt'u yaz"
│
├── 🎨 Görsel Üretim Stüdyosu  (eklenecek)
│    Workflow: Brief → Konsept → Prompt → Kalite Kontrol
│    Ajanlar:
│      - Brief Analisti      → "Müşteri isteğini teknik prompt'a çevir"
│      - Prompt Mühendisi    → "Stable Diffusion / Flux prompt optimizasyonu"
│      - Kalite Denetçi      → "Prompt'u değerlendir, alternatif öner"
│
└── [İleride eklenecekler...]
     Fikirler: İçerik ajansı, araştırma asistanı, sosyal medya yönetimi...
```

### Mevcut Sistemden Hazır Gelen Özellikler

Her yeni şirket için **otomatik olarak geliyor:**
- ✅ Budget takibi (aylık/günlük harcama limiti)
- ✅ Audit log (kim ne yaptı, ne zaman)
- ✅ İnsan onay kapıları (hassas adımlarda dur, onayını bekle)
- ✅ Rework döngüsü (çıktı beğenilmezse geri gönder)
- ✅ Dashboard'dan canlı izleme

### Yapılması Gerekenler (yeni şirket başlatmak için)

1. **Skill dosyaları yaz** (`skills/` klasörü)
   - Her rol için sistem prompt'u — "Sen bir YouTube SEO uzmanısın..."
2. **Workflow YAML'ı tanımla** (`workflows/` klasörü)
   - Hangi aşamadan hangisine geçilecek, hangisi insan onayı bekleyecek
3. **API'den şirket + ajan oluştur** (ya da UI'dan)
4. **Test et** — bir görevi verip zincirin çalıştığını izle

---

## GitHub'a Atmadan Önce Yapılacaklar

### 🔴 Kritik (yapılmazsa olmaz)
- [x] `.gitignore` oluşturuldu ✅
- [x] `.env.example` oluşturuldu ✅ (hem kök hem frontend/)
- [ ] **"Yeni Görev Oluştur" formu** — UI'da ticket oluşturma olmadan proje kullanılamaz
  - Agent seç, başlık/açıklama yaz, workflow ata, öncelik belirle
  - Tickets sayfasına "+ Yeni Görev" butonu + modal
  - Backend `POST /tickets` zaten var, sadece UI formu eksik

### 🟡 Önemli
- [ ] `README.md` yaz — iyileştirmeler bittikten sonra (son adım)
- [x] `docker-compose.yml`'a `ui` servisi eklendi ✅
- [x] `frontend/` klasörü yeniden adlandırıldı ✅ (eskisi: maestros-frontend)
- [x] `.env` dosyası kontrol edildi — test key'leri, güvenli ✅

### 🟢 İyileştirme (öncelik sırasıyla)
- [ ] **Provider sistemi yeniden tasarımı** (büyük — ayrı bir faz)
  - [ ] `GET /api/ollama/models` endpoint — dinamik model listesi
  - [ ] Hardcode `MODEL_CATALOG` kaldır, API'den çek
  - [ ] Embedding modellerini filtrele (mxbai-embed gibi)
  - [ ] Cloud-remote Ollama modellerini etiketle
- [ ] `GET /agents` ve `GET /tickets`'a `company_id` filtresi ekle
- [ ] `compute_agent_spent` — limitsiz ajanlarda da gerçek harcama göster
- [ ] Live Ops feed'i gerçek zamanlı hale getir (SSE veya daha sık polling)
- [ ] GitHub Actions CI/CD (otomatik test)
- [ ] `doc/` klasörü — mimari belgeler

---

## Paperclip'e Kıyasla Eksikler (Büyük Resim)

Paperclip (`C:\My_OS\Maestr_OS`) çok daha olgun. Referans olarak alınabilecek özellikler:

| Paperclip'te Var | MaestrOS'ta Durum |
|------------------|-------------------|
| CLI aracı (`paperclip` komutu) | Yok |
| Authentication (kullanıcı girişi) | Yok |
| Plugin sistemi | Yok |
| Git worktree entegrasyonu | Yok |
| E2E testler (Playwright) | Yok |
| Cloud deploy docs | Yok |
| Dinamik model listesi | Hardcode |
| Çok daha fazla adapter (Cursor, Codex, Gemini…) | Sadece 3 |

> **Not:** Bu eksikler hemen yapılmak zorunda değil. MaestrOS bir öğrenme projesi olarak başladı — temel mimari sağlam, eksikler sonradan eklenebilir.

---

## Kaynaklar

- Paperclip (referans): `C:\My_OS\Maestr_OS`
- Backend API: `http://localhost:8080/docs` (FastAPI otomatik dokümantasyon)
- Dashboard: `http://localhost:5173`
- Alembic migrasyonlar: `control-plane/alembic/versions/`
- Unit testler: `control-plane/tests/`
