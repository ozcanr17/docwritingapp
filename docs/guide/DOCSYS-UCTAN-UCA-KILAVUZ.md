# DocSys Uçtan Uca Mimari, İşletim ve Kullanım Kılavuzu

Sürüm: 1.0
Tarih: 15 Temmuz 2026
Kapsam: Web uygulaması, Tauri masaüstü istemcisi, API, gerçek zamanlı işbirliği, worker, veri katmanı, güvenlik, dağıtım, bakım ve son kullanıcı iş akışları

> Bu kılavuz, DocSys'in mevcut çalışan kod tabanını esas alır. “Mevcut durum”, “üretim için dış önkoşul” ve “gelecek geliştirme” ifadeleri özellikle ayrılmıştır. Böylece tasarlanan ancak henüz tam derinlikte uygulanmamış bir yetenek, çalışan özellik gibi sunulmaz.

[PAGEBREAK]

## Dokümanın amacı ve hedef kitlesi

Bu doküman DocSys'i ilk kez gören bir kişinin sistemi anlamasını, yerel ortamda çalıştırmasını, üretime kurmasını, izlemesini, sorun gidermesini ve son kullanıcı olarak günlük gereksinim-test yönetimi işlerini gerçekleştirmesini sağlayacak tek başvuru kaynağıdır.

Kılavuzun hedef kitlesi:

- Sistem mimarları ve teknik liderler
- Backend, frontend ve masaüstü geliştiricileri
- DevOps, SRE ve sistem yöneticileri
- Bilgi güvenliği ve kalite ekipleri
- Gereksinim mühendisleri, test mühendisleri ve gözden geçirenler
- Ürün sahipleri, proje yöneticileri ve denetçiler

Dokümanda geçen komutlar depo kökü olan `~/Desktop/workspace/docsys` dizininden çalıştırılmadığı açıkça belirtilmedikçe bu dizini temel alır.

## Okuma yolları

- Sistemi hızlı anlamak için: Bölüm 1, 2, 3 ve 4
- Son kullanıcı eğitimi için: Bölüm 12-20
- Kurulum ve işletim için: Bölüm 8-11 ve 21-24
- Geliştirme yapmak için: Bölüm 5-7 ve 25-29
- Güvenlik/denetim için: Bölüm 7, 9, 22 ve 30
- Mevcut açıkları ve yol haritasını görmek için: Bölüm 31

# 1. Ürün özeti

DocSys; gereksinim, test ve genel doküman yönetimini aynı çalışma alanında birleştiren, IBM DOORS benzeri izlenebilirlik ilkelerini modern web ve masaüstü deneyimiyle sunan kurumsal bir uygulamadır. Temel veri birimi, bir dokümanın hiyerarşisi içinde yer alan satırdır. Satırlar başlık, gereksinim, test senaryosu, test adımı veya not olabilir.

Bir gereksinim dokümanı başlıklar ve gereksinim satırlarından; bir test dokümanı başlıklar, test senaryoları ve bu senaryoların altındaki test adımlarından oluşabilir. Test adımları bir veya daha fazla gereksinime bağlanabilir. Bağlantılar iki yönden görüntülenir ve kaynak satır değiştiğinde “şüpheli bağlantı” olarak işaretlenerek etkilenme analizi yapılmasını sağlar.

Ürün üç kullanım yüzeyi sunar:

- Web: Modern tarayıcıdan, merkezi sunucuya bağlanan React/Vite SPA
- Masaüstü: Aynı arayüzü Windows, macOS ve Linux üzerinde çalıştıran Tauri 2 kabuğu
- API ve gerçek zamanlı servisler: Kurumsal entegrasyonların ve istemcilerin kullandığı sunucu katmanı

## 1.1 Çözdüğü temel problemler

- Gereksinimlerin dağınık ofis dokümanlarında kaybolmasını önler.
- Gereksinim-test ilişkisinin çift yönlü ve sorgulanabilir olmasını sağlar.
- Bir değişikliğin hangi testleri veya gereksinimleri etkilediğini şüpheli bağlantılarla görünür kılar.
- Başlık ve alt başlıklarla uzun dokümanları hiyerarşik olarak düzenler.
- Yapılandırılabilir alanlarla farklı ekip süreçlerini aynı platformda destekler.
- Test yürütmelerini ve geçmiş sonuçları test tanımlarından ayırır.
- Gözden geçirme, değişiklik önerisi, yorum, ek ve bildirimleri iş kaydına bağlar.
- XLSX, CSV, PDF, DOCX ve ReqIF üzerinden dış sistemlerle veri alışverişi sağlar.
- Değişikliklerin kim tarafından ve ne zaman yapıldığını denetim kaydında tutar.

## 1.2 Tasarım ilkeleri

- PostgreSQL kalıcı iş verisinin tek otoritesidir.
- Redis yalnızca geçici görevler, presence, pub-sub ve kuyruklar için kullanılır.
- Yapısal alanlarda sessiz “son yazan kazanır” davranışı yoktur; sürüm kontrolü ve HTTP 409 kullanılır.
- Zengin metinde eşzamanlı düzenleme Yjs CRDT ile birleştirilir.
- Silme önce yumuşak silmedir; geri alınamaz fiziksel silme worker tarafından saklama süresi sonunda yapılır.
- Her mutasyon, aynı veritabanı işlemi içinde audit kaydı üretmelidir.
- Yetki istemcinin gönderdiği tenant kimliğine güvenilerek değil, sunucuda çözümlenerek kontrol edilir.
- Web ve masaüstü aynı frontend kodunu paylaşır.
- Ağır yüzeyler tembel yüklenir; sanallaştırma büyük gridlerde DOM büyümesini sınırlar.

# 2. Kavramsal model ve terminoloji

## 2.1 Organizasyon, çalışma alanı ve proje

Organizasyon en üst tenant sınırıdır. Kullanıcı üyelikleri, roller, entegrasyonlar, SSO ayarları ve ortak yönetim politikaları organizasyonla ilişkilidir. Bir kullanıcının başka bir organizasyondaki verilere yalnızca kimlik bilmesi, UUID tahmin etmesi veya URL değiştirmesiyle erişmemesi gerekir.

Çalışma alanı, organizasyon içindeki doküman ve klasörlerin ana çalışma bağlamıdır. Ürün veya program bazlı ayrım için kullanılabilir. Proje ise satırların birden fazla proje bağlamıyla ilişkilendirilmesini sağlar; hiyerarşi veya doküman sahipliğinin yerine geçmez.

## 2.2 Klasör ve doküman

Klasörler yalnızca doküman ağacını düzenler. Dokümanlar üç türden biridir:

| Doküman türü | Amaç | Ana satırlar |
|---|---|---|
| Gereksinim | Sistem/ürün gereksinimlerini yönetmek | Başlık, gereksinim |
| Test | Test tasarımı ve adımlarını yönetmek | Başlık, test senaryosu, test adımı |
| Genel metin | İşbirlikçi serbest biçimli içerik | Tiptap/Yjs zengin metin |

## 2.3 Satır ve detay kayıtları

`DocumentRow` tüm yapılandırılmış doküman satırlarının ortak gövdesidir. Başlık, açıklama, sıra, üst satır, özel alanlar, sürüm ve yumuşak silme bilgisi burada bulunur. Satır türüne özgü alanlar ayrı detay tablolarındadır:

- `RequirementDetail`: gereksinim numarası, durum, öncelik ve gerekçe
- `TestCaseDetail`: test senaryosu durumu, öncelik, atanan kullanıcı ve etiketler
- `TestStepDetail`: test adımı, beklenen sonuç ve test sonucu

Bu ayrım, gereksinime ait olmayan bir satıra gereksinim alanı yazılması gibi veri tutarsızlıklarını azaltır.

## 2.4 Kimlik, görüntüleme numarası ve gereksinim numarası

Her satırın değişmeyen UUID kimliği vardır. Gridde görülen `ID` veya hiyerarşik görüntüleme numarası ise satırın mevcut sırasından türetilir: `1`, `1.1`, `1.1.1` gibi. Taşıma yapıldığında görüntüleme numarası değişebilir; kalıcı bağlantılar UUID üzerinden korunur.

Gereksinim numarası ayrı bir iş alanıdır ve örneğin `REQ-0012` olabilir. Gereksinim numarası kullanıcıların şartname ve denetim süreçlerinde takip ettiği tanımlayıcıdır. Kalıcı teknik kimlik yerine geçmez. Kalite kuralları boş veya yinelenen gereksinim numaralarını raporlar.

## 2.5 Bağlantılar ve izlenebilirlik

`RequirementLink` iki satır arasında yönlü ilişki tutar. Desteklenen ilişki türleri doğrulama, ilişkili olma, türetme ve yineleme anlamlarını taşır. Bir test adımı birden fazla gereksinime; bir gereksinim birden fazla test veya başka gereksinime bağlanabilir.

Bağlantılı satır, ana doküman değiştirilmeden sağ detay panelinde açılabilir. Gridin bağlantı projeksiyonu bağlı gereksinimlerin numarası, başlığı veya açıklaması gibi alanları tek hücrede gösterebilir. Birden fazla değer seçilen ayırıcıyla ve belirlenen sıralamayla sunulur.

## 2.6 Baseline, revision ve suspect link

Baseline, dokümanın belirli andaki yapısal satır özetini `DocumentRevision` içinde saklar. Sonraki durumla karşılaştırıldığında eklenen, kaldırılan ve değiştirilen satırlar raporlanır.

