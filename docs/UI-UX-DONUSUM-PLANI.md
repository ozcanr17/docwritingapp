# DocSys UI/UX Donusum Plani

Bu belge, DocSys'in profesyonel ve kurumsal bir urun arayuzune donusumunu izlemek icin yasayan kontrol listesidir. Her madde kod, test ve gorsel dogrulama tamamlandiginda isaretlenir.

## Tasarim ilkeleri

- Bilgi yogunlugu yuksek, fakat sakin ve taranabilir bir arayuz.
- Gereksinim yazari, testci, inceleyici ve yonetici icin goreve uygun akislar.
- Web gelistirme ortaminda hizli test; bu calisma boyunca masaustu paketleme kapsam disidir.
- Mevcut veri, izlenebilirlik, yetki ve denetim davranislarini koruyan kademeli donusum.
- Klavye, ekran okuyucu, yuksek kontrast ve dar pencere kullaniminin birinci sinif kabul edilmesi.

## Asama 1 - Tasarim sistemi ve uygulama kabugu

- [x] Renk, tipografi, bosluk, radius, golge ve durum tokenlarini tek bir sistemde toplamak.
- [x] Acik ve koyu temada yuzey hiyerarsisini ve kontrasti tutarli hale getirmek.
- [x] Global ust bari calisma alani/menuler, ortalanmis arama ve sistem aksiyonlari olarak uc bolgeye ayirmak.
- [x] Genel aramayi pencere boyutundan bagimsiz olarak geometrik merkezde tutmak.
- [x] Dar pencerelerde menulerin arama ile cakismadan dinamik olarak yer degistirmesini saglamak.
- [x] Sol panelde ana gezinme, Explorer, araclar ve kullanici alanlarini belirgin gruplara ayirmak.
- [x] Sol paneli daraltma/genisletme davranisini kalici kullanici tercihi yapmak.
- [x] Aktif gorunumu, odaktaki dokumani ve calisma yuzeyini tek bakista ayirt edilir hale getirmek.
- [x] Yuklenme ve bos durumlarini urun seviyesinde gorsellestirmek.

## Asama 2 - Dokuman sekmeleri ve arac cubuklari

- [x] Sekme odagi, sabitleme, bolunmus gorunum ve tasma davranislarini birlestirmek.
- [x] Dokuman arac cubugunu birincil yazim islemleri ve ikincil gorunum islemleri olarak ayirmak.
- [x] Dar alanlarda islemleri oncelige gore tasma menusune almak.
- [x] Kaydetme, cevrimdisi ve cakisma durumlarini tek konumda gostermek.
- [x] Ikon, tooltip, klavye kisayolu ve devre disi durumlarini tutarli hale getirmek.

## Asama 3 - Dokuman tablosu ve ayrinti paneli

- [x] Satir secimi, duzenleme modu ve degisiklik durumunu daha belirgin gostermek.
- [x] Kompakt, standart ve rahat satir yogunlugu seceneklerini tamamlamak.
- [x] Uzun metinlerin taranabilirligini, satir sarimini ve yatay kaydirmayi iyilestirmek.
- [x] Sabit sutunlari yalnizca kullanici tercihiyle etkinlestirmek.
- [x] Sag paneli secim yokken dokuman ozeti, kapsam ve kalite bilgileriyle doldurmak.
- [x] Dokuman turune gore tekrar eden dusuk degerli sutunlari varsayilan gorunumden cikarmak.

## Asama 4 - Pencere, menu ve geri bildirim sistemi

- [x] Modal, popover, baglam menusu, secici ve toast katmanlarini ortak bilesen standardina tasimak.
- [x] Tum gecici yuzeyleri Escape, disariya tiklama ve mantikli odak iadesiyle kapatmak.
- [x] Katman sirasi ve portal kullanimini merkezilestirerek arkada acilan pencere sorunlarini bitirmek.
- [x] Silme, tasima ve toplu islemlerde acik sonuc ve geri alma firsati sunmak.
- [x] Hata mesajlarini teknik ama kullaniciya yol gosteren bir dille standartlastirmak.

