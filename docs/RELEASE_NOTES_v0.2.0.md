# DocSys 0.2.0 — Windows Portable

## Öne çıkanlar

- Görev, Hikâye ve Hata kayıtları Tip, Özet, Detaylı açıklama, Atanan, Bildiren, Öncelik ve Etiket alanlarıyla oluşturulabilir.
- Hata kayıtlarında Tekrarlama adımları, Beklenen sonuç, Gerçekleşen sonuç, Test ortamı ve Etkilenen sürüm yapılandırılmış olarak saklanır.
- Bir kayda birden fazla okunabilir DocSys dokümanı oluşturma sırasında veya kayıt detayından bağlanabilir.
- Dashboard; Açık bug'larım, Son görevler ve Sistem metrikleri bileşenlerini gösterir.
- Kanban kartları To Do, In Progress, Code Review, Ready for Test ve Done durumları arasında sürüklenebilir. Geçişler proje iş akışına göre sunucuda doğrulanır.
- Liste, Dashboard, Kanban ve kayıt detayı değişikliklerden sonra aynı güncel veriyi gösterir.
- Form kontrolleri açık ve koyu temada okunabilir renk, kenarlık, placeholder, option ve focus durumlarına sahiptir.

## Veri ve uyumluluk

`20260724120000_issue_tracking_fields` migration'ı mevcut kayıtları silmeden Hata kanıt alanlarını ekler. Önceki Epic ve Risk kayıt tipleri korunmuştur. Başarısız bir test adımından oluşturulan Hata; adımı, beklenen/gerçekleşen sonucu, ortamı ve build referansını otomatik taşır.

## Windows kullanımı

ZIP içindeki `DocSys.exe` ve `DocSys Server.exe` aynı klasörde tutulmalıdır. Kurulum, Docker, Node.js, PostgreSQL, Redis, terminal, Windows servisi veya yönetici yetkisi gerekmez. `DocSys.exe` gerekirse yanındaki server'ı otomatik başlatır.

Profil dizinine yazılamıyorsa `DocSysData` klasörü EXE'lerin yanında oluşturulur. Veritabanı, dosya nesneleri, loglar ve yedekler bu klasörde kalır. Ayrıntılı başlangıç hataları `DS-SRV-*` ve `DS-CLI-*` kodlarıyla gösterilir.

## Doğrulama

- Sürüm hizalama ve Prisma doğrulaması
- Monorepo typecheck, lint ve yasak karakter taraması
- Web 96, API 71, worker 13: toplam 180 otomatik test
- Portable client/launcher/manager Go testleri ve `go vet`
- Üretim web/API/collaboration/worker build'i
- Koyu ve açık temada Dashboard, Hata oluşturma ve kayıt detayı tarayıcı walkthrough'u
- Windows taşınabilir server/client başlangıç ve HTTP hazır olma smoke testi

Kilitli profil smoke testinde geçersiz `LOCALAPPDATA` kullanıldı. Server EXE yanındaki `DocSysData` fallback'ini seçti, `DS-SRV-000` durumuna ulaştı, altı servisi başlattı, 22 migration'ı ve beş QA sütununu doğruladı. Client HTTP 200, `Cache-Control: no-store` ile hazır oldu.

| Dosya | Boyut | SHA-256 |
| --- | ---: | --- |
| `DocSys-Windows-Portable-v0.2.0.zip` | 281.813.283 bayt | `84C3648E41EBEC2BD38C00925E8B3466D08668C44498B8C831B18ACCC2AAC153` |
| `DocSys Server.exe` | 288.420.269 bayt | `92EF6BDBB6F0730A38949D1C5CF21D0920E493A674CCA62BAB993598867F1A4A` |
| `DocSys.exe` | 7.693.453 bayt | `94CBE1A73D1372A0CB4BC27BE0ADAE07FFDA4B2BDB70F0B742BC1B9FFBCDC549` |