Bağlı bir satır değiştirildiğinde ilgili bağlantılar şüpheli olarak işaretlenir. Bu, bağlantının yanlış olduğu anlamına gelmez; gözden geçirilmesi gerektiğini gösterir. Yetkili kullanıcı bağlantıyı inceleyip şüpheyi onaylayarak kapatır.

# 3. Sistem bağlamı ve yüksek seviyeli mimari

[DIAGRAM:system_context]

DocSys bir TypeScript monoreposudur. Sunucu tarafı modüler monolith API, bağımsız collaboration servisi, bağımsız worker ve kalıcı veri servislerinden oluşur. Web istemcisi Nginx üzerinden statik SPA olarak dağıtılır. Masaüstü istemcisi aynı SPA build'ini Tauri WebView içinde paketler.

## 3.1 Bileşenler

| Bileşen | Teknoloji | Sorumluluk |
|---|---|---|
| Web | React 18, Vite 6, TanStack Query/Virtual, Zustand | Kullanıcı arayüzü, grid, ağaç, dialoglar, istemci önbelleği |
| Desktop | Tauri 2, Rust | İşletim sistemi paketi, güncelleme, sunucu seçimi |
| API | NestJS 11, Fastify, Prisma | Kimlik, yetki, tenant, satırlar, raporlar, yaşam döngüsü ve dosya iş akışları |
| Collaboration | Hocuspocus, Yjs | Zengin metin CRDT odaları, kimlik doğrulama ve snapshot kalıcılığı |
| Worker | BullMQ | Dışa aktarım, çöp temizliği ve snapshot sıkıştırma |
| PostgreSQL | PostgreSQL 16 | Tüm kalıcı iş verisi, audit ve snapshot'lar |
| Redis | Redis 7 | Kuyruk, pub-sub, presence, idempotency ve geçici koordinasyon |
| Object storage | MinIO/S3 | Ekler, şablonlar ve dışa aktarım dosyaları |

## 3.2 Monorepo yapısı

```text
apps/api             NestJS/Fastify API
apps/collaboration   Hocuspocus gerçek zamanlı servis
apps/worker          BullMQ işleyici
apps/web             React/Vite web arayüzü
apps/desktop         Tauri masaüstü kabuğu
packages/database    Prisma şeması ve istemci paketi
packages/config      Paylaşılan ortam doğrulaması
tests/e2e            Playwright iş akışları
tests/performance    Collaboration ve büyük doküman benchmark'ları
infra/docker         Container ve Compose tanımları
infra/scripts        Geliştirme, seed ve kalite scriptleri
docs                 ADR, mimari, işletim ve bu kılavuz
```

pnpm workspace paket çözümlemesini, Turborepo ise build/typecheck/test bağımlılık grafiğini yönetir. `packages/database` derlenmeden onu kullanan uygulamalar typecheck edilmez.

## 3.3 Ağ ve portlar

| Servis | Varsayılan port | Protokol |
|---|---:|---|
| Web | 5173 geliştirme / 80 Compose | HTTP/HTTPS |
| API | 3001 | HTTP/HTTPS ve `/ws/events` WebSocket |
| Collaboration | 3002 | WebSocket, sağlık için HTTP |
| Worker health | 3003 | HTTP |
| PostgreSQL | 5432 | PostgreSQL |
| Redis | 6379 | Redis |
| MinIO API | 9000 | S3 uyumlu HTTP |
| MinIO Console | 9001 | HTTP |

Üretimde TLS genellikle ters proxy veya ingress katmanında sonlandırılır. Web için `https`, olay ve collaboration bağlantıları için `wss` kullanılmalıdır.

# 4. Uçtan uca istek ve veri akışları

## 4.1 Web giriş akışı

[DIAGRAM:login_flow]

1. Kullanıcı e-posta veya yerel kullanıcı adını ve parolasını girer.
2. Web istemcisi `POST /auth/login` çağrısı yapar.
3. API kullanıcı adında `@` yoksa `@docsys.local` ekleyerek yerel hesabı çözümler.
4. Parola bcrypt ile doğrulanır.
5. API 12 saatlik JWT üretir ve web için HTTP-only, SameSite=strict session cookie yazar.
6. İstemci `/auth/me`, organizasyon ve çalışma alanı uçlarını çağırır.
7. Cookie tabanlı mutasyonlarda cross-site istekler CSRF origin/fetch-metadata korumasıyla reddedilir.

## 4.2 Masaüstü giriş akışı

1. Kullanıcı isteğe bağlı sunucu adresi girer. Boşsa build varsayılanı olan API adresi kullanılır.
2. İstemci `GET /auth/client-config` ile collaboration adresini keşfeder.
3. Login yanıtındaki token session storage içinde, yalnızca o uygulama oturumu boyunca tutulur.
4. Sonraki API çağrıları `Authorization: Bearer` başlığı kullanır.
5. Masaüstü shell kapanınca kalıcı local storage'da token bırakılmaz; sunucu adresi sonraki kullanım için saklanabilir.

## 4.3 Yapısal satır güncelleme akışı

1. Grid satırı kullanıcı tarafından düzenlenir.
2. İstemci geçici olarak yeni değeri gösterir.
3. `PATCH /rows/:rowId` isteği mevcut `version` ile gönderilir.
4. API erişimi, alan tipini ve sürümü doğrular.
5. Aynı transaction içinde satır güncellenir, sürüm artırılır, bağlantılar gerekiyorsa şüpheli yapılır ve audit olayı yazılır.
6. Başka kullanıcı arada değiştirmişse API 409 ile güncel satırı döndürür.
7. İstemci iyimser değişikliği geri alır, güncel veriyi yükler ve çakışma bildirimi gösterir.

## 4.4 Zengin metin işbirliği akışı

1. Genel metin dokümanı açıldığında web istemcisi API'den kısa ömürlü collaboration token alır.
2. Hocuspocus odasına doküman kimliğiyle bağlanır.
3. Collaboration servisi JWT'yi ve `document.read` yetkisini doğrular.
4. Tiptap işlemleri Yjs güncellemelerine dönüşür ve bağlı istemcilere dağıtılır.
5. Güncel Yjs durumu debounce sonrası PostgreSQL'e tam snapshot olarak yazılır.
6. Worker eski snapshot'ları sıkıştırır ve son beş kaydı korur.

## 4.5 Dışa aktarım akışı

1. Kullanıcı format seçer ve API export job oluşturur.
2. API BullMQ kuyruğuna görev bırakır.
3. Worker doküman outline'ını ve alanlarını okur.
4. CSV, XLSX, PDF, DOCX veya ReqIF içeriğini oluşturur.
5. Dosya MinIO/S3'e yüklenir; job ilerlemesi ve durumu PostgreSQL'de güncellenir.
6. Web durumu poll eder, tamamlanınca kısa süreli indirme URL'si alır.

# 5. Backend mimarisi

## 5.1 Modüler monolith yaklaşımı

API tek deploy edilebilir NestJS uygulamasıdır ancak iş alanları modüllere ayrılmıştır. Bu yapı küçük operasyonel yüzey ve atomik transaction kolaylığı sağlarken modüllerin sorumluluk sınırlarını korur. Modül içi servisler veri erişimini Prisma üzerinden yapar; controller'lar HTTP doğrulama ve kullanıcı bağlamını servislere taşır.

Ana modüller:

- `auth`: kayıt, login, JWT, SSO başlangıç/callback ve kullanıcı profili
- `access`: rol/izin çözümleme ve tenant sınırı
- `tenancy`: organizasyon, çalışma alanı, üyelik ve proje
- `tree`: klasör/doküman ağacı, taşıma, silme ve geri alma
- `rows`: satır CRUD, hiyerarşi, özel alan, bağlantı ve analizler
- `events`: WebSocket olayları, Redis pub-sub ve presence
- `exports`: import/export job ve şablon kayıtları
- `baselines`: revision snapshot ve diff
- `lifecycle`: görünüm, arama, kalite, yorum, ek, yürütme, review, öneri, konfigürasyon, ACL, entegrasyon ve SSO ayarı
- `performance`: Prometheus ve Web Vitals toplama
- `health`: liveness ve readiness
- `audit`, `storage`, `prisma`: ortak altyapı modülleri

## 5.2 HTTP doğrulama

Giriş gövdeleri Zod şemalarıyla doğrulanır. Hatalı tip, eksik alan veya izin verilmeyen enum değeri iş servisine ulaşmadan reddedilir. Prisma şeması kalıcı veri kısıtlarını, Zod ise API sözleşmesinin çalışma zamanı doğrulamasını sağlar.

Swagger arayüzü uygulama çalışırken `/api/docs` yolunda sunulur. Zod gerçek sözleşme kaynağı olduğundan Swagger şemalarının bazıları controller imzalarından daha yüzeysel olabilir; dış entegrasyon geliştirirken örnek isteği çalışan endpoint ve testlerle doğrulamak gerekir.

## 5.3 Kimlik doğrulama ve session

JWT payload'ı kullanıcı UUID'si ve e-posta taşır. `AuthGuard` önce session cookie'yi, yoksa Bearer token'ı okur. Public olarak işaretlenmeyen bütün endpoint'ler geçerli token ister. Parolalar düz metin tutulmaz; bcrypt hash saklanır.

Browser cookie'si HTTP-only, SameSite=strict ve üretim ayarına göre Secure'dür. Mutasyonlarda cookie kullanılıyorsa `CsrfGuard` cross-site Fetch Metadata veya izin verilmeyen Origin değerini reddeder. Bearer kullanan masaüstü ve otomasyon istemcileri CSRF saldırı modelinin dışında tutulur.

## 5.4 Yetkilendirme

