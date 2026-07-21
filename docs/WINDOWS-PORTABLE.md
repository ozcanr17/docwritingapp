# Windows taşınabilir dağıtım ve geliştirme

Windows dağıtımı iki bağımsız çalıştırılabilir dosyadan oluşur:

- `DocSys Server.exe`, PostgreSQL, Redis, MinIO, API, collaboration ve worker süreçlerini kullanıcı profilinde hazırlar ve yönetir.
- `DocSys.exe`, React arayüzünü yerel tarayıcıda açan küçük istemcidir. Gerekirse yanında bulunan sunucu yöneticisini otomatik başlatır.

İki dosya aynı klasörde tutulmalıdır. Önce `DocSys Server.exe` çalıştırılabilir veya doğrudan `DocSys.exe` açılabilir. Bir kurulum programı çalışmaz; kayıt defteri, Windows servisi, PATH veya sistem klasörleri değiştirilmez ve yönetici izni istenmez. İlk çalıştırmada EXE içindeki taşınabilir altyapı sessizce `%LOCALAPPDATA%\DocSys` altındaki sürüm önbelleğine açılır. Sonraki açılışlar hazır önbelleği kullanır. Veritabanı, yüklenen dosyalar, kuyruk verisi, yedekler ve loglar aynı kullanıcı alanında kalıcıdır. Yönetici hesabı `admin@docsys.local`, ilk parola `Admin1234!` değeridir.

Sunucu paneli servis durumlarını gösterir, istemciyi açar, logları görüntüler, PostgreSQL yedeği oluşturur ve bütün süreçleri kontrollü biçimde durdurur. Sunucu yalnızca `127.0.0.1` üzerinde dinler ve yönetici yetkisi gerektirmez. PostgreSQL, Redis, MinIO, Node, migration ve seed süreçleri konsol penceresi oluşturmadan arka planda çalışır.

## Dokümanlar ve kullanıcı verileri nerede saklanır?

DocSys içindeki gereksinim ve test dokümanları ayrı Word dosyaları olarak proje klasörüne yazılmaz. Doküman yapısı, satırlar, bağlantılar, geçmiş ve kullanıcı bilgileri `%LOCALAPPDATA%\DocSys\data\postgres` altındaki taşınabilir PostgreSQL veritabanında saklanır. Yüklenen ekler ve üretilen dosya nesneleri `%LOCALAPPDATA%\DocSys\data\minio` altında, Redis kuyruk verisi `%LOCALAPPDATA%\DocSys\data\redis` altında bulunur.

Sunucu panelinden alınan veritabanı yedekleri `%LOCALAPPDATA%\DocSys\backups` klasörüne yazılır. DOCX, XLSX, CSV, PDF veya ReqIF dışa aktarımları ise tarayıcının indirme ayarlarında seçili klasöre kaydedilir. Uygulamayı başka bilgisayara taşırken yalnız EXE dosyalarını kopyalamak mevcut dokümanları taşımaz; bunun için panelden yedek alınmalıdır.

## Ayrı build hatları

Yalnız arayüz değiştiğinde:

```powershell
corepack pnpm windows:client
```

Bu komut backend veya altyapıyı paketlemez. Vite üretim derlemesini ve küçük `DocSys.exe` istemcisini yeniler.

Yalnız backend değiştiğinde, sunucu paketi bir kez çalıştırılmışsa ve panelden durdurulmuşsa:

```powershell
corepack pnpm windows:server:fast
```

Bu komut PostgreSQL, Redis, MinIO, Node veya Go arşivlerini yeniden açmaz; yalnız backend TypeScript paketlerini derler ve kullanıcı profilindeki `dist` dosyalarını günceller. EXE üretmez, bağımlılıkları kopyalamaz ve büyük payload sıkıştırmaz.

Backend bağımlılıkları veya lockfile değiştiğinde uygulama katmanını bağımlılıklarla birlikte bir kez yenilemek için:

```powershell
corepack pnpm windows:server:deps
```

Dağıtılabilir sunucu EXE'sini yenilemek gerektiğinde:

```powershell
corepack pnpm windows:server
```

İki teslim dosyasını birlikte hazırlamak için:

```powershell
corepack pnpm windows:release
```

Tam release build yalnız bağımlılık sürümü, migration seti veya teslim edilecek backend değiştiğinde gerekir. Günlük frontend geliştirmesinde Vite dev server, backend geliştirmesinde hızlı runtime güncellemesi kullanılmalıdır.
