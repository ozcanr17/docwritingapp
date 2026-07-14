# ReqTrack v2 — Kapsamli Durum Raporu

Tarih: 14 Temmuz 2026 · Depo: `ozcanr17/docwritingapp` (main dali)

## 1. Proje Nedir?

ReqTrack v2, IBM DOORS'tan esinlenen, tarayici tabanli, kurumsal sinif bir **Gereksinim, Test ve Dokuman Yonetim Sistemi**dir. Windows, Linux ve macOS uzerinde modern bir web tarayicisiyla calisir; hem sirket ici (on-premise) hem bulut kurulumunu destekler ve tamamen Docker ile paketlenir.

Temel yetenekler (hedef): sinirsiz derinlikte klasor/dokuman agaci, hiyerarsik numaralandirma (1.1.2 gibi), gereksinim-test izlenebilirligi, 50 kullaniciya kadar eszamanli gercek zamanli duzenleme, yumusak silme + 30 gun geri getirme, degistirilemez denetim kaydi (audit), Word/CSV/XLSX disa aktarim, acik/koyu tema, Turkce arayuz (kod tanimlayicilari daima Ingilizce).

## 2. Mimari Ozet

| Katman | Teknoloji |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, TypeScript strict |
| API | NestJS 11 + Fastify, REST + OpenAPI (Swagger) |
| Gercek zamanli | Yjs CRDT + Hocuspocus (zengin metin) ve Redis pub-sub + WebSocket (alan olaylari, presence) |
| Veritabani | PostgreSQL 16 + Prisma 6 — tum kalici is verisinin tek otoritesi |
| Redis | Yalnizca gecici veri: presence, kuyruk (BullMQ), onbellek — asla tek kopya is verisi tutmaz |
| Nesne depolama | MinIO / S3 (ekler, DOCX sablonlari, disa aktarimlar) |
| Arka plan isleri | BullMQ worker: 30 gunluk kalici silme (purge), anlik goruntu sikistirma |
| Dagitim | Docker Compose (tek sunucu), ileride Kubernetes'e hazir |

Mimari kararlarin tamami `docs/adr/0001–0011` dosyalarinda gerekceleriyle kayitlidir. Hiyerarsi tasarimi: komsu liste (parentId) + `ancestorPath` on-ek yolu + LexoRank sira anahtarlari; goruntuleme numaralari asla veritabaninda tutulmaz, siradan turetilir — boylece bir satiri tasimak belgenin tamamini yeniden numaralandirmaz.

## 3. Hangi Kilometre Tasindayiz?

Proje 4 fazli bir planla ilerliyor. **Su an: Faz 2 tamamlandi, Faz 3 basliyor.**

| Faz | Kapsam | Durum |
|---|---|---|
| Faz 1 | Mimari analiz, ADR'ler, veritabani semasi, Docker altyapisi | ✅ Tamamlandi ve onaylandi |
| Faz 2 | Backend API, kimlik dogrulama, RBAC, gercek zamanli isbirligi, worker, testler | ✅ Tamamlandi (bu depodaki mevcut durum) |
| Faz 3 | Frontend cekirdegi: uygulama kabugu, temalar, agac, sanallastirilmis grid, editor | 🔵 Baslamak uzere |
| Faz 4 | Izlenebilirlik ekranlari, DOCX/CSV/XLSX ice-disa aktarim, ekler | ⬜ Bekliyor |

## 4. Bugune Kadar Neler Basarildi?

### Faz 1 Ciktilari
- 11 adet mimari karar kaydi (ADR): modular monolith, monorepo, NestJS+Fastify, PostgreSQL+Prisma, Redis sorumluluklari, Yjs+Hocuspocus, hiyerarsi stratejisi, audit/yumusak silme, nesne depolama, REST/WebSocket ayrimi, tarayici-oncelikli strateji.
- 7 Mermaid sistem diyagrami (baglam, konteyner, moduller, isbirligi akisi, duzenleme sirasi, silme/purge akisi, dagitim).
- 31 tabloluk Prisma semasi: UUID birincil anahtarlar, her kiraci tablosunda `organizationId` sinari, optimistic concurrency icin `version` kolonlari, yumusak silme alanlari, degistirilemez `audit_events` tablosu, yasal bekletme (`legal_holds`).
- 2 migration gercek PostgreSQL 16 uzerinde uygulandi ve duman testinden gecti.
- PostgreSQL + Redis + MinIO icin Docker Compose (Colima ile calisir durumda dogrulandi, uc servis de healthy).