Roller sistem veya organizasyon kapsamında olabilir. Rol-permission ilişkisi ayrı tablolarda tutulur; kullanıcıya organizasyon, çalışma alanı veya proje scope'unda rol atanabilir. Servisler erişim kontrolünden önce kaynak varlığı veritabanından çözümler ve varlığın gerçek `organizationId`, `workspaceId` veya `projectId` değerleriyle izin ister.

Satır bazlı ek paylaşım `RowAccessGrant` ile yapılabilir. Bu kayıt temel tenant sınırını gevşetmez; yalnızca ilgili satır için izin seviyesini tanımlar.

## 5.5 Transaction ve audit

İş verisini değiştiren servis işlemleri `$transaction` içinde yürütülür. Audit olayı aynı transaction'a dahil edilir; mutasyon commit olup audit'in kaybolması veya audit yazılıp iş verisinin rollback olması engellenir. Audit olayları organizasyon, aktör, eylem, varlık türü/kimliği ve önce/sonra bağlamını taşır.

## 5.6 İdempotency

Tekrarlanan ağ çağrılarında aynı satırın iki kez oluşturulmasını önlemek için oluşturma gibi uygun endpoint'ler `Idempotency-Key` kabul eder. İstemci yeni işlem için UUID üretir. Aynı anahtarın tekrarında önceki sonuç döndürülür veya işlem yinelenmez.

# 6. Veri mimarisi

## 6.1 PostgreSQL neden otoritedir?

Gereksinim ve test verisi denetlenebilir, yedeklenebilir ve transaction güvenliğine sahip olmalıdır. PostgreSQL ilişkisel kısıtlar, JSONB özel alanlar, güçlü index'ler ve eşzamanlılık özellikleri sağlar. Redis'te kalıcı tek kopya tutulmaması, kuyruk veya cache kaybının iş verisini yok etmesini önler.

## 6.2 Şema grupları

| Grup | Başlıca tablolar |
|---|---|
| Kimlik ve tenant | User, Organization, OrganizationMember, Workspace, WorkspaceMember |
| Yetki | Role, Permission, RolePermission, MemberRole, RowAccessGrant |
| Yapı | Project, ProjectMember, Folder, Document, DocumentTemplate |
| Satır | DocumentRow, RequirementDetail, TestCaseDetail, TestStepDetail |
| İzlenebilirlik | RequirementLink, RowProject |
| Alan ve dosya | CustomFieldDefinition, Attachment, ExportTemplate, ExportJob |
| Denetim/sürüm | AuditEvent, DocumentRevision, LegalHold |
| Collaboration | CollaborationSnapshot, CollaborationUpdate |
| Ekip çalışması | Notification, SavedView, RowComment, Review, ReviewDecision, ChangeProposal |
| Test | TestExecution, TestStepExecution |
| Varyant/entegrasyon | ProductConfiguration, ConfigurationItem, IntegrationEndpoint |

## 6.3 Hiyerarşi saklama

Satır hiyerarşisi üç bilgiyi birlikte kullanır:

- `parentId`: doğrudan üst satır
- `ancestorPath`: ataları hızlı prefix sorgusu için saklayan yol
- `rank`: kardeşler arasındaki LexoRank benzeri sıralama anahtarı

Taşıma sırasında doküman başına PostgreSQL advisory lock alınır. Hedefin taşınan satırın kendi alt ağacı olmadığı kontrol edilir. Alt ağacın `ancestorPath` değerleri toplu ve transaction içinde güncellenir. Bu sayede döngü oluşmaz ve iki eşzamanlı taşıma birbirinin yapısını bozmaz.

Görüntüleme numarası saklanmaz. Outline okunurken derinlik ve kardeş sırasına göre hesaplanır. Bu tercih, yukarıya yeni satır eklendiğinde binlerce kaydı yeniden numaralandırma ihtiyacını ortadan kaldırır.

## 6.4 Özel alanlar

`CustomFieldDefinition` doküman kapsamında alan anahtarı, görünen adı, tipi, izin verilen değerleri ve sırasını tutar. Satır değerleri `DocumentRow.customFields` JSONB alanındadır. Yazma sırasında tanıma göre doğrulanır.

Desteklenen tipler: kısa/uzun metin, tam sayı, ondalık, boolean, tarih, tarih-saat, tek seçim, çoklu seçim, kullanıcı, proje ve URL. Çoklu seçim hücresine tıklandığında tanımda verilen seçenekler listelenir; kullanıcı birden fazlasını seçebilir.

## 6.5 Silme, geri alma ve purge

Kullanıcı işlemleri `deletedAt` alanını doldurarak yumuşak siler. Silinen klasör, doküman ve satırlar çöp kutusunda görünür ve saklama süresi içinde geri alınabilir. Worker varsayılan 30 gün sonunda, legal hold altında olmayan kayıtları çocuklardan ebeveyne doğru partiler halinde fiziksel olarak siler. Böylece FK kısıtları korunur.

## 6.6 Migration yönetimi

Prisma migration'ları `packages/database/prisma/migrations` altında değişmez geçmiş olarak tutulur. Geliştirmede `migrate:dev`, üretimde yalnızca `migrate:deploy` kullanılır. Full Compose, API başlamadan önce tek seferlik migrate servisini çalıştırır ve başarılı olmasını bekler.

# 7. Eşzamanlılık ve gerçek zamanlı çalışma

## 7.1 Yapısal veri

Her satır ve ana yapı kaydı `version` taşır. İstemci okuduğu sürümü güncellemede gönderir. Sunucu veritabanındaki sürüm farklıysa 409 döndürür. Kullanıcıya güncel sürüm yüklenir; çakışma sessizce ezilmez.

## 7.2 Zengin metin

Genel dokümanlar Yjs CRDT kullanır. Her karakter değişikliği klasik REST PATCH olarak yazılmaz. Yjs işlemleri farklı kullanıcılardan gelse bile deterministik biçimde birleşir. Cursor/presence bilgisi kalıcı iş verisi değildir.

## 7.3 Alan olayları ve presence

Yapısal mutasyonlardan sonra API olay yayınlar. Redis pub-sub birden fazla API instance'ı arasında olayı taşır. WebSocket istemcileri ilgili doküman odasına katılır; TanStack Query önbelleği gelen olaya göre tazelenir. Presence listesi çevrimiçi kullanıcı avatarlarını gösterir ve Redis'te geçici tutulur.

## 7.4 Tutarlılık sınırları

- REST transaction'ı: yapısal değişiklik + audit + suspect link
- Yjs transaction'ı: zengin metin operasyonlarının CRDT birleşimi
- Export job: eventual consistency; kullanıcı job durumunu bekler
- Notification/presence: gecikmeli veya geçici olabilir, iş verisinin doğruluğunu belirlemez

# 8. Frontend mimarisi

## 8.1 Uygulama kabuğu

React Router `/login` ve ana shell route'larını yönetir. TanStack Query sunucu durumunu, Zustand ise tema, layout, seçim, kolon ve toast gibi istemci durumunu yönetir. Ağır ekranlar `lazy` ve `Suspense` ile sonradan yüklenir.

Ana shell şu bölgelerden oluşur:

- Üst menü çubuğu
- Ana navigasyon: Dokümanlar, Çöp kutusu, Ayarlar
- Klasör/doküman ağacı
- Yeniden boyutlandırılabilir ana çalışma alanı
- Gerektiğinde açılan yeniden boyutlandırılabilir detay/bağlantı paneli
- Presence ve genel arama alanı

## 8.2 Sanallaştırılmış grid

TanStack Virtual yalnızca görünür satırları DOM'da tutar. Satır yüksekliği içeriğin sarılmasına göre ölçülür. Grid kolonları doküman türü, özel alan tanımları, kullanıcı görünürlük tercihi ve bağlantı projeksiyonundan üretilir.

İlk ID kolonu hiyerarşik numarayı ve seçim kutusunu taşır. Gereksinim dokümanının ana kolonları gereksinim numarası ve gereksinim metnidir. Test dokümanında test adımı, beklenen sonuç, test sonucu ve sağdaki açıklama gibi alana özgü kolonlar gösterilir. “Tür” ve “Durum” sabit varsayılan kolonlar olarak kullanılmaz.

## 8.3 Seçim ve toplu işlemler

Tek satır tıklama ile etkin olur. Seçim kutuları birden fazla satır seçer; üst seçim kutusu görünür satırların tümünü seçer. Seçim araç çubuğu seçili sayıyı, temizleme, toplu işlem ve silme eylemlerini gösterir.

Toplu düzenleme ortak alanı değiştirir. Toplu taşıma yeni üst satırı, toplu kopyalama hedef dokümanı, toplu bağlama hedef satırı kullanır. Silme, seçili satırların alt ağaçlarıyla birlikte çöp kutusuna alınacağını açıkça bildirir.

## 8.4 Drag-and-drop ve hiyerarşi

Satırlar sürüklenerek aynı doküman içinde yeniden sıralanabilir veya başka bir başlık altına taşınabilir. Sunucu döngü kontrolü ve advisory lock uygular. Menüdeki “İçeri al” ve “Dışarı al” eylemleri klavye/menü alternatifi sağlar.

## 8.5 Hata yönetimi

- 401: login sayfasına yönlendirme
- 409: iyimser değişikliği geri alma ve çakışma bildirimi
- Ağ/sunucu hatası: toast bildirimi
- Eski deploy sonrası chunk bulunamaması: güvenli yeniden yükleme sınırı
- Masaüstü sunucu hatası: sunucuya ulaşılamadı veya login geçersiz mesajı

## 8.6 Erişilebilirlik

