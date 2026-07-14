# DocSys — Kapsamlı Durum Raporu

Tarih: 14 Temmuz 2026 · Depo: `ozcanr17/docwritingapp` (main dalı)

## 1. Proje Nedir?

DocSys, IBM DOORS'tan esinlenen, tarayıcı tabanlı, kurumsal sınıf bir **Gereksinim, Test ve Doküman Yönetim Sistemi**dir. Windows, Linux ve macOS üzerinde modern bir web tarayıcısıyla çalışır; hem şirket içi (on-premise) hem bulut kurulumunu destekler ve tamamen Docker ile paketlenir.

Temel yetenekler (hedef): sınırsız derinlikte klasör/doküman ağacı, hiyerarşik numaralandırma (1.1.2 gibi), gereksinim–test izlenebilirliği, 50 kullanıcıya kadar eşzamanlı gerçek zamanlı düzenleme, yumuşak silme + 30 gün geri getirme, değiştirilemez denetim kaydı (audit), Word/CSV/XLSX dışa aktarım, açık/koyu tema, Türkçe ve İngilizce arayüz (kod tanımlayıcıları daima İngilizce).

## 2. Mimari Özet

| Katman | Teknoloji |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, TypeScript strict |
| API | NestJS 11 + Fastify, REST + OpenAPI (Swagger) |
| Gerçek zamanlı | Yjs CRDT + Hocuspocus (zengin metin) ve Redis pub-sub + WebSocket (alan olayları, presence) |
| Veritabanı | PostgreSQL 16 + Prisma 6 — tüm kalıcı iş verisinin tek otoritesi |
| Redis | Yalnızca geçici veri: presence, kuyruk (BullMQ), önbellek — asla tek kopya iş verisi tutmaz |
| Nesne depolama | MinIO / S3 (ekler, DOCX şablonları, dışa aktarımlar) |
| Arka plan işleri | BullMQ worker: 30 günlük kalıcı silme (purge), anlık görüntü sıkıştırma |
| Ön yüz | React + Vite + TypeScript, TanStack Query/Virtual, Tailwind, i18next (TR/EN) |
| Dağıtım | Docker Compose (tek sunucu), ileride Kubernetes'e hazır |

Mimari kararların tamamı `docs/adr/0001–0011` dosyalarında gerekçeleriyle kayıtlıdır. Hiyerarşi tasarımı: komşuluk listesi (parentId) + `ancestorPath` ön-ek yolu + LexoRank sıra anahtarları; görüntüleme numaraları asla veritabanında tutulmaz, sıradan türetilir — böylece bir satırı taşımak belgenin tamamını yeniden numaralandırmaz.

## 3. Hangi Kilometre Taşındayız?

Proje 4 fazlı bir planla ilerliyor. **Şu an: Faz 3'ün çekirdeği teslim edildi.**

| Faz | Kapsam | Durum |
|---|---|---|
| Faz 1 | Mimari analiz, ADR'ler, veritabanı şeması, Docker altyapısı | ✅ Tamamlandı ve onaylandı |
| Faz 2 | Backend API, kimlik doğrulama, RBAC, gerçek zamanlı işbirliği, worker, testler | ✅ Tamamlandı |
| Faz 3 | Frontend çekirdeği: uygulama kabuğu, temalar, ağaç, sanallaştırılmış grid | 🟢 Çekirdek teslim edildi (kalanlar aşağıda) |
| Faz 4 | İzlenebilirlik ekranları, DOCX/CSV/XLSX içe-dışa aktarım, ekler | ⬜ Bekliyor |

## 4. Bugüne Kadar Neler Başarıldı?

### Faz 1 Çıktıları
- 11 adet mimari karar kaydı (ADR): modular monolith, monorepo, NestJS+Fastify, PostgreSQL+Prisma, Redis sorumlulukları, Yjs+Hocuspocus, hiyerarşi stratejisi, audit/yumuşak silme, nesne depolama, REST/WebSocket ayrımı, tarayıcı-öncelikli strateji.
- 7 Mermaid sistem diyagramı (bağlam, konteyner, modüller, işbirliği akışı, düzenleme sırası, silme/purge akışı, dağıtım).
- 31 tabloluk Prisma şeması: UUID birincil anahtarlar, her kiracı tablosunda `organizationId` sınırı, optimistic concurrency için `version` kolonları, yumuşak silme alanları, değiştirilemez `audit_events` tablosu, yasal bekletme (`legal_holds`).
- Migration'lar gerçek PostgreSQL 16 üzerinde uygulandı ve duman testinden geçti.
- PostgreSQL + Redis + MinIO için Docker Compose (Colima ile çalışır durumda doğrulandı, üç servis de healthy).