## Asama 5 - Is, hata, test plani ve kosum deneyimi

- [x] Is ve test merkezini Jira benzeri fakat dokuman baglamini kaybetmeyen bir bilgi mimarisine tasimak.
- [x] Hata, gorev, test plani, test seti, kosum ve kanit arasindaki gecisleri sadelestirmek.
- [x] Liste, pano ve ayrinti gorunumlerinde ortak filtre ve kayitli gorunum davranisi sunmak.
- [x] Gereksinim-test-kosum-hata zincirini tek bir gorsel akisla okunabilir kilmak.
- [x] Rol odakli baslangic ekranlarinda yazar, testci ve inceleyici icin ilgili metrikleri gostermek.

## Asama 6 - Ayarlar, yonetim ve rol tabanli calisma alanlari

- [x] Ayarlari gorunum, yazim, klavye, erisilebilirlik, bildirim ve entegrasyon olarak yeniden gruplamak.
- [x] Yonetim ekranlarini kullanici, rol, kapsam, proje ve denetim kaydi ekseninde duzenlemek.
- [x] Yazar icin yazim/kalite, testci icin kosum, inceleyici icin degisiklik/onay odagini guclendirmek.
- [x] Yetki yok, salt okunur ve yonetici durumlarini arayuzde acikca gostermek.
- [x] Kullaniciya gorunen yetkiler ile sunucunun uyguladigi yetkilerin tutarli oldugunu test etmek.

## Asama 7 - Duyarli tasarim ve erisilebilirlik

- [x] Ana panel, Explorer, detay paneli ve split view icin minimum ve dar pencere davranislarini tanimlamak.
- [x] Klavye sirasi, odak halkalari, atlama baglantilari ve ekran okuyucu etiketlerini denetlemek.
- [x] Yuksek kontrast, azaltmis hareket ve yaziyi buyutme senaryolarini test etmek.
- [x] Renk disinda ikon ve metinle durum iletmek.
- [x] WCAG 2.2 AA hedefi icin otomatik ve manuel kontrol listesi uygulamak.

## Asama 8 - Dogrulama ve surekli kalite

- [x] Temel yazar, testci, inceleyici ve yonetici akislari icin E2E testleri olusturmak.
- [x] Genis, dar, detay panelli ve split view ekran goruntusu regresyonlarini eklemek.
- [x] Buyuk dokumanlarda kaydirma, arama, filtreleme ve duzenleme benchmarklarini korumak.
- [x] Her asamada TypeScript, birim testleri, erisilebilirlik ve uretim derlemesini calistirmak.
- [x] Tamamlanan her asamayi `HANDOFF.md` ve bu kontrol listesinde kaydetmek.

## Asama 9 - Surekli sadelestirme ve gorev ergonomisi

- [x] Is kaydi olusturmayi temel bilgiler, QA kaniti ve atama/baglantilar olarak odakli bolumlere ayirmak.
- [x] Uzun formlarda baslik ve ana eylemleri sabit, yalnizca icerigi kaydirilabilir hale getirmek.
- [x] Is kaydi formunu dar ve kisa pencerelerde guvenli bosluklarla ekrana sigdirmak.
- [x] Ortak is yonetimi pencere cercevesinde basligi kaydirma alanindan ayirmak.
- [ ] Test plani, is akisi ve kayit ayrintisi yuzeylerini gercek pilot geri bildirimiyle ayni progressive-disclosure standardinda gozden gecirmek.
- [ ] Dashboard kartlarini role ve sik kullanima gore kisisellestirerek ilk bakistaki bilgi yukunu azaltmak.

## Asama 10 - Ticari urun bilgi mimarisi ve gorsel sistem yenilemesi