Ana içerik geçiş bağlantısı, semantik `main`, `nav`, `aside` ve `section` bölgeleri vardır. Form kontrolleri label ile ilişkilidir. Panel ayırıcıları ARIA değerlerini bildirir. Odak göstergeleri korunur. Playwright axe testi login ve ana çalışma alanını WCAG A/AA otomatik kurallarıyla tarar.

Otomatik test ekran okuyucu deneyiminin tamamını kanıtlamaz. Büyük sürümlerde klavye-only kullanım, yüzde 200 yakınlaştırma, VoiceOver/NVDA ve yüksek kontrast manuel kabul testi yapılmalıdır.

# 9. Güvenlik mimarisi

## 9.1 Tehdit sınırları

Web tarayıcısı, masaüstü WebView, API, collaboration servisi, worker, veritabanı, Redis ve S3 ayrı güven sınırlarıdır. İstemciden gelen tenant, satır, dosya ve yetki bilgisi doğrulanmadan güvenilir sayılmaz.

## 9.2 Uygulanan kontroller

- bcrypt parola hash'i
- 12 saatlik imzalı JWT
- HTTP-only, SameSite=strict ve üretimde Secure cookie
- Bearer token'ı session storage'da tutan masaüstü akışı
- Cookie mutasyonlarında Origin ve Fetch Metadata CSRF kontrolü
- Fastify rate limit: varsayılan dakikada 600 istek
- Helmet güvenlik başlıkları
- CORS allow-list ve Tauri origin'leri
- Loglarda cookie ve Authorization redaksiyonu
- Tenant ve permission kontrolü
- Satır bazlı grant modeli
- Object storage için presigned URL
- Yumuşak silme, legal hold ve audit
- Nginx CSP, frame kısıtı, MIME ve cache başlıkları
- Tauri CSP ve updater imzası

## 9.3 Secret yönetimi

Gerçek secret'lar git'e yazılmaz. `.env` ignore edilir; `.env.example` yalnızca anahtar adlarını ve güvenli olmayan yerel örnekleri içerir. Üretimde JWT, veritabanı, S3, OIDC, metrics ve updater anahtarları secret manager veya CI secret deposundan enjekte edilmelidir.

## 9.4 Üretim sertifikaları

Tauri updater anahtarı paketin DocSys tarafından yayımlandığını doğrular; işletim sistemi kod imzasının yerine geçmez. macOS için Developer ID imzası ve notarization, Windows için güvenilir code-signing sertifikası gerekir. Linux paketleri dağıtım kanalına göre repository imzasıyla sunulmalıdır.

## 9.5 Güvenlikte kalan kurumsal derinlik

Mevcut sistem OIDC/PKCE destekler. SCIM kullanıcı provizyonu ve SAML henüz yoktur. Attachment kaydı ve S3 yükleme vardır ancak antivirüs/CDR tarama hattı eklenmelidir. Genel entegrasyon URL ve yapılandırma kaydeder; secret vault ve outbound retry mekanizması henüz sağlayıcı seviyesinde uygulanmamıştır.

# 10. Masaüstü mimarisi

## 10.1 Neden Tauri?

Tauri, React build'ini her işletim sisteminin webview'i içinde çalıştırır. Electron gibi ayrı Chromium paketi taşımadığı için uygulama ve bellek ayak izi küçüktür. Rust kabuğu yalnızca masaüstü yeteneklerini ve updater'ı sağlar; iş kuralları frontend/API katmanında kalır.

## 10.2 Sunucu seçimi

Masaüstü login ekranındaki sunucu alanı API kök adresidir. Örnek: `https://docsys-api.sirket.local`. Alan boşsa `VITE_API_URL` build değeri, o da yoksa `http://localhost:3001` kullanılır.

API'nin `COLLAB_PUBLIC_URL` değeri dış istemcinin ulaşabileceği `ws://` veya `wss://` adresi olmalıdır. Container içindeki `ws://collaboration:3002` adresi masaüstü istemciye gönderilmemelidir.

## 10.3 Güncelleme

Uygulama açılışta Tauri updater endpoint'ini denetler. Yeni sürüm bulunursa sağ altta sürüm bilgisi ve iki seçenek gösterilir: daha sonra veya yükle ve yeniden başlat. İndirme updater imzasıyla doğrulanır.

## 10.4 SSO sınırı

Browser SSO redirect/cookie akışı masaüstünde henüz deep-link callback ile bağlanmamıştır; bu nedenle masaüstü login ekranında SSO gizlidir. Masaüstü için yerel kullanıcı/parola çalışır. Kurumsal masaüstü SSO gerekiyorsa özel URL scheme, PKCE verifier saklama ve callback allow-list'i içeren ayrı tasarım yapılmalıdır.

# 11. Worker, kuyruk ve nesne depolama

## 11.1 BullMQ

Redis tabanlı BullMQ uzun süren işleri HTTP isteğinden ayırır. API işi oluşturup hemen job kimliği döndürür. Worker başarısızlığı API'yi düşürmez; job durumu hata olarak kaydedilir.

## 11.2 Export worker

Worker format üreticisini çağırır, ilerlemeyi günceller, sonucu object storage'a yükler ve `ExportJob` durumunu tamamlandı yapar. DOCX şablonlu export için `ExportTemplate` metadata'sı ve object key kullanılabilir.

## 11.3 Purge ve snapshot compaction

Zamanlanmış yaşam döngüsü işi saklama süresi dolan, legal hold kapsamında olmayan yumuşak silinmiş kayıtları küçük partiler halinde temizler. Snapshot compaction doküman başına son beş collaboration snapshot'ını korur. İşler idempotent tasarlanmıştır; yeniden başlatma güvenlidir.

## 11.4 MinIO/S3

Ek ve export binary'leri PostgreSQL bytea içinde tutulmaz. Veritabanı nesne anahtarı, dosya adı, mime tipi, boyut ve sahiplik metadata'sını saklar. İndirme yetki kontrolünden sonra presigned URL ile yapılır.

# 12. Başlangıç: uygulamaya giriş

## 12.1 Web üzerinden

1. Yöneticinizin verdiği DocSys web adresini açın.
2. “Kullanıcı adı veya e-posta” alanına tam e-postanızı yazın.
3. Yerel hesabınız `@docsys.local` ile bitiyorsa yalnızca kullanıcı adını da yazabilirsiniz.
4. Parolanızı girip “Giriş yap” düğmesine basın.
5. Kurumunuz OIDC yapılandırdıysa web login ekranındaki organizasyon kısa adıyla SSO'yu başlatabilirsiniz.

## 12.2 Masaüstünden

1. DocSys uygulamasını açın.
2. Şirket kurulumunda yöneticinizin verdiği API adresini “Sunucu adresi” alanına yazın.
3. Yerel geliştirmede varsayılan adres kullanılacaksa alanı boş bırakın.
4. Kullanıcı adı/e-posta ve parolayı girin.
5. Sunucuya ulaşılamazsa adresin `http://` veya `https://` ile başladığını ve VPN/ağ bağlantısını kontrol edin.

## 12.3 İlk organizasyon kurulumu

Hesap hiçbir organizasyona bağlı değilse uygulama organizasyon ve çalışma alanı adı isteyen başlangıç formunu gösterir. Bu işlem ilk yönetim bağlamını oluşturur. Üretimde kayıt endpoint'inin herkese açık bırakılıp bırakılmayacağı kurum politikasıyla ayrıca sınırlandırılmalıdır.

# 13. Ana ekranı tanıma

Üst menüde Dosya, Düzen, Görünüm, Ekle, Sütunlar, Analiz ve Yardım bulunur. Sol ana navigasyon Dokümanlar, Çöp kutusu ve Ayarlar arasında geçiş yapar. Yanındaki panel klasör/doküman ağacıdır. Orta panel grid veya zengin metin editörüdür. Sağ panel seçili satırın detayları veya bağlı kaydın önizlemesidir.

Doküman ağacı ve detay panelinin sınırları sürüklenerek genişletilebilir. Tercihler tarayıcıda saklanır. Üst orta alandaki genel arama `Ctrl+K` veya macOS'ta `Command+K` ile açılır.

# 14. Klasör ve doküman yönetimi

## 14.1 Klasör oluşturma

1. Doküman ağacında boş alana veya hedef klasöre sağ tıklayın.
2. “Yeni klasör” seçin.
3. Uygulama içi dialogda ad yazın ve Oluştur'a basın.

## 14.2 Doküman oluşturma

Sağ tık menüsünden gereksinim, test veya metin dokümanı seçin. Gereksinim ve test dokümanları yapılandırılmış grid; metin dokümanı işbirlikçi zengin metin editörü açar.

## 14.3 Silme ve geri alma

Dokümanı sağ tık menüsünden silmek onu çöp kutusuna taşır. Sol navigasyondan Çöp kutusu açıldığında silinen klasör/doküman ve tarihleri görünür. “Geri getir” ile saklama süresi dolmadan eski konumuna döndürülür.

> Silme anında fiziksel değildir. Varsayılan saklama süresi 30 gündür. Legal hold altındaki kayıt worker purge tarafından silinmez.

# 15. Gereksinim dokümanı kullanımı

## 15.1 Önerilen yapı

Bir gereksinim dokümanında üst düzey başlıklar sistem veya alt sistemleri, alt başlıklar yetenek gruplarını temsil edebilir. Gereksinim satırları ilgili başlık altında tutulur.

Örnek:

```text
1 Kullanıcı Yönetimi
  1.1 Kimlik Doğrulama
    1.1.1 REQ-AUTH-001 Kullanıcı geçerli kimlik bilgileriyle giriş yapabilmelidir.
    1.1.2 REQ-AUTH-002 Beş başarısız denemeden sonra hesap geçici kilitlenmelidir.
  1.2 Yetkilendirme
2 Raporlama
```

