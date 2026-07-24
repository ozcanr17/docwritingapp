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

- [ ] Ana panel, Explorer, detay paneli ve split view icin minimum ve dar pencere davranislarini tanimlamak.
- [ ] Klavye sirasi, odak halkalari, atlama baglantilari ve ekran okuyucu etiketlerini denetlemek.
- [ ] Yuksek kontrast, azaltmis hareket ve yaziyi buyutme senaryolarini test etmek.
- [ ] Renk disinda ikon ve metinle durum iletmek.
- [ ] WCAG 2.2 AA hedefi icin otomatik ve manuel kontrol listesi uygulamak.

## Asama 8 - Dogrulama ve surekli kalite

- [ ] Temel yazar, testci, inceleyici ve yonetici akislari icin E2E testleri olusturmak.
- [ ] Genis, dar, detay panelli ve split view ekran goruntusu regresyonlarini eklemek.
- [ ] Buyuk dokumanlarda kaydirma, arama, filtreleme ve duzenleme benchmarklarini korumak.
- [ ] Her asamada TypeScript, birim testleri, erisilebilirlik ve uretim derlemesini calistirmak.
- [ ] Tamamlanan her asamayi `HANDOFF.md` ve bu kontrol listesinde kaydetmek.

## Asama tamamlanma olcutu

Bir asama ancak ilgili maddeler isaretlendiginde, regresyon testleri gectiginde, Mac uzerinde `pnpm dev` ile gorsel olarak dogrulandiginda ve degisiklikler `main` dalina gonderildiginde tamamlanmis sayilir.