Gercek pilot degerlendirmesi, mevcut arayuzun Jira ve DOORS sinifi ticari urun beklentisini karsilamadigini gosterdi. Bu asama bes fazli kapsamli bir yeniden tasarim programidir.

### Faz 0 - Temeller: rota, bilesen kutuphanesi, yogunluk

- [x] Gercek URL rotalari: `/docs/:id`, `/work`, `/trash`; tarayici geri/ileri, paylasabilir derin baglantilar ve oturum sonrasi dogrudan dokuman acilisi.
- [x] Ortak arayuz bileseni kutuphanesi (`components/ui`): Button, IconButton, Lozenge, Tag, Avatar, AvatarGroup, Tabs, PageHeader, EmptyState.
- [x] Radius olcegini sikilastirmak ve yuzen kart kabugu yerine 1px bolmeli tam genislik panel duzenine gecmek.
- [x] Tablo satir yogunlugunu ticari arac seviyesine cekmek: kompakt 32, standart 40, rahat 48 piksel hedefleri.

### Faz 1 - Kabuk ve gezinme

- [x] Ust bari urun cubugu olarak yeniden duzenlemek: global Olustur dugmesi, bildirimler, yardim ve profil sag ustte.
- [x] Dosya/Duzen menu cubugunu kaldirip islemleri dokuman uc nokta menusune, yardim menusune ve komut paletine tasimak.
- [x] Alan bazli iki seviyeli gezinme: ince ikon rayi (Dokumanlar, Is, Cop kutusu, Yonetim, Ayarlar) ve alana ozel baglamsal kenar cubugu; favoriler ve son dokumanlar kenar cubugunda satir ici.

### Faz 2 - Jira seviyesinde is alani

- [x] Is alanini proje sol gezinmesiyle rotali sayfalara ayirmak: `/work/summary`, `/work/board`, `/work/list`, `/work/plans`; proje secici, birincil olusturma ve yonetim eylemleri sol gezinmede.
- [x] Is kaydi gorsel dili: bes tur ikonu, alti oncelik ikonu, durum lozenge renkleri, atanan avatarlari ve gorunur is anahtarlari liste/pano/ozet yuzeylerinde.
- [x] Tam yukseklik pano kolonlari, kolon sayaclari ve zengin kartlar (tur, anahtar, oncelik, avatar).
- [x] `/work/item/:key` rotali iki sutunlu is kaydi gorunumu: soguk derin baglanti anahtar cozumlemesiyle calisir, bulunamayan anahtar acik bir geri yolu sunar.

### Faz 3 - DOORS seviyesinde dokuman alani

- [x] Guclendirilmis sabit tablo basligi: tiklanarak artan/azalan/temiz siralama, gorunur siralama oku, `aria-sort`; baslik ve satirlar artik tum genisligi kaplayarak olu boslugu kaldiriyor.
- [x] Buyuk dokumanlar icin tablo yaninda modul ana hatti: acilir Icindekiler paneli basliklari hiyerarsik listeler, secim satiri secip sanal listede ortalar, kapali atalari otomatik acar; tercih cihazda kalicidir.
- [x] Ayrinti paneli Icerik sekmesinin basina yapilandirilmis alan blogu eklendi: ID, tur, gereksinim no, durum, surum ve dokuman.

### Faz 4 - Rotali ayarlar/yonetim ve cila

- [x] Ayarlar (`/settings`), yonetim (`/admin`) ve analiz raporlari (`?report=`) modallardan rotali sayfalara donusturuldu; soguk derin baglantilar calisir.
- [x] Koyu tema tum yenilenen yuzeylerde token tabanli olarak dogrulandi; giris ekrani ve marka cilasi uygulandi.
- [x] Gorunumler arasi tutarlilik: her alan (dokumanlar, is, ayarlar, yonetim, cop kutusu) ayni konumda ve genislikte ikincil gezinme kolonu kullanir; icerik gorunum degistirirken kaymaz.
- [x] "DocSys Demo" markasi kaldirildi: ust bar yalnizca calisma alani adini gosterir, seed organizasyonu profesyonel adla olusturulur.
- [x] WCAG kontrast duzeltmesi: bilgi (info) rengi acik temada 4.5:1 esigini karsilayacak sekilde koyulastirildi.