## 15.2 Satır ekleme

- Düzen menüsünden Başlık veya Gereksinim ekleyin.
- Satırın bağlam menüsünden alt satır, alt başlık veya kardeş satır ekleyin.
- İçeri al/Dışarı al ile hiyerarşi seviyesini değiştirin.
- Sürükle-bırak ile sıra veya üst başlığı değiştirin.

## 15.3 Ana alanlar

- ID: Hiyerarşiden türetilen satır numarası
- Gereksinim No: Kurumsal takip numarası
- Gereksinim: Gereksinimin normatif metni/başlığı
- Açıklama: Sağdaki açıklayıcı ek içerik
- Özel alanlar: Öncelik, doğrulama yöntemi, alt sistem gibi kullanıcı tanımlı veriler

Gereksinim metni atomik, doğrulanabilir ve belirsiz ifadelerden uzak tutulmalıdır. Rationale veya uzun açıklama detay paneli/ilgili alanda saklanabilir.

## 15.4 Kalite kuralları

Kalite ve dashboard şu sorunları işaretler:

- Gereksinim numarası yok
- Aynı dokümanda yinelenen gereksinim numarası var
- Gereksinim açıklaması/metni boş
- Gereksinim herhangi bir test tarafından doğrulanmıyor

Kalite puanı karar mekanizması değil, temizlik ve kapsama önceliklendirmesidir. Waiver/istisna süreci gerekiyorsa özel alan ve review kaydıyla kurumsal süreç tanımlanmalıdır.

# 16. Test dokümanı kullanımı

## 16.1 Önerilen hiyerarşi

Test dokümanı başlık/alt başlık, test senaryosu ve test adımlarını içerir. Test adımı normalde bir test senaryosunun altındadır.

```text
1 Kimlik Doğrulama Testleri
  1.1 Başarılı Giriş
    1.1.1 Geçerli kullanıcı adı ve parola gir
    1.1.2 Giriş yap düğmesine bas
```

## 16.2 Test senaryosu ve test adımı

Test senaryosu; amaç, ön koşul ve kapsamı temsil eder. Test adımı gerçekleştiren eylemi, beklenen sonucu ve tasarım aşamasında gerekirse test sonucu alanını içerir.

Bir test senaryosu seçiliyken Düzen menüsündeki “Test adımı ekle” etkinleşir. Grid hücreleri içerik uzadıkça satır yüksekliğini artırır.

## 16.3 Gereksinime bağlama

1. Test adımını seçin ve detay panelini açın.
2. Bağlantı ekleme alanında gereksinim numarası, başlık veya doküman adıyla arayın.
3. Hedef gereksinimi seçin ve ilişki türünü belirleyin.
4. Bağlı gereksinim sağ panelde ana doküman değiştirilmeden okunabilir.
5. Bağlı gereksinim numaralarını gridde göstermek için linked-field projection içeren görünüm kullanın.

Bir test adımı birden çok gereksinime bağlanabilir. Aynı gereksinim birden çok test adımıyla doğrulanabilir.

## 16.4 Test sonucu ve yürütme sonucu farkı

Griddeki “Test Sonucu” alanı test tasarım satırının yapılandırılmış alanıdır. Gerçek test yürütmesi ise ayrı `TestExecution` ve `TestStepExecution` kayıtlarında tarihçe olarak saklanır. Tekrarlanan testlerde geçmiş kaybolmaması için operasyonel sonuçlar yürütme modülünden kaydedilmelidir.

# 17. Grid verimlilik özellikleri

## 17.1 Arama ve sıralama

Grid araması gereksinim, test, bağlantılı kayıt ve özel alan metinlerini filtreler. En az iki karakterle çalışma alanı genel araması yapılabilir. Kolon seçilerek artan/azalan sıralama uygulanır; boş seçim hiyerarşi sırasına döner.

## 17.2 Sabit kolonlar

Üretkenlik çubuğundaki “Sabit” seçimi ilk kaç kolonun yatay kaydırmada yerinde kalacağını belirler. Büyük dokümanlarda ID ve gereksinim numarasını sabitlemek önerilir.

## 17.3 Kolon görünürlüğü

Sütunlar menüsünde işaretli alanlar görünür. Açıklama kolonunu en sağda tutmak, gereksinim/testin ana alanlarını ekranın merkezinde bırakır. Görünürlük tercihi kayıtlı görünümle birlikte takım veya kişisel seviyede saklanabilir.

## 17.4 Kayıtlı görünümler

Bir görünüm filtreleri, sıralamayı, görünür kolonları, sabit kolonları ve bağlantı projeksiyonunu saklar. Kişisel görünüm yalnızca sahibine, takım görünümü yetkili ekip üyelerine yöneliktir.

Önerilen görünümler:

- Kapsanmayan gereksinimler
- Şüpheli bağlantılar
- Alt sistem bazlı gereksinim görünümü
- Test tasarım özeti
- Yürütmeye hazır olmayan testler
- Review bekleyen değişiklikler

## 17.5 Çoklu seçim

Satır seçim kutularıyla bağımsız satırlar seçilebilir. Tümünü seç kontrolü mevcut filtredeki görünür satırları işaretler. İşlem öncesi seçim sayısını kontrol edin; alt ağaç silme ve taşıma çocuk satırları da etkileyebilir.

# 18. Özel kolonlar ve çoklu seçim

## 18.1 Kolon oluşturma

1. Ekle > Sütun ekle seçin.
2. Görünen adı girin.
3. Alan tipini seçin.
4. Tek/çoklu seçim için seçenekleri her satıra bir değer veya virgülle ayrılmış biçimde girin.
5. Kaydedin; yeni alan doküman kolonlarına eklenir.

Alan anahtarı görünen addan ve zamandan güvenli şekilde üretilir. Aynı ada sahip iki kolon teknik olarak farklı anahtar alır.

## 18.2 Multi-select kullanımı

Multi-select hücresine tıklandığında tanımdaki seçenekler açılır. Kullanıcı birden fazla değeri işaretleyebilir; serbest metinle tekrar yazmak zorunda değildir. Allowed-values değiştirme yönetim ekranı şu an sınırlıdır; üretimde alan şeması değişiklikleri audit ve migration politikasıyla yapılmalıdır.

## 18.3 Alan tasarımı önerileri

- Filtrelenecek sınırlı sözlük için single/multi-select kullanın.
- Açıklayıcı paragraf için long text kullanın.
- Tarih ve sayıyı metin olarak saklamayın.
- Aynı anlamı taşıyan iki kolon açmayın.
- Alanı silmeden önce export ve kayıtlı görünüm bağımlılıklarını değerlendirin.

# 19. İzlenebilirlik ve analiz

## 19.1 Bağlantı göstergeleri

Link sayısı veya bağlı gereksinim projeksiyonu, satırın bağlantılı olduğunu gridde belli eder. Detay paneli gelen ve giden bağlantıları ayrı bağlamda gösterir.

## 19.2 Kapsam raporu

Analiz > Kapsam raporu toplam, kapsanan ve kapsanmayan gereksinim sayılarını gösterir. Kapsanmayan liste test tasarımı backlog'unun girdisidir.

## 19.3 İzlenebilirlik matrisi

Matris her gereksinimi ve ona bağlı öğeleri satır bazında gösterir. Bağlantısız gereksinimler ve şüpheli linkler görsel olarak ayırt edilir. Matris, resmi teslim öncesi çift yönlü kapsama kontrolünde kullanılmalıdır.

## 19.4 Şüpheli bağlantılar

Bağlı kaynak veya hedef satır değişince bağlantı şüpheli olur. Kullanıcı yeni içeriği değerlendirir; test hâlâ geçerliyse “Onayla”, değilse test/gereksinim ve bağlantıyı günceller.

## 19.5 Baseline ve fark

Dosya > Baseline'lar altında etiket vererek resmi doküman sürümünü oluşturun. Daha sonra baseline farkı eklenen, kaldırılan ve değiştirilen satırları gösterir. Baseline, kaynak kontrol commit'i değildir; onaylanmış iş seviyesi doküman anlık görüntüsüdür.

# 20. İşbirliği ve yaşam döngüsü

## 20.1 Yorumlar ve mention

Satır detayında yorum yazılabilir. `@eposta` biçimindeki mention ilgili kullanıcı için notification üretir. Yorum çözümlendiğinde geçmiş korunur ancak açık iş listesinden ayrılabilir.

## 20.2 Ekler

Satıra dosya eklenebilir; metadata PostgreSQL'de, binary MinIO/S3'te tutulur. İndirme bağlantısı erişim kontrolünden sonra üretilir. Hassas dosyalarda kurumun malware scanning ve data-loss-prevention politikası ayrıca uygulanmalıdır.

## 20.3 Bildirimler

Üst çubuktaki bildirim merkezi okunmamış mention ve ilgili yaşam döngüsü olaylarını gösterir. Bildirim “okundu” yapılabilir. E-posta veya mobil push dağıtımı mevcut çekirdeğin parçası değildir.

## 20.4 Test yürütmeleri

Test senaryosu detayında yeni yürütme başlatın. Ortam, build referansı ve iterasyon gibi bağlamı girin. Her adım için başarılı, başarısız, engellendi, atlandı veya çalıştırılmadı durumunu ve gerçek sonucu kaydedin. Sonunda yürütmeyi tamamlayın. Yeni yürütme eskisini ezmez.

## 20.5 Review

