# DocSys — Çalıştırma ve Test Kılavuzu

Bu belge DocSys uygulamasının macOS, Linux ve Windows üzerinde nasıl çalıştırılıp
test edileceğini anlatır. Arayüz varsayılan olarak **Türkçe** açılır.

## Ön gereksinimler (tüm sistemler)

- **Node.js 22+** ve **pnpm 9+** (`npm i -g pnpm`)
- **Docker** (PostgreSQL, Redis ve MinIO için). macOS'ta [Colima](https://github.com/abiosoft/colima) veya Docker Desktop olur; `colima start` ile başlatabilirsiniz.
- macOS/Linux'ta yerelde Homebrew PostgreSQL/Redis zaten çalışıyorsa script onları otomatik kullanır, Docker'ı yalnızca MinIO için başlatır.

## Tek komutla başlatma

### macOS / Linux

```bash
cd ~/Desktop/workspace/docsys
bash infra/scripts/dev-up.sh
```

Durdurmak için:

```bash
bash infra/scripts/dev-down.sh
# Docker altyapısını (postgres/redis/minio) da durdurmak isterseniz:
STOP_INFRA=1 bash infra/scripts/dev-down.sh
```

### Windows (PowerShell)

Windows'ta tüm altyapı Docker Desktop ile çalışır (önce Docker Desktop'ı başlatın).

```powershell
cd C:\path\to\docsys
powershell -ExecutionPolicy Bypass -File infra\scripts\dev-up.ps1
```

Durdurmak için:

```powershell
powershell -ExecutionPolicy Bypass -File infra\scripts\dev-down.ps1
# Docker altyapısını da durdurmak icin:
$env:STOP_INFRA=1; powershell -ExecutionPolicy Bypass -File infra\scripts\dev-down.ps1
```

### pnpm kısayolları (her sistem)

```bash
pnpm dev          # dev-up.sh (macOS/Linux)
pnpm dev:down     # dev-down.sh
pnpm seed         # sadece admin hesabini yeniden olusturur (uygulama calisirken)
```

## Script ne yapar?

1. PostgreSQL / Redis / MinIO'yu kontrol eder; çalışmıyorsa Docker ile başlatır.
2. Veritabanı rolünü/veritabanını ve tüm göçleri (migration) hazırlar.
3. Bağımlılıkları kurar ve paylaşılan paketleri derler.
4. Dört servisi başlatır: API (3001), Collaboration/gerçek zamanlı editör (3002),
   Worker/arka plan işleri (3003), Web arayüzü (5173).
5. Bir **admin hesabı** oluşturur ve giriş bilgilerini ekrana yazar.

## Giriş bilgileri (admin)

Script çalıştıktan sonra aşağıdaki hesapla giriş yapabilirsiniz:

| Alan | Değer |
|---|---|
| URL | http://localhost:5173 |
| E-posta | `admin@docsys.local` |
| Parola | `Admin1234!` |

Bu değerleri değiştirmek isterseniz script'i çağırmadan önce ortam değişkeni
verin: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.

## Uygulamayı gezmek

- **Dil:** üst menü → **Görünüm → Türkçe / English**
- **Tema:** **Görünüm → Açık / Koyu / Sistem**
- **Yeni içerik:** soldaki ağaçta sağ tıklayın → **Yeni doküman** / **Yeni metin dokümanı**
- **Sütunlar:** **Sütunlar** menüsünden aç/kapat, **Ekle → Sütun ekle** ile yeni sütun
- **İçe/Dışa aktarım:** **Dosya** menüsü (CSV / Word)
- **DOORS özellikleri:** **Dosya** menüsü → Baseline'lar; **Analiz** menüsü → Kapsam raporu, İzlenebilirlik matrisi

## Adresler

| Servis | Adres |
|---|---|
| Web arayüzü | http://localhost:5173 |
| API / Swagger | http://localhost:3001/api/docs |
| MinIO konsolu | http://localhost:9001 (minioadmin / minioadmin) |

## Otomatik testler

```bash
cd apps/api    && npx vitest run     # API entegrasyon testleri
cd apps/worker && npx vitest run     # worker testleri
cd apps/web    && npx vitest run     # bilesen testleri
cd tests/e2e   && npx playwright test # uctan uca testler (4 servisi kendi baslatir)
```

## Sorun giderme

- **PostgreSQL çökmesi (macOS):** her Postgres komutundan önce `export LC_ALL=C` gerekir; script bunu kendisi yapar.
- **Port çakışması:** 5432 (Postgres), 6379 (Redis), 9000/9001 (MinIO), 3001/3002/3003 ve 5173 boş olmalı. Homebrew Postgres/Redis çalışıyorsa script onları kullanır, Docker ile ikinci bir kopya başlatmaz.
- **Loglar:** `.dev-logs/` klasöründe her servisin logu bulunur.
- **Docker yok:** yerelde Postgres/Redis/MinIO'yu kendiniz başlatırsanız script yine çalışır.
