# DocSys ve IBM DOORS Yetenek Eşleşmesi

Bu belge DocSys'in IBM Engineering Requirements Management DOORS ve DOORS Next yerine kullanılabilme hedefini mühendislik açısından izler. Bir ürün adı ya da lisans uyumluluğu iddiası değildir. Durumlar, bu depodaki çalışan dikey dilimlere göre verilmiştir.

IBM'in resmi belgelerinde modül görünümleri; kişisel ve paylaşılan görünüm, sütun, sıralama ve filtre ayarlarını birlikte saklar. Gereksinim yönetimi; değişiklik, bağlantı, silme ve taşıma işlemlerinin izlenmesini; değişiklik teklifleri ise kontrollü inceleme akışlarını kapsar. DOORS Next modülleri hiyerarşik gereksinim yapısını, incelemeyi ve ReqIF alışverişini destekler. DocSys yol haritası bu temel kullanım biçimlerini referans alır:

- [Modüllerde filtreler ve görünümler](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors-next/beta?topic=modules-filters-views-in)
- [Gereksinim değişikliklerini yönetme](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors/9.7.0?topic=doors-managing-change-requirements)
- [Change Proposal System](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors/9.7.1?topic=requirements-change-proposal-system)
- [DOORS Next genel bakış](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors/9.7.1?topic=overview-doors-next)
- [Yaşam döngüsü uygulamalarında gereksinim bağlantıları](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors-next/7.1?topic=artifacts-linking-requirements-in-lifecycle-applications)

## Mevcut eşleşme

| Alan | DocSys durumu | Üretim derinliği |
|---|---|---|
| Hiyerarşik modül ve nesne kimliği | Var | Değişmez doküman içi ID, başlık numaralandırma, girinti/çıkıntı, sürükleme, alt ağacı açma/kapama |
| Gereksinim ve test dokümanları | Var | Ayrı doküman türleri, başlıklar, gereksinimler, serbest test adımları ve test şablonu |
| Görünümler | Var | Kişisel/takım görünümleri, görünür ve sabit sütunlar, sıralama, filtre, bağlantılı alan yansıtma |
| İzlenebilirlik | Var | Çoktan çoğa bağlantı, iki yönlü erişim, hızlı önizleme, bağlantı sayısı, şüpheli bağlantı ve matris |
| Arama ve kalite | Var | Çalışma alanı araması, özel alanlar, eksik/tekrar numara, boş açıklama ve testsiz gereksinim kuralları |
| Baseline ve karşılaştırma | Var | Anlamsal 1.0/1.1 sürümleri, satır anlık görüntüsü ve eklenen/silinen/değişen karşılaştırması |
| Test yönetimi | Var | Test koşumu başlatma/bitirme, adım sonucu ve koşum geçmişi |
| İnceleme ve değişiklik teklifi | Var | İnceleme, yorum, bildirim ve değişiklik teklifi için çalışan dikey dilimler |
| İçe/dışa aktarma | Var | CSV, XLSX, PDF, DOCX ve ReqIF; DOCX şablon bağlamı mevcut |
| Yetki ve kimlik | Var | Organizasyon/çalışma alanı rolleri, satır ACL, OIDC SSO ve tenant doğrulaması |
| Ürün varyantı | Kısmi | Konfigürasyon anlık görüntüsü ve kuralları var; dal birleştirme ve etki alanı semantiği sınırlı |
| Dış entegrasyon | Kısmi | Sağlayıcıdan bağımsız kayıt var; Jira, Azure DevOps ve GitHub'a özel çift yönlü adaptörler yok |
| Masaüstü ve web | Var | Aynı React yüzeyi, Tauri kabuğu, çoklu pencere ve güncelleme/paketleme iş akışları |
| Denetim ve geri alma | Kısmi | Sunucu denetim kayıtları var. Açık doküman oturumunda güvenli kişisel geri alma var; kalıcı, çok kullanıcılı işlem günlüğü geri oynatma henüz yok |

## Bu teslimatta güçlendirilen kolaylıklar