Analiz > Gözden geçirmeler alanında başlık vererek review başlatın. Reviewer'lar onay, değişiklik isteği veya ret kararı verebilir. Baseline ile birlikte kullanıldığında review kapsamı daha net olur.

## 20.6 Değişiklik önerisi

Doğrudan düzenleme yetkisi olmayan veya kontrollü süreç kullanan ekip, satır detayından değişiklik önerisi oluşturabilir. Öneri kabul veya reddedilir; kayıt karar geçmişini korur. Otomatik merge semantiği sınırlıdır; karmaşık alan farkları karar veren tarafından değerlendirilmelidir.

## 20.7 Konfigürasyon ve varyant

Ayarlar > Konfigürasyonlar altında stream, baseline veya variant türünde konfigürasyon kaydı oluşturulabilir. Mevcut model satır sürümleri ve kuralları snapshot'lar. Tam ürün ailesi effectivity, üç yönlü merge ve rebase davranışları gelecekte derinleştirilmelidir.

# 21. İçe ve dışa aktarım

## 21.1 Desteklenen biçimler

| İşlem | CSV | XLSX | DOCX | PDF | ReqIF |
|---|---:|---:|---:|---:|---:|
| İçe aktarım | Evet | Evet | Hayır | Hayır | Evet |
| Dışa aktarım | Evet | Evet | Evet | Evet | Evet |

## 21.2 CSV/XLSX içe aktarım

Dosya > İçe aktar menüsünden dosyayı seçin. İçe aktarım yeni satırları dokümanın hiyerarşisine dönüştürür. Büyük/önemli içe aktarımdan önce boş test dokümanında kolon eşleşmesini doğrulayın ve mevcut dokümanın baseline/export yedeğini alın.

## 21.3 ReqIF

ReqIF gereksinim alışverişi için XML tabanlı standarttır. Mevcut destek temel specification object ve alanları taşıyan çalışan bir dikey dilimdir. Üçüncü taraf araçların bütün datatype varyantları, nested specification yapıları ve cross-document reference'ları için round-trip uyumluluk testi yapılmalıdır.

## 21.4 DOCX şablonları

API organizasyon seviyesinde export template kaydı destekler; worker docxtemplater ile şablon işleyebilir. Son kullanıcı için tam şablon yükleme/seçme ekranı sınırlıdır. Resmi kurum şablonları devreye alınırken placeholder sözleşmesi ve örnek export regression testi tanımlanmalıdır.

# 22. Yönetim ve ayarlar

## 22.1 Konfigürasyonlar

Çalışma alanı ayarlarında konfigürasyon adı ve türü seçilerek kayıt açılır. Bu alan ürün varyantı veya kontrollü baseline bağlamı için kullanılabilir.

## 22.2 Entegrasyonlar

Entegrasyonlar sekmesinde webhook adı ve URL'si kaydedilebilir. Bu kayıt entegrasyon registry'sidir. Gerçek outbound dispatch, retry/dead-letter, imzalı payload ve sağlayıcı secret'ı mevcut çekirdekte tamamlanmış değildir.

## 22.3 OIDC SSO

Issuer ve client ID girildiğinde authorization ve token endpoint'leri issuer temelinden yapılandırılır. SSO web login ekranında organizasyon slug'ı üzerinden başlatılır; PKCE ve ID token doğrulaması kullanılır.

Üretimde discovery metadata, issuer sertifika zinciri, redirect URI, client secret politikası ve kullanıcı eşleme kuralları kimlik sağlayıcıyla birlikte test edilmelidir.

## 22.4 Üyeler ve roller

API organizasyona üye ekleme ve role scope atama modeline sahiptir. Yönetim ekranı bütün ince taneli rol/grant operasyonlarını henüz göstermeyebilir; bu işlemler kontrollü admin API veya ileride genişletilecek yönetim arayüzü üzerinden yapılmalıdır.

# 23. Yerel geliştirme kurulumu

## 23.1 Önkoşullar

- Node.js 22 veya üstü
- pnpm 9.15.9
- PostgreSQL 16
- Redis 7
- MinIO/S3
- Masaüstü için Rust stable ve Tauri sistem bağımlılıkları
- E2E için Playwright Chromium

## 23.2 Tek komutla başlatma

```bash
pnpm install
pnpm dev
```

Launcher yerel PostgreSQL/Redis'i algılar; gerekirse Docker servislerini başlatır, migration uygular, dört sunucu/web uygulamasını çalıştırır ve admin hesabı seed eder.

Varsayılan geliştirme hesabı:

```text
Kullanıcı: admin@docsys.local veya admin
Parola: Admin1234!
```

Bu kimlik bilgileri yalnızca yerel geliştirme içindir.

## 23.3 Kapatma

```bash
pnpm dev:down
STOP_INFRA=1 pnpm dev:down
```

İkinci biçim uygulama süreçleriyle birlikte Docker geliştirme altyapısını da durdurur.

## 23.4 macOS PostgreSQL locale notu

Bu geliştirme makinesinde Homebrew PostgreSQL komutlarından önce `LC_ALL=C` gereklidir:

```bash
export LC_ALL=C
brew services start postgresql@16 redis
```

## 23.5 Masaüstü geliştirme

```bash
pnpm desktop:typecheck
pnpm --filter @docsys/desktop dev
pnpm desktop:build
```

Linux build için WebKitGTK 4.1, AppIndicator, librsvg ve patchelf gerekir.

# 24. Üretim kurulumu

## 24.1 Compose servisleri

Full Compose PostgreSQL, Redis, MinIO, migrate, API, collaboration, worker ve web servislerini tek ağda kurar. Migrate başarılı olmadan API başlamaz; web API ve collaboration health durumunu bekler.

## 24.2 Gerekli ortam değerleri

| Değişken | Açıklama |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL parolası |
| `JWT_SECRET` | Üretimde en az 32 karakter; güçlü ve rastgele olmalı |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Object storage kimliği |
| `APP_BASE_URL` | Kullanıcının açtığı web adresi |
| `API_PUBLIC_URL` | Dışarıdan görülen API adresi |
| `COLLAB_PUBLIC_URL` | Dışarıdan görülen ws/wss collaboration adresi |
| `CORS_ALLOWED_ORIGINS` | Virgülle ayrılmış izinli web origin'leri |
| `COOKIE_SECURE` | Üretimde zorunlu olarak true |
| `METRICS_TOKEN` | Üretimde zorunlu, en az 32 karakterli Prometheus erişim token'ı |
| `ALLOW_PUBLIC_REGISTRATION` | Üretimde varsayılan false; yalnız kontrollü kullanıcı kaydı gerekiyorsa true |
| `TRASH_RETENTION_DAYS` | Çöp saklama süresi |

> Full Compose servisleri `NODE_ENV=production` ile çalışır. API, kısa JWT secret'ı, güvenli olmayan cookie veya eksik metrics token ile başlamaz. Ters proxy ile kullanılan gerçek domainler localhost varsayılanlarıyla bırakılmamalıdır.

## 24.3 Ters proxy

Önerilen dış yollar:

```text
https://docsys.sirket.local       Web
https://docsys-api.sirket.local   API + /ws/events
wss://docsys-collab.sirket.local  Hocuspocus
```

Proxy WebSocket upgrade başlıklarını iletmeli, body limitlerini dosya politikasına göre ayarlamalı ve TLS 1.2+ kullanmalıdır.

## 24.4 İlk üretim kabulü

1. Migration sonucu başarılı mı?
2. `/health/live` ve `/health/ready` yeşil mi?
3. Web login, cookie secure ve CORS doğru mu?
4. Collaboration üzerinden iki kullanıcı aynı metni düzenleyebiliyor mu?
5. MinIO export ve attachment akışı çalışıyor mu?
6. Worker purge/export kuyruğunu tüketiyor mu?
7. Metrics Prometheus tarafından okunuyor mu?
8. Backup ve restore prova edildi mi?

# 25. Gözlemlenebilirlik ve performans

## 25.1 Loglar

API pino ile yapılandırılmış log üretir. Her istek mevcut `X-Request-Id` değerini kullanır veya UUID üretir. Cookie ve Authorization alanları redakte edilir. Container logları merkezi Loki, Elasticsearch veya kurum standardına aktarılabilir.

## 25.2 Metrics

`GET /metrics` Prometheus biçiminde Node process ve HTTP request histogramlarını verir. Üretimde Bearer `METRICS_TOKEN` zorunludur. Rota etiketleri düşük kardinaliteli hale getirilir; istemci sayfası yalnız `/login` veya `/app` olarak kaydedilir.

Tarayıcı CLS, FCP, INP, LCP ve TTFB değerlerini `/telemetry/web-vitals` endpoint'ine yollar. Dashboard p75 Web Vitals ve API p95/p99 değerlerini göstermelidir.

## 25.3 Büyük doküman benchmark'ı

Test 10.000 satır oluşturur, outline endpoint'ini ısıtır, beş çağrının p50/p95 değerlerini hesaplar ve veriyi temizler. 15 Temmuz 2026 yerel sonucu:

| Ölçüm | Sonuç |
|---|---:|
| Seed | 768,2 ms |
| Yanıt boyutu | 4,33 MiB |
| Minimum | 255,0 ms |
| Median | 278,2 ms |
| p95 | 290,8 ms |
| Bütçe | 2.500 ms |

Bu sonuç geliştirme makinesine özeldir. Üretim hedefi gerçek veri dağılımı, ağ, eşzamanlı kullanıcı ve donanımla yeniden ölçülmelidir.

## 25.4 Bundle bütçesi

