# DocSys Kurumsal Yetenek Yol Haritası

Bu yol haritası IBM Engineering Requirements Management DOORS ailesi, Jama Connect, Siemens Polarion ve PTC Codebeamer gibi araçların tercih edilmesini sağlayan ortak avantajları DocSys'e taşımak için hazırlanmıştır. Amaç eski ürünlerin ekranlarını kopyalamak değil; aynı güven, yönetişim ve ölçek özelliklerini daha sade bir yazım ve test deneyimiyle sunmaktır.

## Ürün ilkeleri

- Tek doğruluk kaynağı: gereksinim, test, koşum, hata, karar ve baseline aynı ilişki modelinde izlenir.
- Kanıtlanabilir güven: resmi yayın kararı ölçülebilir kalite, kapsam, inceleme ve doğrulama kanıtına dayanır.
- Değişiklik etkisi önce görünür: kullanıcı bir içeriği değiştirmeden ve yayınlamadan önce etkilenen bağlantıları ve yeniden çalıştırılacak testleri görür.
- Hızlı yazım: temel yazım akışı kurumsal kontroller yüzünden ağırlaşmaz; ayrıntılı kontroller ihtiyaç anında açılır.
- Yapılandırılabilir yönetişim: ekipler kendi zorunlu alanlarını, kalite kurallarını, onaylarını ve yayın politikalarını tanımlar.
- Açık birlikte çalışabilirlik: veriler ReqIF ve ofis biçimleriyle taşınabilir; dış sistemlerle kimliği korunarak eşlenebilir.
- Denetlenebilirlik: kullanıcı, zaman, önceki değer, yeni değer ve gerekçe bütün resmi değişikliklerde saklanır.

## Faz 1 — Yayına Hazırlık ve Resmi Doküman Güveni

Amaç, bir dokümanın baseline veya resmi yayın için neden hazır olup olmadığını tek ekranda açıklamaktır.

Teslimatlar:

- İçerik, izlenebilirlik, bağlantı güncelliği, test doğrulaması ve gözden geçirme kapılarını birleştiren Yayına Hazırlık Merkezi.
- Eksik veya hatalı nesneye doğrudan giden sorun listesi.
- Şüpheli bağlantılardan türetilen yeniden test adayları.
- Başarısız veya tamamlanmamış son test koşumlarının görünümü.
- Son baseline'a göre eklenen, değiştirilen ve kaldırılan satır özeti.
- Baseline oluşturma ekranında aynı değerlendirmeyi gösteren yayın ön kontrolü.
- İlk teslimatta danışman mod: engeller görünür fakat baseline alma teknik olarak durdurulmaz. Politika tanımlama tamamlandığında ekip isterse zorunlu kapı haline getirebilir.

Kabul ölçütleri:

- Kullanıcı Analiz menüsünden değerlendirmeyi açabilir.
- Her kapı geçti, engelli, uyarı veya uygulanamaz olarak görünür.
- Bir sorun veya yeniden test adayı tıklandığında ilgili doküman ve nesne açılır.
- Gereksinim dokümanında kapsanmayan gereksinimler; test dokümanında bağlantısız veya eksik adımlar ve başarısız son koşumlar yayın güvenini düşürür.
- Son baseline sonrası sapma ve şüpheli bağlantılar ayrı ayrı görülebilir.

## Faz 2 — Değişiklik Etkisi ve Yeniden Test Orkestrasyonu

İlk dikey dilim tamamlandı: kullanıcı 1–3 bağlantı seviyesi seçerek son baseline değişikliklerinden başlayan etki analizini çalıştırabilir, etkilenen testleri seçebilir ve kaynağı/derinliği denetim kaydında korunan kalıcı bir yeniden test paketi oluşturabilir. Paketler Koşumlar görünümünde planlandı, koşuluyor, tamamlandı veya iptal edildi durumlarıyla; test bazında son koşum ve başarı ilerlemesiyle izlenir. Bir paket öğesi gerçek test koşumu başlatır, tamamlanan öğeler paketin durumunu atomik olarak ilerletir ve aynı öğe tekrar koşulabilir.

- Bir satır değişmeden önce birinci, ikinci ve yapılandırılabilir derinlikte etki önizlemesi.
- Değişiklik kümesi, ilgili gereksinimler, testler, varyantlar ve dış kayıtların birlikte seçilmesi.
- Baseline farkı ve bağlantı yönüne göre otomatik yeniden test paketi.
- Risk, öncelik, güvenlik seviyesi ve ürün varyantına göre test kapsamı azaltma politikaları.
- Etki analizinden koşum planı üretme ve sonuçları yeniden yayın kararına bağlama.

Çıkış ölçütü: Bir değişikliğin hangi resmi çıktıları ve testleri etkilediği elle matris taramadan belirlenebilir.

