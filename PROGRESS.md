# MaestrOS — İlerleme Raporu

> **Hazırlayan:** Sude  
> **Başlangıç:** Haziran 2026  
> **Durum:** Aktif geliştirme — SaaS platformuna dönüşüyor 🚀  
> **Son güncelleme:** 4 Haziran 2026

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

### ✅ Faz 4.5 — Frontend Bağlantısı
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

### ✅ Faz 5 / A — GitHub & Proje Altyapısı (4 Haziran)
- İlk git commit + GitHub push (`Simulate-X/MaestrOS`)
- `v1.0.0` release etiketi (büyük refactor öncesi checkpoint)
- `README.md` — İngilizce, ekran görüntüleri dahil
- `LICENSE` — MIT (Copyright 2026 Sude)
- `docs/screenshots/` — live_ops, roster, tickets, workflow_canvas
- `NewTicketModal` entegrasyonu — arayüzden ticket oluşturma
  - `useCreateTicket` hook, `createTicket` mock + API, `CreateTicketInput` tipi
  - Tickets sayfasına "+ Yeni Görev" butonu + modal state

### ✅ Faz 5 / B — Dinamik Model Keşfi (4 Haziran)
- **Adapter katmanı analizi** — base/factory/pricing mimarisi belgelendi
- `OllamaAdapter.list_models()` — `/api/tags`'ten canlı model listesi
  - Embedding modelleri filtrelenir (`mxbai-embed` gibi)
  - Tek sorumluluk: hata yönetimi endpoint'e bırakılır
- `GET /ollama/models` endpoint — Ollama kapalıysa 503, açık+boşsa 200 []
- `app/api/providers.py` yeni dosya, `main.py`'a kayıtlı

### ✅ Faz 5 / B2 — Model Dropdown Dinamik Bağlantı (4 Haziran)
- `api.ts`: `getOllamaModels()` → `GET /ollama/models`
- `mock.ts`: `getOllamaModels()` mock (standalone mod için)
- `queries.ts`: `useOllamaModels(enabled)` — sadece ollama seçilince fetch
- `AgentEditModal`: ollama → canlı liste / cloud → MODEL_CATALOG (değişmedi)
- `MODEL_CATALOG`'dan ollama satırı kaldırıldı

### ✅ Faz 5 / B2.1 — Aranabilir Model Combobox (4 Haziran)
- Chip grid → `ModelCombobox` bileşeni (yeni bağımlılık yok)
- Yaz → substring filter; tıkla → seç; Esc → kapat
- `onMouseDown + preventDefault` — blur/click yarış koşulu çözüldü
- `maxHeight: 200` + scroll — 500 model de layout bozmaz
- loading / error / empty — her durumda form kullanılabilir kalır
- Ollama + cloud provider aynı bileşeni paylaşır

---

## Mevcut Durum

```
Servisler (docker compose up -d --build ile):
  ✅ db (PostgreSQL)    → internal (healthcheck ile)
  ✅ ollama             → localhost:11434 (healthcheck ile)
  ✅ control-plane      → localhost:8080 (healthcheck ile)
  ✅ scheduler          → her 5s tick
  ✅ ui (frontend)      → localhost:5173

Komutlar:
  docker compose up -d --build   # tüm sistem (kod değişince --build şart)
  docker compose down            # durdur
  docker compose restart scheduler

GitHub: https://github.com/Simulate-X/MaestrOS
Son release: v1.0.0 (4 Haziran 2026)

Testler:
  ✅ 88/88 unit test geçiyor
  ✅ 0 TypeScript hatası
```

---

## Vizyon — SaaS Platformu

> *"Kullanıcı backend-frontend bilmez; arayüzden her şeyi halledebilmeli."* — Sude, Haziran 2026

Şu an sistemi yönetmek için terminal, YAML ve API bilgisi gerekiyor.  
Hedef: her şey UI'dan, hiç kod yazmadan.

### Planlanan Şirket Yapısı

```
MaestrOS (platform)
│
├── 🏢 Yazılım Şirketi          (mevcut)
│    Workflow: Plan → Build → Review → Ship
│    Ajanlar: CEO, Engineer, QA Lead
│
├── 📺 YouTube Otomasyonu       (eklenecek)
│    Workflow: Araştırma → Script → SEO → Thumbnail Prompt
│    Ajanlar: Trend Araştırmacı, Script Yazarı, SEO Uzmanı, Görsel Yönetmen
│
├── 🎨 Görsel Üretim Stüdyosu   (eklenecek)
│    Workflow: Brief → Konsept → Prompt → Kalite Kontrol
│    Ajanlar: Brief Analisti, Prompt Mühendisi, Kalite Denetçi
│
└── [İleride...] İçerik ajansı, araştırma asistanı, sosyal medya yönetimi
```

