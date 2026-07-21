# DocSys v0.1.6

Windows için yönetici yetkisi ve kurulum gerektirmeyen taşınabilir yayın.

## Öne çıkanlar

- Ayrı `DocSys.exe` istemcisi ve `DocSys Server.exe` yerel sunucu yöneticisi.
- PostgreSQL 16, Redis, MinIO, Node.js, API, collaboration ve worker çalışma ortamı sunucu EXE'sine gömülüdür.
- Alt süreçler görünür konsol penceresi oluşturmadan çalışır.
- DocSys marka logosu Windows EXE ikonlarına, favicon'a ve giriş ekranına eklendi.
- Akıllı Otopark Yönetim Sistemi senaryosunda 22 Türkçe gereksinim, 9 kabul testi ve 39 test adımı içeren demo veri seti.
- Test başına 2-7 adım; bir testten birden fazla gereksinime ve bir gereksinimden birden fazla test adımına izlenebilirlik bağlantıları.
- İlk seed yalnız sürüm başına bir kez çalışır; sonraki açılışlarda yeniden veri üretmez.
- Eski arayüz önbelleğinden kaynaklanan yanlış güncelleme uyarısı engellendi.

## Kullanım

İki EXE'yi aynı klasöre çıkarın ve `DocSys.exe` dosyasını çalıştırın. Kurulum, yönetici yetkisi, Docker veya harici runtime gerekmez. İlk çalıştırmada gömülü taşınabilir altyapı `%LOCALAPPDATA%\DocSys` altına sessizce hazırlanır.

Varsayılan yönetici hesabı `admin@docsys.local`, ilk parola `Admin1234!` değeridir. İlk girişten sonra parolanın değiştirilmesi önerilir.

## Veri konumu

- Uygulama verileri: `%LOCALAPPDATA%\DocSys\data`
- PostgreSQL yedekleri: `%LOCALAPPDATA%\DocSys\backups`
- Loglar: `%LOCALAPPDATA%\DocSys\logs`

## SHA-256

- `DocSys Server.exe`: `E0E580C03867D74BE26E2644BD126730B6AF4EBE5EEE2B49540F7CF31EA38E08`
- `DocSys.exe`: `9D82A7E0CA712685CF6EB6738A5F6D589512F73450B215080EE1BF9B0E238868`
- `DocSys-Windows-Portable-v0.1.6.zip`: `D7194BFA3FCB04102557B214188955CCF39B2E55088AB3506CF13A1D4A2FA1BC`