- Açık doküman sekmeleri daha geniştir, yatay taşabilir, sürüklenerek sıralanabilir ve sağ tık menüsü sekmenin yanında açılır.
- Doküman araç çubukları normal içerik katmanında kalır; menüler ve modal pencereler tek bir katman düzenine uyar.
- Çevrimiçi kullanıcı listesi fareyle üzerine gelindiğinde açılır, alan terk edildiğinde kapanır. Presence üzerinden açılan profil salt okunur, sol alttaki kendi profil girişi düzenlenebilirdir.
- Başlık alt ağaçları satır oku, sağ tık veya sol/sağ ok tuşlarıyla açılıp kapatılabilir. Arama yapılırken gizlenmiş alt satırlar sonuçlardan kaybolmaz.
- Geri alma/yeniden yapma aynı dokümanda seri çalışır; hızlı ardışık komutların yarışması engellenir. Test şablonunun kök ve bütün alt ağacı tek işlem olarak silinip geri getirilebilir. Geçmiş doküman sekmesi kapanınca temizlenir.

## Eşdeğerlik için kalan üretim işleri

### P0 — Kontrollü kurum kullanımı öncesi

1. Her yapı değişikliğini tek sunucu işlemi olarak saklayan kalıcı komut günlüğü; toplu düzenleme, sütun şeması, çocukları yükselterek silme ve çapraz doküman bağlantı işlemleri için atomik geri alma.
2. ReqIF için üçüncü taraf veri tipleri, iç içe specification, embedded object ve çapraz doküman referanslarında tam round-trip uyumluluk paketi.
3. Ek dosyalarda zararlı yazılım/CDR taraması, karantina, kalıcı yükleme tamamlanma durumu ve güvenlik yönetimi ekranı.
4. Satır yetkisi yönetim arayüzü, SAML/SCIM, kurumsal kimlik sağlayıcı uygunluk testleri ve ayrıntılı denetim raporu.

### P1 — DOORS uzman kullanıcı eşdeğerliği

1. AND/OR gruplu gelişmiş filtre oluşturucu; ata/alt nesneleri sonuçla birlikte gösterme ve eşleşmeyi vurgulama. IBM'in resmi dokümanı karmaşık filtreler ile ata/alt nesne seçeneklerini açıklar: [Artifact filtreleri ve görünümleri](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors-next/beta?topic=requirements-filters-views-artifacts-in-projects).
2. Modül dışında yeniden kullanılabilir artifact/collection modeli, görünüm kopyalama ve takım görünümü sahipliği devri. IBM'in collection ve module ayrımı: [Collections ve modules farkları](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors-next/7.1?topic=modules-differences-between-collections).
3. Baseline-baseline karşılaştırma, değişiklik paketi, elektronik imza, zorunlu onay kapıları ve varsayılan change-request bağlama kuralı.
4. Konfigürasyon dalları için merge/rebase, çakışma çözümü, varyant effectivity ve uçtan uca etki analizi.
5. Zengin artifact gövdesi için tablo, resim, denklem ve gömülü nesne desteğinin dışa aktarımla tam korunması.

### P2 — Ekosistem ve geçiş

1. OSLC tabanlı yaşam döngüsü bağlantıları ve Jira/Azure DevOps/GitHub sağlayıcı adaptörleri; webhook retry/dead-letter, secret-vault ve bağlantı sağlığı. IBM'in yaşam döngüsü yaklaşımı OSLC bağlantılarını kullanır: [DOORS ve Engineering Workflow Management](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/doors/9.7.2?topic=integrating-doors-engineering-workflow-management).
2. DOORS/DOORS Next veri geçiş sihirbazı, doğrulama raporu, ID eşleme tablosu ve tekrar çalıştırılabilir migration dry-run.
3. Terim sözlüğü, yazım/kalite kural paketleri, kuruluş şablon kütüphanesi ve etki alanına özel destekli mühendislik kuralları.
4. DXL ile bire bir uyumluluk yerine, yaygın DXL otomasyonlarının güvenli API/SDK eklentilerine taşınması için dönüşüm katmanı.

## Geri alma sınırı

Mevcut istemci geçmişi bilinçli olarak yalnızca doküman açıkken ve işlemi yapan kullanıcı için tutulur. Hücre/numara/sonuç düzenleme, nesne veya test şablonu oluşturma, alt ağaç silme ve hiyerarşi taşıma kapsanır. Sunucuda başka bir kullanıcı aynı veriyi değiştirdiyse sessizce üzerine yazmak yerine işlem reddedilir. Toplu ve şema düzeyi işlemler için tam geri alma iddiası, P0 kalıcı komut günlüğü tamamlanmadan yapılmamalıdır.