### Şu An SaaS'a Engel Olan Boşluklar

| İşlem | Şu an | Hedef |
|-------|-------|-------|
| Yeni şirket kur | `POST /companies` (API) | UI modal |
| Skill yaz/düzenle | `.md` dosyası + terminal | UI markdown editörü |
| Workflow tanımla | `.yaml` dosyası + `POST /load` | UI form builder |
| Rol tanımla | Hardcode 5 buton | Şirkete özel free text |
| Skill filtrele | Tüm skill'ler (şirketsiz) | `company_id` filtreli |

---

## Sıradaki Sprint — Faz 5 / C: SaaS Temeli

### 🔴 Sprint A — Küçük, yüksek etki (sıradaki)

- [ ] **NewCompanyModal** — arayüzden şirket oluşturma
  - İsim, bütçe limiti, bütçe dönemi → `POST /companies`
  - Header'da `+ Yeni Şirket` butonu
- [ ] **NewSkillModal** — arayüzden skill oluşturma
  - İsim, versiyon, markdown textarea → `POST /skills`
  - `company_id` alanı (hangi şirkete ait)
  - Roster ya da ayrı "Skills" sayfasına buton
- [ ] **Rol sistemi — free text**
  - `ROLE_OPTS` hardcode listesini kaldır
  - Şirkete göre önerilen roller placeholder olarak göster
  - `Agent.role` zaten `String(100)` — DB değişikliği yok
- [ ] **`GET /skills?company_id=X`** — backend filtresi
  - `AgentEditModal` sadece o şirketin skill'lerini göstersin

### 🟡 Sprint B — Orta büyüklük

- [ ] **Workflow builder UI** — YAML bilgisi gerektirmeyen form
  - Faz ekle (isim + skill seç + gate tipi + sonraki faz)
  - Arka planda YAML oluştur, `POST /workflows/load` ile yükle
  - *Alternatif (daha hızlı):* textarea'ya YAML yapıştır + yükle butonu
- [ ] **`GET /agents?company_id=X`** filtresi — backend
- [ ] **`GET /tickets?company_id=X`** filtresi — backend (zaten kısmen var)
- [ ] **Skill editörü** — mevcut skill'leri düzenleme (`PATCH /skills/{id}`)

### 🟢 Sprint C — İleride

- [ ] Live Ops feed'i gerçek zamanlı (SSE veya WebSocket)
- [ ] `compute_agent_spent` — limitsiz ajanlarda da gerçek harcama
- [ ] OpenRouter dinamik model listesi (`GET /openrouter/models`)
- [ ] GitHub Actions CI/CD
- [ ] Authentication (çok kullanıcı için)

---

## Bilinen Sorunlar

| # | Sorun | Etki | Öncelik |
|---|-------|------|---------|
| ~~S1~~ | ~~Ollama model listesi hardcode~~ | ~~Yeni model kurulunca arayüzde görünmüyor~~ | ✅ **Çözüldü** (Faz 5/B) |
| S2 | OpenAI direkt adapter yok | GPT modelleri sadece OpenRouter üzerinden | 🟡 |
| S4 | `compute_agent_spent` limitsiz ajanlarda 0 döner | Budget limiti olmayan ajanların gerçek harcaması görünmüyor | 🟢 |
| S5 | Live Ops feed'i animasyonlu değil | Gerçek eventler var ama yeni event eklenmez | 🟢 |
| S6 | `GET /agents?company_id=X` filtresi yok | Tüm ajanlar döner, client filtreler | 🟡 |
| ~~S7~~ | ~~UI'da "Yeni Ticket Oluştur" formu yok~~ | ~~Sadece API'den oluşturulabiliyordu~~ | ✅ **Çözüldü** (Faz 5/A) |
| S8 | Skill/Workflow oluşturma UI'ı yok | Terminal + API bilgisi gerekiyor | 🔴 |
| S9 | Roller hardcode (ceo/eng/qa/planner) | Farklı şirket tipleri için uygunsuz | 🔴 |

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
│  │/providers│  │          │  │              │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└──────────────────┬──────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│PostgreSQL│  │  Ollama  │  │ Cloud APIs   │
│         │  │ /api/tags│  │ Anthropic    │
│         │  │ (dinamik)│  │ OpenRouter   │
└─────────┘  └──────────┘  └──────────────┘
```

---

## Kaynaklar

- Paperclip (referans): `C:\My_OS\Maestr_OS`
- Backend API: `http://localhost:8080/docs` (FastAPI Swagger)
- Dashboard: `http://localhost:5173`
- GitHub: `https://github.com/Simulate-X/MaestrOS`
- Alembic migrasyonlar: `control-plane/alembic/versions/`
- Unit testler: `control-plane/tests/`
