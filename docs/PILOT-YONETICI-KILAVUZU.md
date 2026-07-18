# DocSys Pilot Yönetici Kılavuzu

Bu kılavuz DocSys'i 3–10 kişilik kontrollü bir pilotta çalıştıracak yönetici içindir. Pilotun amacı yalnızca özellik göstermek değil; gerçek bir gereksinim değişikliğinin yazım, inceleme, izlenebilirlik, test ve baseline zincirinde güvenilir biçimde tamamlandığını kanıtlamaktır.

## 1. Pilot öncesi kabul ölçütleri

- Pilotun sahibi ve teknik sorumlusu belirlenmiştir.
- Gerçek fakat hassasiyeti kontrollü bir proje seçilmiştir.
- En az bir yönetici, bir yazar, bir testçi ve bir inceleyici atanmıştır.
- Mevcut Word, Excel veya ReqIF kaynağının salt okunur kopyası korunmuştur.
- Günlük yedek konumu ve geri yükleme sorumlusu belirlenmiştir.
- Pilot sonunda değerlendirilecek ölçüler kararlaştırılmıştır.

Önerilen ölçüler: içe aktarılan satır sayısı, veri düzeltme sayısı, bağlantısız gereksinimler, şüpheli bağlantıların çözülme süresi, tamamlanan test koşumları, kullanıcı başına destek talebi ve resmi çıktının hazırlanma süresi.

## 2. Kurulum ve kullanıcılar

1. `pnpm dev` ile yerel pilot ortamını başlatın veya Docker dağıtımını kullanın.
2. Yönetici hesabıyla Yönetim Paneli'ni açın.
3. Kullanıcıları gerçek e-posta ve görünen adlarıyla oluşturun.
4. Günlük yazım yapanlara Editor, yalnızca görüş bildirenlere Reviewer veya Viewer verin.
5. Belge erişimini yalnızca ihtiyaç duyan kullanıcılarla sınırlandırın.
6. Viewer hesabıyla oturum açıp düzenleme komutlarının kapalı olduğunu doğrulayın.

Yönetici kendi rolünü düşüremez ve son etkin yönetici devre dışı bırakılamaz. Bu korumaları aşmak için doğrudan veritabanı değişikliği yapılmamalıdır.

## 3. İlk proje düzeni

Tek pilot çalışma alanında aşağıdaki sade yapıyla başlayın:

- `01 Gereksinimler`
- `02 Testler`
- `03 Resmi Çıktılar`
- `99 Arşiv`

Önce bir gereksinim ve bir test dokümanı oluşturun. Kuruluş şablonları, varyantlar ve özel alanlar pilot ihtiyacı açıkça ortaya çıkmadan çoğaltılmamalıdır.

Uygulamada Dosya → Yardım → Pilot kontrol listesi üzerinden ilerleme cihaz üzerinde işaretlenebilir.

## 4. Veri geçişi

1. Hedef dokümanı açın.
2. Dosya → İçe Aktar menüsünden CSV, XLSX veya ReqIF seçin.
3. Geçiş Sihirbazı'nın satır sayısı, tür dağılımı ve örnek verisini kontrol edin.
4. Hata bulunan dosyayı içe aktarmayın. Kaynağı düzeltip yeniden önizleyin.
5. Uyarıları tek tek değerlendirin; boş test adımları ve boş gereksinimler bilinçli değilse düzeltilmelidir.
6. İçe aktarma sonrasında hiyerarşi, gereksinim numaraları ve toplam satır sayısını kaynakla karşılaştırın.
7. Kaynak dosyayı pilot bitene kadar değiştirmeden saklayın.

Sihirbaz hiçbir veriyi onaydan önce yazmaz. Aynı dokümanda mevcut veya dosya içinde tekrarlanan gereksinim numaraları hata kabul edilir.

## 5. Günlük çalışma

- Yazar gereksinimleri oluşturur, kalite bulgularını giderir ve testlerle bağlar.
- Testçi test senaryosunu, adımları ve beklenen sonuçları tamamlar.
- İnceleyici yorum veya değişiklik önerisi gönderir.
- Test koşumunda gerçekleşen sonuç ve gerekli kanıt dosyaları eklenir.
- Bağlı bir içerik değiştiğinde şüpheli bağlantılar değerlendirilir.
- Gün sonunda Kaydedildi durumu ve çevrimdışı/çakışma uyarıları kontrol edilir.