Vite manifest kontrolü her JavaScript chunk'ı ve initial dependency graph için 180 KiB gzip üst sınırı uygular. Son doğrulamada initial graph 93,4 KiB, en büyük lazy chunk 72,1 KiB gzip'tir.

# 26. Test stratejisi

## 26.1 Katmanlar

- Typecheck: bütün TypeScript paketleri
- Lint ve karakter taraması: kod standardı
- Web unit/component: kolon, outline, context menu ve grid
- API integration: gerçek PostgreSQL ile auth, tenant, satır, export, baseline, event ve lifecycle
- Worker integration: purge ve export
- Playwright: gerçek uygulama süreçleriyle temel iş akışları
- Performance: 50 istemcili Yjs ve 10.000 satır outline
- Tauri: Rust cargo check ve üç OS build matrisi

## 26.2 Yerel üretim kapısı

```bash
pnpm verify
docker compose -f infra/docker/docker-compose.dev.yml up -d minio
pnpm --filter @docsys/e2e test
pnpm desktop:typecheck
```

## 26.3 Mevcut test sayıları

15 Temmuz 2026 itibarıyla son doğrulama: API 40, worker 10, web 10 ve Playwright 7 test. Playwright; erişilebilirlik, kolon/test alanları, masaüstü login, zengin metin, import/export, ana smoke ve izlenebilirlik akışlarını kapsar.

# 27. GitHub Actions ve sürüm yönetimi

## 27.1 İş akışları

| Workflow | Tetikleme | Amaç |
|---|---|---|
| `ci.yml` | main push / PR | DB migration, typecheck, lint, test ve web build |
| `e2e.yml` | main push / PR | PostgreSQL, Redis, MinIO ve Playwright |
| `desktop.yml` | main push / PR | macOS, Ubuntu ve Windows Tauri doğrulaması ile Windows taşınabilir Go derleme kontrolü |
| `performance.yml` | Haftalık / manuel | 10.000 satır benchmark ve artifact |
| `desktop-release.yml` | `v*` tag | macOS/Linux/Windows Tauri paketleri, Windows taşınabilir arşivi, updater artifact ve draft GitHub Release |

## 27.2 Masaüstü release secret'ları

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Apple için certificate, identity, Apple ID/app password ve team ID
- Windows için kurumsal code-signing sertifikası/yapılandırması

## 27.3 Sürüm adımları

1. Test ve changelog'u tamamlayın.
2. `pnpm release:version X.Y.Z`, `pnpm install --lockfile-only` ve `pnpm release:check` çalıştırın.
3. `pnpm verify`, e2e ve desktop matrix'i geçirin.
4. `vX.Y.Z` tag'i oluşturun.
5. Draft release artifact'larını, imzaları ve `latest.json` manifestini kontrol edin.
6. macOS/Windows/Linux paketlerinde temiz makine smoke testi yapın.
7. Release'i yayımlayın ve eski istemcide updater kabul testi yapın.

# 28. Yedekleme, geri yükleme ve felaket kurtarma

## 28.1 Yedeklenecek varlıklar

- PostgreSQL veritabanı
- MinIO/S3 bucket ve versioning bilgisi
- Deployment konfigürasyonu ve secret referansları
- Tauri updater public/private key yönetim kayıtları
- Kurumsal DOCX şablonları

Redis kalıcı iş verisinin tek kopyası değildir. Yine de kuyruk sürekliliği için persistence kullanılabilir; Redis yedeği PostgreSQL/S3 yedeğinin yerine geçmez.

## 28.2 Tutarlı yedek

PostgreSQL snapshot zamanı ile object storage snapshot'ı mümkün olduğunca eşleştirilmelidir. Export job veya attachment metadata'sı veritabanında olup binary snapshot'ta yoksa tutarsızlık oluşur. Büyük kurulumlarda object versioning ve PITR kullanılmalıdır.

## 28.3 Geri yükleme provası

1. İzole ortama PostgreSQL yedeğini yükleyin.
2. Aynı zamana ait object storage snapshot'ını bağlayın.
3. Migration durumunu kontrol edin; ileri migration'ı yalnızca kopyada deneyin.
4. Login, doküman outline, link, attachment download ve export smoke testi yapın.
5. RPO/RTO sonucunu kaydedin.

# 29. Sorun giderme

## 29.1 Login olmuyor

- Masaüstü sunucu adresini ve protokolü kontrol edin.
- API `/health/live` ve `/auth/client-config` yanıt veriyor mu?
- Yerel kullanıcı adında `@docsys.local` eklemeyi deneyin.
- `COOKIE_SECURE=true` ise web gerçekten HTTPS mi?
- CORS allow-list web origin'ini içeriyor mu?
- Sistem saati JWT doğrulamasını bozacak kadar farklı mı?

## 29.2 Collaboration bağlanmıyor

- `COLLAB_PUBLIC_URL` dışarıdan erişilebilir mi?
- Proxy WebSocket upgrade iletiyor mu?
- Token'ın doküman read yetkisi var mı?
- Collaboration logunda auth rejection var mı?
- Yanlışlıkla container iç DNS adı istemciye gönderiliyor mu?

## 29.3 Export tamamlanmıyor

- Redis ve worker healthy mi?
- BullMQ kuyruğunda failed job var mı?
- MinIO erişim anahtarı ve bucket doğru mu?
- Worker ile API aynı PostgreSQL ve S3 yapılandırmasını kullanıyor mu?
- Presigned URL'deki dış host kullanıcı tarafından erişilebilir mi?

## 29.4 Grid eski veri gösteriyor

- WebSocket olay bağlantısını kontrol edin.
- Detay panelini kapatıp tekrar açın; panel mount'ta refetch eder.
- 409 bildirimi varsa başka kullanıcı değişikliği yüklenmiştir.
- Eski deploy chunk hatasında uygulamayı güvenli biçimde yeniden yükleyin.

## 29.5 PostgreSQL macOS'ta başlamıyor

Homebrew PostgreSQL Türkçe locale ile startup sırasında hata verebilir. `LC_ALL=C` ile servisi yeniden başlatın.

## 29.6 Tauri build olmuyor

- Rust stable ve doğru target kurulu mu?
- Linux sistem paketleri kurulu mu?
- Disk alanı yeterli mi? Release target cache'i çok büyüyebilir.
- Web production build tek başına geçiyor mu?

# 30. Operasyon ve güvenlik kontrol listeleri

## 30.1 Günlük/haftalık operasyon

- Health endpoint ve restart sayıları
- API p95/p99 ve 5xx oranı
- Worker failed/retry job sayısı
- PostgreSQL disk, bağlantı ve slow query
- Redis memory/eviction
- MinIO kapasite ve başarısız upload
- Web Vitals p75
- Şüpheli link ve incomplete test trendi
- Backup başarısı

## 30.2 Aylık güvenlik

- Kritik bağımlılık güncellemeleri
- Yetki/rol ve kullanılmayan hesap incelemesi
- OIDC redirect/issuer kontrolü
- Audit anomalileri
- Secret rotation takvimi
- Attachment malware/DLP raporu
- OSV bağımlılık ve secret tarama sonucu
- Restore provası veya örnek doğrulama
- Masaüstü imza/notarization geçerliliği

## 30.3 Yayın öncesi kabul

- Migration rollback/forward planı hazır
- Tüm otomatik testler yeşil
- Klavye ve ekran okuyucu manuel smoke tamam
- Büyük doküman benchmark bütçe içinde
- Browser ve üç masaüstü OS paketi doğrulandı
- Updater eski sürümden yeni sürüme çalıştı
- Release notes kullanıcı etkisini açıklıyor
- Yeni ortam değişkenleri deploy manifestinde var

# 31. Mevcut sınırlar ve önerilen yol haritası

## 31.1 Çalışan temel, derinleştirilmesi gereken alanlar

| Alan | Mevcut durum | Üretim derinliği için sonraki iş |
|---|---|---|
| ReqIF | Temel import/export çalışıyor | Datatype/specification/reference uyumluluk matrisi ve üçüncü taraf round-trip |
| Entegrasyon | Registry ve webhook config var | Jira/Azure DevOps/GitHub adapter, dispatch, retry, DLQ, secret vault |
| Kimlik | Yerel + OIDC/PKCE | SCIM, SAML, lifecycle ve IdP conformance testleri |
| Satır ACL | Veri modeli/API var | Tam admin UI, etkili izin açıklaması ve toplu yönetim |
| Varyant | Konfigürasyon snapshot/rule var | Effectivity, merge/rebase ve çakışma çözümü |
| DOCX şablon | Storage/worker temeli var | Şablon yükleme, doğrulama, preview ve seçim ekranı |
| Attachment | Boyut/MIME/checksum doğrulamalı upload completion ve güvenli indirme adı var | Antivirüs/CDR, quarantine ve kalıcı upload state |
| Desktop SSO | Web SSO var | Deep-link callback ve kurumsal masaüstü SSO |
| Platform güveni | Updater imzası var | Apple notarization ve Windows code-signing secret'ları |
| OpenAPI | Swagger mevcut | Zod şemalarından tam OpenAPI üretimi ve SDK |

## 31.2 Bu çalışmada tamamlanan güvenlik güçlendirmeleri

Cookie tabanlı mutasyonlar için cross-site Fetch Metadata ve Origin doğrulaması eklendi. SameSite=strict cookie ile birlikte browser CSRF korumasını katmanlandırır; Bearer token kullanan masaüstü istemcisi etkilenmez.