### Faz 2 Çıktıları (tüm testler yeşil)
- **API (`apps/api`)**: kayıt/giriş (HTTP-only cookie + JWT), rol tabanlı yetkilendirme (system_admin'den viewer'a 7 sistem rolü), organizasyon/çalışma alanı/proje yönetimi, klasör-doküman ağacı (taşıma + döngü engelleme), hiyerarşik satırlar (oluşturma, güncelleme, taşıma, sıralama, yumuşak silme/geri getirme), gereksinim–test bağlantıları, satır-proje atamaları, özel alan tanımları + JSONB değer doğrulama, aynı transaction içinde audit kaydı, idempotency anahtarları, sağlık uçları, Swagger dokümantasyonu.
- **İşbirliği sunucusu (`apps/collaboration`)**: Hocuspocus tabanlı; odaya katılım öncesi JWT + doküman okuma yetkisi kontrolü; anlık görüntüler PostgreSQL'e kalıcı yazılır.
- **Worker (`apps/worker`)**: günlük zamanlanan purge işi (parti parti, yasal bekletmeye saygılı, tekrar çalıştırılabilir, çocuktan-ebeveyne doğru kalıcı silme, purge audit kaydı) + anlık görüntü sıkıştırma (son 5 tutulur).
- **Test sonuçları**: API entegrasyon testleri **24/24**, worker testleri **5/5**, **50 istemcili Yjs yük testi geçti** (senkronizasyon 76 ms, yakınsama 105 ms, tüm istemci durumları birebir aynı).

### Faz 3 Çıktıları (çekirdek, uçtan uca doğrulanmış)
- `apps/web`: React + Vite + TypeScript strict uygulama.
- Açık / koyu / sistem teması; semantik tasarım token'ları (CSS değişkenleri), tema flaşı yok.
- **Türkçe (varsayılan) ve İngilizce arayüz**; çeviriler `apps/web/src/locales/tr.json` ve `en.json` dosyalarında doğru Türkçe karakterlerle tutulur; kenar çubuğundan tek tıkla dil değiştirilir ve tercih kalıcıdır.
- Giriş/kayıt ekranı, ilk kullanımda organizasyon + çalışma alanı kurulum sihirbazı.
- Tembel yüklenen klasör-doküman ağacı, sağ tık menüleri (yeni klasör/doküman, silme).
- Sanallaştırılmış hiyerarşik grid: türetilmiş numaralar (1, 1.1, 1.2), satır içi düzenleme, satır menüsü (alt satır, kardeş satır, başlık, içeri/dışarı alma, silme).
- İyimser (optimistic) arayüz: anında güncelleme, 409 çakışmasında geri alma + bildirim.
- Canlı işbirliği: `/ws/events` bağlantısı, presence avatarları ("Çevrimiçi: N"), olay güdümlü önbellek tazeleme.
- 4 bileşen testi + **Playwright uçtan uca duman testi geçti** (kayıt → organizasyon kurulumu → doküman oluşturma → hiyerarşik satır ekleme → satır içi düzenleme → dil değiştirme).

## 5. Bilinen Sınırlamalar (açıkça beyan)

- Zengin metin editörü (Tiptap + Yjs), sürükle-bırak (dnd-kit), yeniden boyutlandırılabilir paneller, bölünmüş ekran bağlantı görüntüleyici ve çöp kutusu ekranı Faz 3'ün kalan işleridir.
- ESLint yapılandırması henüz eklenmedi.
- Docker imaj dosyaları yazıldı ancak henüz build edilmedi.
- CSRF token deseni henüz yok (cookie SameSite=strict ile sınırlı koruma mevcut).
- Yjs kalıcılığı artımlı güncelleme kütüğü yerine 2 sn debounce'lu tam anlık görüntü kullanıyor (ADR 0006'da belgelendi).
- CI iş akışı `infra/github-ci.yml` konumunda bekliyor; `gh auth refresh -s workflow` sonrası `.github/workflows/` altına taşınmalı.

## 6. Sıradaki Plan

Faz 3'ün kalanları (onay sonrası): Tiptap + Yjs zengin metin editörü, dnd-kit ile sürükle-bırak, kalıcı panel boyutları, bölünmüş ekran gereksinim görüntüleyici, çöp kutusu/geri getirme ekranı, ESLint, erişilebilirlik derinleştirme. Ardından Faz 4: izlenebilirlik matrisi, DOCX/CSV/XLSX içe-dışa aktarım, ekler ve nesne depolama entegrasyonu.

## 7. Depo Haritası ve Çalıştırma

```
apps/api            NestJS API          apps/collaboration  Hocuspocus sunucusu
apps/worker         BullMQ worker       apps/web            React/Vite ön yüz
packages/database   Prisma şema+client  packages/config     zod ortam doğrulama
infra/docker        Compose+Dockerfile  docs/adr, docs/architecture  kararlar
tests/e2e           Playwright          tests/performance   50 istemcili yük testi
```

Yerel çalıştırma, tuzaklar ve kesin kurallar için depo kökündeki `HANDOFF.md` dosyasına bakın (İngilizce, sıfır bağlamlı oturumlar için yazıldı). Önemli yerel not: bu geliştirme makinesinde her PostgreSQL komutundan önce `export LC_ALL=C` gereklidir. Yerel veritabanları: `docsys` (geliştirme) ve `docsys_test` (test), rol `docsys`.
