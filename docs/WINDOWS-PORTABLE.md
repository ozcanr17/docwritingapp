# Windows taşınabilir dağıtım ve geliştirme

Windows dağıtımı iki bağımsız çalıştırılabilir dosyadan oluşur:

- `DocSys Server.exe`, PostgreSQL, Redis, MinIO, API, collaboration ve worker süreçlerini kullanıcı profilinde hazırlar ve yönetir.
- `DocSys.exe`, React arayüzünü yerel tarayıcıda açan küçük istemcidir. Gerekirse yanında bulunan sunucu yöneticisini otomatik başlatır.

İki dosya aynı klasörde tutulmalıdır. Önce `DocSys Server.exe` çalıştırılabilir veya doğrudan `DocSys.exe` açılabilir. Bir kurulum programı çalışmaz; kayıt defteri, Windows servisi, PATH veya sistem klasörleri değiştirilmez ve yönetici izni istenmez.

DocSys başlangıçta aşağıdaki yazılabilir konumları sırayla dener:

1. Tanımlanmışsa `DOCSYS_HOME` ortam değişkenindeki klasör.
2. `%LOCALAPPDATA%\DocSys`.
3. Kullanıcı profiline erişilemiyorsa iki EXE'nin yanındaki `DocSysData` klasörü.

Her aday için klasör oluşturma, dosya yazma, diske aktarma, yeniden adlandırma ve silme denemesi yapılır. `%LOCALAPPDATA%` tanımlı olsa bile gerçek yazma yetkisi yoksa uygulama otomatik olarak üçüncü seçeneğe geçer. Gömülü PostgreSQL, Redis, MinIO ve Node süreçlerinin geçici klasörleri ile `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `HOME`, `TEMP` ve `TMP` kullanımları da seçilen DocSys veri köküne yönlendirilir. Böylece alt süreçler yasaklı profil klasörlerine bağımlı olmaz.

EXE klasörü de yazılabilir değilse uygulama sessizce takılmaz; `DS-SRV-110` veya `DS-CLI-110` kodlu bir hata gösterir ve denenen klasörleri listeler. Yönetici hesabı `admin@docsys.local`, ilk parola `Admin1234!` değeridir.

Sunucu paneli servis durumlarını gösterir, istemciyi açar, logları görüntüler, PostgreSQL yedeği oluşturur ve bütün süreçleri kontrollü biçimde durdurur. Sunucu yalnızca `127.0.0.1` üzerinde dinler ve yönetici yetkisi gerektirmez. PostgreSQL, Redis, MinIO, Node, migration ve seed süreçleri konsol penceresi oluşturmadan arka planda çalışır.

## Dokümanlar ve kullanıcı verileri nerede saklanır?

DocSys içindeki gereksinim ve test dokümanları ayrı Word dosyaları olarak proje klasörüne yazılmaz. Doküman yapısı, satırlar, bağlantılar, geçmiş ve kullanıcı bilgileri seçilen veri kökündeki `data\postgres` altında saklanır. Yüklenen ekler ve üretilen dosya nesneleri `data\minio` altında, Redis kuyruk verisi `data\redis` altında bulunur.

Normal kullanıcı profili modunda kök `%LOCALAPPDATA%\DocSys`, taşınabilir fallback modunda ise EXE'lerin yanındaki `DocSysData` klasörüdür. Sunucu paneli etkin konumu ve çalışma modunu açıkça gösterir. Panelden alınan veritabanı yedekleri bu kökün `backups` klasörüne yazılır. DOCX, XLSX, CSV, PDF veya ReqIF dışa aktarımları tarayıcının indirme ayarlarında seçili klasöre kaydedilir.

Fallback modunda uygulamayı başka bir bilgisayara taşırken `DocSysData` klasörünü iki EXE ile birlikte kopyalamak veriyi de taşır. Uygulama çalışırken bu klasör kopyalanmamalıdır; önce sunucu panelinden kontrollü biçimde durdurulmalıdır.

## Başlangıç tanıları ve hata kodları

Server her aşamayı `<veri kökü>\logs\launcher.log` dosyasına yazar. Son veya devam eden aşama makine tarafından okunabilir biçimde `<veri kökü>\logs\startup-status.json` dosyasında tutulur. İstemci tanıları `<veri kökü>\logs\client.log` dosyasındadır. Bir aşama başarısız olduğunda ileti kutusu hata kodunu, aşamayı, işletim sistemi hatasını, önerilen işlemi ve ilgili log yolunu gösterir.

Sunucu panelindeki `Startup stages`, `Client`, `API`, `Collaboration`, `Worker`, `PostgreSQL`, `Redis`, `Storage`, `Migration` ve `Seed` seçenekleri ilgili logların son bölümünü gösterir.

| Kod aralığı | Aşama |
| --- | --- |
| `DS-SRV-100`–`140` | Windows mimarisi, yazılabilir depolama, log ve port ön kontrolleri |
| `DS-SRV-200`–`220` | Gömülü runtime, veri klasörleri ve yerel secret dosyası |
| `DS-SRV-300`–`330` | PostgreSQL, Redis ve MinIO |
| `DS-SRV-400`–`430` | Migration, API/collaboration/worker ve başlangıç verisi |
| `DS-SRV-500`–`560` | Sunucu paneli, tarayıcı, istemci, yedek, durdurma ve log işlemleri |
| `DS-CLI-100`–`120` | İstemci mimarisi, depolama ve log hazırlığı |
| `DS-CLI-200` | Gömülü web arayüzünü açma |
| `DS-CLI-300`–`310` | Yanındaki server EXE'sini bulma, başlatma ve hazır olmasını bekleme |
| `DS-CLI-400`–`420` | Yerel arayüz portu ve HTTP sunucusu |
| `DS-CLI-500` | Varsayılan tarayıcıyı açma |

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

Bu komut iki EXE'yi, ayrı SHA-256 dosyalarını ve `DocSys-Windows-Portable-vX.Y.Z.zip` arşivini üretir. Sürüm etiketi açılmadan önce ortak ürün sürümünü doğrulayın:

```powershell
corepack pnpm release:check
```

Ana dal ve pull request doğrulamasında Windows runner istemciyi, sunucu başlatıcısını ve payload paketleyicisini gerçekten derler. `vX.Y.Z` etiketi macOS/Linux/Windows Tauri paketleri ile bu taşınabilir arşivi aynı taslak GitHub sürümünde birleştirir.

Tam release build yalnız bağımlılık sürümü, migration seti veya teslim edilecek backend değiştiğinde gerekir. Günlük frontend geliştirmesinde Vite dev server, backend geliştirmesinde hızlı runtime güncellemesi kullanılmalıdır.