## Asama 11 - Referans tasarim diline yakinsama

Kullanici, iyi organize edilmis bir referans urun tasarimi (tek kenar cubugu, sayfa basligi, birlesik metrik seridi, tutarli kartlar) paylasti ve ayni standardin tum uygulamaya uygulanmasini istedi.

- [x] Referans seviyesinde ortak bilesenler: Card/CardHeader/CardBody/CardFooter, MetricStrip+Metric (renkli ikon rozeti, buyuk deger, aciklama), ListRow, TableHead, ProgressBar, SidebarGroup/SidebarItem.
- [x] Uc katmanli kabuk (global bar + 48px ray + ayri panel) tek tam yukseklikli kenar cubugu ile degistirildi: marka+daraltma, gruplanmis gezinme, alana ozel baglamsal bolum ve altta hesap karti.
- [x] Icerik alani kendi sayfa basligini tasir: alan ikonu + baslik + calisma alani alt basligi, sonra arama, Olustur, yardim, bildirimler ve tema anahtari.
- [x] Ayarlar ve yonetim bolumleri URL surumlu (`/settings/:section`, `/admin/:section`) hale getirildi; bolum gezinmeleri kenar cubuguna tasindi.
- [x] Is alani gorunum baglantilari kenar cubuguna, proje secici ve yonetim eylemleri sayfa arac cubuguna tasindi.
- [x] Tum gorunumlerde icerik ayni x konumunda baslar (olculen 292 piksel) ve ayni 56 piksel baslik yuksekligi kullanilir; gorunum degistirirken hicbir ogenin yeri kaymaz.
- [x] Is panosu ozeti, yonetim genel bakisi, liste tablosu ve test plani kartlari yeni tasarim diline gecirildi.

## Asama 12 - Proje yonetimi ve yapilandirilabilir is kaydi semasi

Kullanici, yeni proje olusturmanin herkese acik olmamasini ve Jira'daki gibi bir yonetim panelinden yeni proje, yeni is kaydi turu ile is kayitlarina eklenebilecek alanlarin (tur ve zorunluluk bilgisiyle) tanimlanabilmesini istedi.

- [x] Proje olusturma ayri bir yetki (`project.create`) oldu; yalnizca sistem, organizasyon ve calisma alani yoneticileri kullanabilir. `project_manager` yeniden adlandirma ve arsivlemeyi surdurur.
- [x] Bir proje icindeki tum kayitlar tek bir sayacla numaralanir (`SYS-5`, `SYS-6` ...); yonetici isterse testleri ayri bir kodla ilerletebilir (`keyStrategy` = `per_type`, `testCode`).
- [x] Yonetim panelinde yeni Projeler bolumu (`/admin/projects`): proje listesi, proje olusturma ve secili proje icin sema yonetimi.
- [x] Is kaydi turleri: her proje bes yerlesik turle baslar; yoneticiler ozel tur ekleyebilir. Yerlesik turler arsivlenemez, kullanimda olan turler arsivlenemez.
- [x] Is kaydi alanlari: etiket, veri turu (metin, uzun metin, tam sayi, ondalik, mantiksal, tarih, tarih-saat, tek/cok secim, baglanti), zorunluluk, secim listesi ve hangi turlere uygulanacagi. Sunucu tarafi dogrulama zorunlu alani, gecersiz secenegi ve turu uymayan degeri reddeder.
- [x] Yetkisi olmayan uyeler tablolari salt okunur gorur; tum kurallar sunucuda dogrulanir.

## Asama 13 - Test kosumu olusturma ve kosum raporu

