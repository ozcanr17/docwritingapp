# DocSys Masaüstü Dağıtımı

DocSys masaüstü uygulaması Tauri 2 ile paketlenir ve web arayüzünün aynı kaynak kodunu kullanır. macOS, Windows ve Linux için ayrı uygulama paketi üretilir; Chromium uygulamayla birlikte taşınmaz, işletim sisteminin web görünümü kullanılır.

## Giriş ve şirket sunucusu

Masaüstü giriş ekranındaki **Sunucu adresi** alanına API kök adresi yazılır: örneğin `https://docsys-api.sirket.local`. Alan boş bırakılırsa derleme varsayılanı kullanılır. Başarılı bağlantıdan sonra API, `GET /auth/client-config` ile gerçek zamanlı işbirliği adresini bildirir.

Sunucu tarafında dışarıdan erişilebilir işbirliği adresi şu değişkenle ayarlanır:

```env
COLLAB_PUBLIC_URL=wss://docsys-collab.sirket.local
```

Yerel kullanıcılar hem tam e-posta (`admin@docsys.local`) hem de yalnızca kullanıcı adı (`admin`) ile giriş yapabilir. `@` içermeyen kullanıcı adı sunucuda `@docsys.local` alan adına çözümlenir. Kayıt işlemi e-posta istemeye devam eder.

## Yerel geliştirme ve paketleme

```bash
pnpm desktop:check
pnpm desktop:typecheck
pnpm --filter @docsys/desktop dev
pnpm desktop:build
pnpm release:check
```

`desktop:check`, web/desktop/Cargo sürümlerinin aynı olduğunu; tüm paket hedeflerinin, updater imzasının, HTTPS manifest adresinin, CSP güvenlik sınırlarının ve ikonların eksiksiz olduğunu doğrular. Bu kontrol hem normal masaüstü CI matrisinde hem de etiketli sürüm üretiminde zorunludur.

`pnpm desktop:build`, kişisel test için üzerinde çalışılan işletim sisteminin paketini updater özel anahtarı istemeden üretir. GitHub'daki `v*` sürüm akışı macOS, Linux ve Windows paketlerini yerel runner'larında oluşturur; ayrıca aynı sürüme Windows taşınabilir paketi ekler. Eski `desktop-v*` etiketi geçiş uyumluluğu için desteklenir. İmzalı updater artefaktları yalnız bu güvenli sürüm akışında oluşturulur.

Sürüm numarası yalnız bir dosyada elle değiştirilmemelidir. Yeni sürüm hazırlarken:

```bash
pnpm release:version 0.1.7
pnpm install --lockfile-only
pnpm release:check
```

`release.json`, web telemetrisi, Tauri/Cargo paketleri ve Windows taşınabilir çalışma zamanı aynı ürün sürümüne bağlanır. Normal `pnpm verify` akışı da bu hizalamayı zorunlu olarak denetler.

Tauri derlemesi Rust stable araç zinciri gerektirir. Linux'ta ayrıca WebKitGTK 4.1, AppIndicator, librsvg ve patchelf sistem paketleri gerekir.

## Güncelleme ve imzalama

`v*` etiketi `.github/workflows/desktop-release.yml` akışını başlatır. Akış dört Tauri hedefini ve Windows taşınabilir arşivini üretir, Tauri güncelleme imzalarını oluşturur ve tek bir taslak GitHub sürümünde toplar. Depo ayarlarında en az şu GitHub Actions secret'ları bulunmalıdır:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

macOS imzalama ve notarization için `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` ve `APPLE_TEAM_ID` gerekir. Windows güven uyarısını kaldırmak için kuruma ait kod imzalama sertifikası ayrıca yapılandırılmalıdır. Güncelleme imzası, işletim sistemi kod imzasının yerine geçmez.

Uygulama açıldıktan sonra yeni sürümü denetler. Yeni sürüm varsa kullanıcı erteleyebilir veya indirip uygulamayı yeniden başlatabilir.