### Faz 2 Ciktilari (tum testler yesil)
- **API (`apps/api`)**: kayit/giris (HTTP-only cookie + JWT), rol tabanli yetkilendirme (system_admin'den viewer'a 7 sistem rolu), organizasyon/calisma alani/proje yonetimi, klasor-dokuman agaci (tasima + dongu engelleme), hiyerarsik satirlar (olusturma, guncelleme, tasima, siralama, yumusak silme/geri getirme), gereksinim-test baglantilari, satir-proje atamalari, ozel alan tanimlari + JSONB deger dogrulama, ayni transaction icinde audit kaydi, idempotency anahtarlari, saglik uclari, Swagger dokumantasyonu.
- **Isbirligi sunucusu (`apps/collaboration`)**: Hocuspocus tabanli; odaya katilim oncesi JWT + dokuman okuma yetkisi kontrolu; anlik goruntuler PostgreSQL'e kalici yazilir.
- **Worker (`apps/worker`)**: gunluk zamanlanan purge isi (parti parti, yasal bekletmeye saygili, tekrar calistirilabilir, cocuktan-ebeveyne dogru kalici silme, purge audit kaydi) + anlik goruntu sikistirma (son 5 tutulur).
- **Alan olayi kanali**: Redis pub-sub → `/ws/events` WebSocket; satir olusturma/tasima/silme olaylari ve presence bilgisi tum bagli istemcilere aninda dagitilir.
- **Test sonuclari**:
  - API entegrasyon testleri: **24/24 gecti** (kiraci izolasyonu, 403 yetki reddi, 409 surum cakismasi, dongu reddi, alt agac yolu guncellemeleri, idempotent tekrar, silme/geri getirme, baglanti yasam dongusu, audit, eszamanli tasima, WebSocket yetkilendirme ve olay teslimi).
  - Worker testleri: **5/5 gecti** (saklama suresi, yasal bekletme, idempotentlik, dokuman purge, sikistirma).
  - **50 istemcili Yjs yuk testi GECTI**: tum istemciler 76 ms'de senkronize oldu, 50 eszamanli yazma 105 ms'de yakinsadi, tum istemci durumlari birebir ayni, anlik goruntu kalici yazildi.
  - Yasakli karakter taramasi: kaynak kodda Turkce karakter yok (arac: `infra/scripts/scan-forbidden-chars.sh`).

## 5. Bilinen Sinirlamalar (acikca beyan)

- ESLint yapilandirmasi Faz 3'e ertelendi.
- Docker imaj dosyalari yazildi ancak henuz build edilmedi.
- CSRF token deseni henuz yok (cookie SameSite=strict ile sinirli koruma mevcut).
- Yjs kaliciligi artimli guncelleme kutugu yerine 2 sn debounce'lu tam anlik goruntu kullaniyor (ADR 0006'da belgelendi).
- OpenAPI semalari yuzeysel (dogrulamanin kaynagi zod).
- CI is akisi `infra/github-ci.yml` konumunda bekliyor; `gh auth refresh -s workflow` sonrasi `.github/workflows/` altina tasinmali.

## 6. Siradaki Plan — Faz 3 (Frontend Cekirdegi)

- Vite + React + TypeScript strict ile `apps/web` uygulamasi.
- Acik / koyu / sistem temasi; semantik tasarim tokenlari (CSS degiskenleri), tema flash'i olmadan.
- Uygulama kabugu: kenar cubugu (calisma alani secici, Dokumanlar, Cop Kutusu...), klasor-dokuman agaci (tembel yukleme, saga tik menusu).
- Sanallastirilmis hiyerarsik grid: on binlerce satirda akici kaydirma, turetilmis numaralar, satir ici duzenleme.
- Iyimser (optimistic) UI: TanStack Query mutasyonlari, 409 cakismasinda geri alma ve kullaniciya bildirme.
- `/ws/events` uzerinden canli guncelleme ve presence gostergeleri.
- i18next ile Turkce varsayilan arayuz dili (+ Ingilizce altyapisi).
- Bilesen testleri (Vitest + React Testing Library) ve Playwright ile uctan uca duman testi.
- Zengin metin editoru (Tiptap + Yjs) bu fazin sonunda veya devaminda entegre edilecek.

## 7. Depo Haritasi ve Calistirma

```
apps/api            NestJS API          apps/collaboration  Hocuspocus sunucusu
apps/worker         BullMQ worker       apps/web            Faz 3'te dolacak
packages/database   Prisma sema+client  packages/config     zod ortam dogrulama
infra/docker        Compose+Dockerfile  docs/adr, docs/architecture  kararlar
tests/performance   50 istemcili yuk testi
```

Yerel calistirma, tuzaklar ve kesin kurallar icin depo kokundeki `HANDOFF.md` dosyasina bakin (Ingilizce, sifir baglamli oturumlar icin yazildi). Onemli yerel not: bu gelistirme makinesinde her PostgreSQL komutundan once `export LC_ALL=C` gereklidir.