## Faz 3 — Resmi İnceleme, Elektronik İmza ve Değişiklik Yönetişimi

- Baseline veya seçili nesne kümesi üzerinde kilitli inceleme paketi.
- İnceleyen rolü, son tarih, çoğunluk/oybirliği politikası ve sıralı onay.
- Kimlik doğrulamalı elektronik imza, karar gerekçesi ve imzalanan içerik özeti.
- Önerilen değişikliklerin karşılaştırmalı kabul, red ve kısmi uygulama akışı.
- İnceleme bulguları, çözümlenme kanıtı ve resmi karar raporu.

Çıkış ölçütü: Bir resmi sürümün kim tarafından, hangi içerik üzerinde ve hangi kanıtla onaylandığı değiştirilemez biçimde gösterilir.

## Faz 4 — Yeniden Kullanım, Ürün Varyantları ve Konfigürasyon Yönetimi

- Ana içerikten dallanma, paylaşılmış içerik ve kontrollü kopya seçenekleri.
- Varyant koşulları, etkililik tarihleri ve ürün/ortam bağlamı.
- Ana içerik değişikliklerini varyantlara karşılaştırma, birleştirme ve reddetme.
- Konfigürasyona özel izlenebilirlik, kapsam ve koşum görünümü.
- Baseline kümeleriyle uçtan uca ürün sürümü oluşturma.

Çıkış ölçütü: Aynı gereksinim ve test ailesi kopyala-yapıştır sapması olmadan birden fazla ürün varyantında yönetilir.

## Faz 5 — Birlikte Çalışabilirlik ve Entegrasyon Ekosistemi

- ReqIF veri tipleri, özellik tanımları, hiyerarşi, bağlantılar ve gömülü nesneler için yüksek sadakatli çift yönlü aktarım.
- Jira, Azure DevOps, GitHub ve hata yönetim sistemleri için kimlik eşlemeli bağlayıcılar.
- Tekrarlanabilir webhook teslimi, hata kuyruğu, yeniden deneme ve işlem günlüğü.
- Belgelenmiş dış API, servis hesapları ve olay abonelikleri.
- DOCX/PDF/XLSX çıktılarında ekip şablonu, kapak, revizyon tablosu ve izlenebilirlik ekleri.

Çıkış ölçütü: Dış sistemle eşlenen nesneler tekrar içe aktarmada çoğalmaz ve ilişki/kimlik kaybetmez.

## Faz 6 — Ölçek, Uyum, Kimlik ve Operasyon

- SCIM kullanıcı yaşam döngüsü, SAML/OIDC kurumsal uyumluluk ve ayrıntılı yönetim arayüzü.
- Alan, satır, doküman, klasör ve baseline düzeyinde kalıtımlı izin politikaları.
- Düzenleyici standartlar için hazır kalite ve kanıt paketleri.
- Çok büyük modüllerde sunucu tarafı sayfalama, sanallaştırma ve arama indeksleri.
- Saklama, yasal bekletme, dışa aktarma denetimi, zararlı dosya tarama ve güvenlik olayları.
- Hizmet seviyesi göstergeleri, kapasite eşikleri, yedekleme ve geri dönüş tatbikatları.

Çıkış ölçütü: Sistem kurum kimliği, denetimi, veri saklama ve büyük doküman yükü altında ölçülmüş hedefleri karşılar.

## Faz 7 — Yardımlı Mühendislik ve Kalite Otomasyonu

- Türkçe ve İngilizce gereksinim belirsizliği, edilgenlik, ölçülemezlik ve sözlük denetimi.
- Gereksinimden test taslağı ve kabul ölçütü önerisi.
- Olası bağlantı, tekrar eden gereksinim ve kapsam boşluğu önerisi.
- Değişiklik özeti, etki açıklaması ve inceleyici özeti.
- Her öneride kaynak, güven puanı, insan onayı ve denetim kaydı.

Çıkış ölçütü: Otomasyon karar vermez; mühendisin inceleyebildiği, reddedebildiği ve kaynağını görebildiği öneriler üretir.

## Önceliklendirme yöntemi

Her teslimat kullanıcı değeri, resmi yayın riski, uygulanabilirlik, veri modeli etkisi ve geriye dönük uyumluluk açısından puanlanır. Resmi kayıtları değiştiren yetenekler yalnızca arayüzle tamamlanmış sayılmaz; API yetkilendirmesi, atomik işlem, denetim kaydı, entegrasyon testi ve hata geri dönüşü birlikte teslim edilir.

Faz 1 tamamlandıktan sonra Faz 2'nin ilk dikey dilimi, şüpheli bağlantı ve baseline farkından yeniden test paketi üretmek olacaktır. Bu sıra, mevcut DocSys altyapısının güçlü olduğu izlenebilirlik, baseline ve gerçek koşum yeteneklerini doğrudan kullanıcı değerine dönüştürür.
