# Performans ve Erişilebilirlik Doğrulaması

## Üretim gözlemlenebilirliği

API, Prometheus biçimindeki ölçümleri `GET /metrics` üzerinden sunar. `METRICS_TOKEN` ayarlanırsa bu uç Bearer token ister. Ölçümler HTTP istek süresini, durum kodunu ve rota grubunu içerir. Tarayıcı istemcisi CLS, FCP, INP, LCP ve TTFB Web Vitals değerlerini `POST /telemetry/web-vitals` üzerinden iletir.

Önerilen alarm başlangıçları:

| Ölçüm | Başlangıç eşiği |
|---|---:|
| API p95 istek süresi | 750 ms |
| Büyük doküman outline p95 | 2500 ms |
| LCP p75 | 2500 ms |
| INP p75 | 200 ms |
| CLS p75 | 0.1 |

Bu değerler ilk üretim trafiğinden sonra sayfa, veri hacmi ve donanım sınıfına göre yeniden kalibre edilmelidir.

## Büyük doküman benchmark'ı

API çalışırken aşağıdaki test 10.000 satırlık hiyerarşik bir doküman üretir, outline uç noktasını ısıtır, beş örneğin p50/p95 değerlerini raporlar ve test verisini temizler:

```bash
DATABASE_URL=postgresql://docsys:docsys@localhost:5432/docsys_test \
API_URL=http://127.0.0.1:3001 \
pnpm --filter @docsys/performance-tests large-document
```

Satır sayısı ve bütçe `LARGE_DOC_ROWS` ile `LARGE_DOC_MAX_P95_MS` değişkenleriyle ayarlanabilir. Haftalık GitHub Actions çalışması JSON sonucu artifact olarak saklar.

## UX ve erişilebilirlik kapsamı

Playwright akışı WCAG 2 A/AA axe kurallarıyla giriş ve çalışma alanı ekranlarını denetler. Ayrıca kayıt/giriş, kurulum, doküman-grid düzenleme, kolonlar, zengin metin, dışa aktarım ve izlenebilirlik iş akışları uçtan uca test edilir.

Uygulama ana bölgelere semantik landmark'lar, erişilebilir panel ayırıcıları, görünür klavye odağı, ana içeriğe geçiş bağlantısı, form etiketleri ve canlı hata bildirimleri sağlar. Otomasyon; ekran okuyucu anlaşılırlığı, yalnızca klavyeyle uçtan uca kullanım, yüzde 200 yakınlaştırma ve gerçek düşük güçlü cihaz testlerinin yerine geçmez. Bunlar her büyük arayüz sürümünde manuel kabul kontrol listesi olarak uygulanmalıdır.