Kullanici, test kosumlarinin olusturulabilmesini ve paylastigi Test Plan Execution Report gorsellerindeki gecen/basarisiz/acik ozetinin ilerleme cubuguyla birlikte uygulanmasini istedi.

- [x] Her test kosumu artik diger tum kayitlar gibi proje anahtari aliyor; hem plansiz hem plana bagli kosum yollari ayni sayaci kullaniyor.
- [x] `/tests/kosumlar` alani: calisma alanindaki tum kosumlar; proje ve duruma gore filtre, dagilim cubugu, adim sonuclari, plan bilgisi ve kosan kisi.
- [x] Kosum olusturma penceresi: adimlari olan bir test secilir, ortam, yapi referansi ve yineleme girilir.
- [x] Test plani kosum raporu: metrik seridi, bolumlu ilerleme cubugu ve aciklamasi, yinelemeye ve atanan kisiye gore dagilim, planlanan testler tablosu (son kosum, adim sonucu, hatalar) ve hata tablosu.
- [x] Rapor satirlarindan dogrudan kosum baslatilabilir; daha once kosulmus bir test icin buton "Yeniden test et" olur.
- [x] Gecme orani yalnizca sonuclanan kosumlar uzerinden, tamamlanma orani ise planin tamami uzerinden hesaplanir; alti durum kovasi her zaman planlanan sayisina eslenir.
- [x] Ortak `StatusBar` bileseni eklendi: sifir olan durumlar cubukta gosterilmez, aciklamada kalir.

## Asama 14 - Jira seviyesinde pano: kulvarlar ve devam eden is sinirlari

Jira seviyesinde planlama yeteneklerinin ilk parcasi olarak panonun kulvarlara ayrilmasi ve kolon basina devam eden is sinirinin gorunur olmasi ele alindi.

- [x] Pano kulvarlara ayrilabiliyor: kulvar yok, atanan kisi, oncelik, tur ve epik. Secim cihazda kalicidir ve bos birakildiginda projenin varsayilan kulvarini kullanir.
- [x] Kulvar basliklari daraltilabilir; daraltma durumu kulvar gruplamasiyla birlikte cihazda saklanir. Atanan kisi kulvarinda avatar, epik kulvarinda epik anahtari ve basligi gosterilir.
- [x] Epik kulvari, kaydin epik atasini yuklu kayitlar uzerinden cozer; epik bulunamazsa kayit "Epik yok" kulvarinda toplanir. Epiklerin kendisi de bu kulvarda yer alir.
- [x] Kolon basliklari devam eden is sinirini `sayi / sinir` olarak gosterir; sinira ulasan kolon uyari, sinirin uzerine cikan kolon hata rengiyle isaretlenir ve durum `data-wip-state` ozniteligiyle makine tarafindan okunabilir.
- [x] Sinirlar yalnizca uyari niteligindedir; sunucudaki gecis kurallarina dokunulmaz ve sinirin uzerindeki bir kolona kayit tasimak engellenmez. Renk tek isaret degildir, sayaca erisilebilir aciklama eklenir.
- [x] Pano ayarlari surumlu `workflowConfig` JSON'una eklendi: kolon basina sinir ve varsayilan kulvar. Eski yapilandirmalar bu alan olmadan da calisir; gecersiz veya sifir sinir yok sayilir.
- [x] Is akisi duzenleyicisine Pano ayarlari bolumu eklendi: varsayilan kulvar secimi ve kolon basina sinir alanlari, mevcut iyimser surum kontrolu ile kaydedilir.
- [x] Hazir sablonlar pano ayarlarini da tasir: Kontrollu Teslim 5/3, Dogrulama Programi 3/2 sinirlari ve atanan kisi kulvari.

## Asama tamamlanma olcutu

Bir asama ancak ilgili maddeler isaretlendiginde, regresyon testleri gectiginde, Mac uzerinde `pnpm dev` ile gorsel olarak dogrulandiginda ve degisiklikler `main` dalina gonderildiginde tamamlanmis sayilir.