## 6. Baseline ve resmi çıktı

Yayına Hazırlık Merkezi'nde içerik kalitesi, izlenebilirlik boşlukları ve şüpheli bağlantılar incelenir. Test sonucu doküman baseline'ı için teknik engel değildir; test kanıtı ayrı bir doğrulama bilgisidir.

Baseline öncesi:

- Gereksinim numaraları benzersizdir.
- Zorunlu içerikler boş değildir.
- Beklenmeyen bağlantısız gereksinimler açıklanmıştır.
- Şüpheli bağlantılar değerlendirilmiştir.
- İnceleme kararı ve açık bulgular kaydedilmiştir.

## 7. Yedekleme ve geri yükleme

Günlük yedek:

```bash
DATABASE_URL=postgresql://... pnpm backup
```

Komut `output/backups` altında PostgreSQL custom-format arşivi ve SHA-256 manifesti üretir. Dosyalar işletim sistemi düzeyinde yalnızca sahibi tarafından okunabilir oluşturulur.

Geri yükleme yalnızca açıkça adı doğrulanan korumasız hedef veritabanına yapılabilir:

```bash
TARGET_DATABASE_URL=postgresql://.../docsys_restore_20260718 \
RESTORE_CONFIRM=docsys_restore_20260718 \
pnpm restore -- output/backups/docsys-....dump
```

`docsys` ve `docsys_test` hedeflerine doğrudan geri yükleme reddedilir. Üretimde önce yeni bir veritabanına geri yükleyin, doğrulayın ve kontrollü bağlantı değişimi yapın.

Otomatik tatbikat:

```bash
DATABASE_URL=postgresql://.../docsys pnpm backup:drill
```

Tatbikat geçici bir veritabanı oluşturur, checksum doğrular, arşivi geri yükler, tablo ve migration varlığını kontrol eder, ardından geçici veritabanını kaldırır. Başarılı bir tatbikat yapılmamış yedek stratejisi tamamlanmış sayılmaz.

## 8. Geri bildirim ve tanılama

Kullanıcı Dosya → Yardım → Pilot geri bildirimi menüsünden hata, kullanılabilirlik, veri geçişi, performans veya özellik isteği gönderebilir. Kayıtlar organizasyon içinde tutulur ve Yönetim Paneli'nde yalnızca yöneticiler tarafından görülür.

Kullanım telemetrisi varsayılan olarak kapalıdır. Kullanıcı Ayarlar → Gizlilik ve Tanılama bölümünden açıkça etkinleştirebilir. Kaydedilen olaylar yalnızca izin verilen ürün olay adı ve sınırlı teknik metadata içerir; doküman metni, parola, token veya ek dosya içeriği gönderilmez.

## 9. Haftalık pilot toplantısı

Her hafta şu sorular cevaplanmalıdır:

- Kullanıcı hangi işlemi destek almadan tamamlayamadı?
- Hangi bilgi tekrar Excel veya Word'de tutuldu?
- Hangi ekran gereğinden fazla zaman aldı?
- Herhangi bir veri kaybı, çakışma veya yetki ihlali oldu mu?
- Hangi rapor gerçek karar vermede kullanıldı?
- Kullanıcı ürünü pilot sonrasında kullanmaya devam etmek istiyor mu?

Kritik veri kaybı, yetkisiz erişim, geri yüklenemeyen yedek veya tekrarlanabilir düzenleme çakışması pilotu durdurma nedenidir.

## 10. Pilot kapanışı

Pilot sonunda gereksinim dokümanı, test dokümanı, izlenebilirlik matrisi, koşum kanıtları, baseline çıktısı, yedekleme tatbikatı sonucu ve kullanıcı geri bildirimleri birlikte değerlendirilir. Başarılı pilot ölçütü özelliklerin açılması değil, gerçek mühendislik çıktısının DocSys üzerinden daha az manuel işlem ve yeterli denetim kanıtıyla üretilebilmesidir.