Tarayıcı login/register yanıtı artık JWT'yi JavaScript'e açmaz; yalnız açıkça masaüstü istemcisi olarak giriş yapan Tauri kabuğu oturum token'ı alır. Login ve register aynı IP sınıfında 15 dakikada 20 istekle sınırlandırılır. Üretimde açık kullanıcı kaydı varsayılan olarak kapalıdır.

Masaüstü event WebSocket kimliği URL query parametresine yazılmaz; token WebSocket alt protokol başlığında taşınır ve sunucu loglarında redakte edilir. Böylece proxy erişim logu ve tarayıcı geçmişi üzerinden token sızıntısı önlenir.

Attachment yüklemesi tamamlanırken object storage boyutu ve MIME türü metadata ile karşılaştırılır; SHA-256 verilmişse içerik de doğrulanır. İndirme öncesinde aynı kontroller yeniden yapılır, dosya adı kontrol karakterlerinden ve path ayraçlarından arındırılır, Content-Disposition güvenli UTF-8 biçiminde üretilir.

OIDC issuer ve endpoint'leri HTTPS, kimlik bilgisi içermeyen ve aynı origin koşuluna bağlıdır. Metrics token ve secure cookie üretimde zorunludur. Web Vitals sayfa etiketi sınırlıdır. OSV taraması npm bağımlılığındaki yüksek önem düzeyli eski `uuid` sürümünü override ile güncelledi; GitHub Actions yeni bağımlılık açıklarını PR'da engeller ve haftalık tam sonucu Security ekranına yollar.

Üretim API'sinde Helmet CSP dahil savunma başlıklarını etkinleştirir ve Swagger UI yayınlanmaz. Swagger yalnız geliştirme/test ortamında açıktır. Login parolası gövde sınırına ek olarak 200 karakterle sınırlandırılır.

## 31.3 Bilinçli olarak otomatik tamamlanamayanlar

Apple/Windows kod imzalama sertifikaları kurumsal hesap ve ücretli dış kimlik gerektirir. Jira/Azure/SCIM/SAML için gerçek tenant, istemci kimliği ve sağlayıcı sözleşmesi olmadan güvenilir production adapter geliştirilemez. Bu işler kod eksikliğinden ibaret değil, dış sistem kabul testi ve güvenlik sahipliği gerektirir.

OSV, güncel Tauri 2.11.5'in Linux WebKitGTK/GTK 0.18 zincirinde 16 bakımı durmuş crate bildirimi ve `glib` 0.18.5 için `RUSTSEC-2024-0429` kaydı gösterir. DocSys etkilenen `glib::VariantStrIter` API'sini çağırmaz. Tauri WebKitGTK 2.0 çizgisini sabitlediği için `glib` 0.20 zorla seçilemez; sonuç gizlenmemeli, haftalık taramada izlenmeli ve upstream bağımlılık grafiği izin verdiğinde güncellenmelidir.

# 32. Geliştirici çalışma kuralları

- `.ts` ve `.tsx` kaynaklarında Türkçe karakter kullanmayın; görünür metni locale JSON'a ekleyin.
- Kod yorumları eklemeyin; tasarım açıklamasını `docs/` altına yazın.
- Kullanıcı mutasyonunda yumuşak silme kullanın.
- Audit'i mutation transaction'ından ayırmayın.
- Redis'i iş verisinin tek kopyası yapmayın.
- İstemciden gelen tenant kimliğine güvenmeyin.
- Yapısal optimistic concurrency veya Yjs modelini kaldırmayın.
- Yeni interaktif kontrol için `data-testid`, locale ve uygun test ekleyin.
- Gerçekte çalıştırmadığınız testi geçti diye raporlamayın.
- Çalışma ağacındaki kullanıcı değişikliklerini koruyun.

# 33. API uçları hızlı başvuru

## 33.1 Auth ve health

```text
POST /auth/register
POST /auth/login
GET  /auth/client-config
GET  /auth/me
POST /auth/logout
GET  /auth/collab-token
GET  /auth/sso/:orgSlug/start
GET  /auth/sso/callback
GET  /health/live
GET  /health/ready
GET  /metrics
POST /telemetry/web-vitals
```

## 33.2 Tenant ve ağaç

```text
POST/GET /organizations
GET      /organizations/:orgId
POST/GET /organizations/:orgId/workspaces
POST     /organizations/:orgId/members
POST/GET /workspaces/:workspaceId/projects
POST     /workspaces/:workspaceId/folders
GET      /workspaces/:workspaceId/tree
GET      /workspaces/:workspaceId/trash
PATCH    /folders/:folderId
POST     /folders/:folderId/move
DELETE   /folders/:folderId
POST     /folders/:folderId/restore
POST     /workspaces/:workspaceId/documents
GET/PATCH/DELETE /documents/:documentId
POST     /documents/:documentId/restore
```

## 33.3 Satır ve izlenebilirlik

```text
POST/GET /documents/:documentId/rows
GET      /documents/:documentId/outline
GET      /documents/:documentId/link-candidates
GET/PATCH/DELETE /rows/:rowId
POST     /rows/:rowId/move
POST     /rows/:rowId/restore
POST     /documents/:documentId/rows/copy
POST     /rows/:rowId/links
DELETE   /links/:linkId
POST     /links/:linkId/acknowledge
GET      /documents/:documentId/suspect-links
GET      /documents/:documentId/coverage
GET      /documents/:documentId/traceability
POST/GET /documents/:documentId/fields
```

## 33.4 Yaşam döngüsü ve analiz

```text
GET/POST /documents/:documentId/views
DELETE   /views/:viewId
GET      /workspaces/:workspaceId/search
GET      /documents/:documentId/quality
GET      /documents/:documentId/dashboard
GET      /documents/:documentId/assistant/suggestions
GET/POST /rows/:rowId/comments
POST     /comments/:commentId/resolve
GET/POST /rows/:rowId/attachments
POST     /attachments/:attachmentId/complete
GET      /attachments/:attachmentId/download
DELETE   /attachments/:attachmentId
GET      /notifications
POST     /notifications/:notificationId/read
GET/POST /rows/:rowId/executions
PATCH    /executions/:executionId/steps/:stepRowId
POST     /executions/:executionId/complete
GET/POST /documents/:documentId/reviews
POST     /reviews/:reviewId/decisions
GET/POST /rows/:rowId/proposals
POST     /proposals/:proposalId/decision
GET/POST /workspaces/:workspaceId/configurations
GET/POST /rows/:rowId/access
GET/POST /organizations/:orgId/integrations
POST     /organizations/:orgId/sso
```

## 33.5 Import, export ve baseline

```text
POST /documents/:documentId/exports
GET  /exports/:jobId
GET  /exports/:jobId/download
POST /documents/:documentId/imports
POST /documents/:documentId/imports/xlsx
POST /documents/:documentId/imports/reqif
GET/POST /organizations/:orgId/export-templates
GET/POST /documents/:documentId/baselines
GET  /documents/:documentId/baselines/:revisionNumber/diff
```

# 34. Terimler sözlüğü

| Terim | Açıklama |
|---|---|
| Baseline | Dokümanın belirli andaki iş seviyesi snapshot'ı |
| CRDT | Eşzamanlı düzenlemeleri merkezi kilit olmadan birleştiren veri tipi |
| Effectivity | Bir gereksinim/öğenin hangi ürün varyantlarında geçerli olduğu |
| Idempotency | Aynı isteğin tekrarlanmasının ikinci bir yan etki üretmemesi |
| INP | Kullanıcı etkileşimi yanıt gecikmesi Web Vital metriği |
| Legal hold | Normal saklama süresine rağmen kaydın silinmesini engelleyen hukuki koruma |
| LexoRank | Araya yeni sıra anahtarı eklemeyi kolaylaştıran sıralama yaklaşımı |
| OIDC/PKCE | Modern kimlik sağlayıcı yönlendirmesi ve güvenli authorization code akışı |
| Outline | Dokümanın hiyerarşik, düzleştirilmiş ve görüntüleme numaralı görünümü |
| Presence | Bir dokümanda o anda çevrimiçi görünen kullanıcıların geçici bilgisi |
| Projection | Bağlı satırın bir alanını mevcut grid kolonunda gösterme |
| ReqIF | Gereksinim değişimi için XML tabanlı standart format |
| RPO/RTO | Kabul edilebilir veri kaybı ve geri dönüş süresi hedefleri |
| Suspect link | Kaynak/hedef değiştiği için yeniden doğrulanması gereken izlenebilirlik bağlantısı |
| Tenant | Verisi ve yetkisi diğerlerinden ayrılan organizasyon bağlamı |
| Yumuşak silme | Kaydı fiziksel silmeden silinmiş olarak işaretleme |

# 35. Sonuç

DocSys'in mimarisi; denetlenebilir gereksinim-test verisini PostgreSQL'de, geçici koordinasyonu Redis'te, binary dosyaları S3'te tutan; yapılandırılmış alanlarda optimistic concurrency, zengin metinde Yjs kullanan; web ve Tauri masaüstü istemcilerini aynı frontend üzerinde birleştiren üretim odaklı bir temele sahiptir.

Sistemi güvenli ve sürdürülebilir kullanmanın anahtarı; tenant/permission sınırlarını korumak, baseline ve bağlantı disiplinini süreç içine yerleştirmek, test yürütmesini test tanımından ayırmak, gözlemlenebilirlik bütçelerini izlemek ve dış sağlayıcı/sertifika gerektiren kurumsal özellikleri gerçek kabul ortamlarında tamamlamaktır.

Bu Markdown dosyası kılavuzun düzenlenebilir kaynak sürümüdür. Aynı klasördeki üretici script, kaynak güncellendikten sonra DOCX ve PDF çıktılarının yeniden oluşturulmasını sağlar.
