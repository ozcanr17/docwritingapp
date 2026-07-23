DocSys 0.2.0 - Windows Portable
================================

Kurulum, Docker, Node.js, PostgreSQL, Redis, terminal veya yonetici yetkisi gerekmez.

1. ZIP dosyasinin tamamini yazilabilir bir klasore cikarin.
2. DocSys Server.exe dosyasini calistirin.
3. Server paneli hazir oldugunda DocSys.exe dosyasini acin.

DocSys once %LOCALAPPDATA%\DocSys klasorini dener. Bu konuma yazma yetkisi yoksa iki EXE'nin yaninda otomatik olarak DocSysData klasorini olusturur. Bu fallback modunda veriler, runtime, loglar ve yedekler DocSysData icinde tutulur. Klasoru tasirken serveri once panelden durdurun ve DocSysData klasorunu da EXE'lerle birlikte kopyalayin.

Bir sorun olursa hata penceresindeki DS-SRV-* veya DS-CLI-* kodunu kaydedin. Ayrintilar:

DocSysData\logs\launcher.log
DocSysData\logs\startup-status.json
DocSysData\logs\client.log

Normal profil modu kullaniliyorsa ayni dosyalar %LOCALAPPDATA%\DocSys\logs altindadir.

Varsayilan yonetici:
E-posta: admin@docsys.local
Parola: Admin1234!

Sunucu paneli: http://127.0.0.1:45174
Uygulama: http://127.0.0.1:5173
