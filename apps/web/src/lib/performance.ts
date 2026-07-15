import { onCLS, onFCP, onINP, onLCP, onTTFB, Metric } from "web-vitals";
import { getApiUrl } from "./api";

function report(metric: Metric): void {
  const payload = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    page: window.location.pathname,
  });
  void fetch(`${getApiUrl()}/telemetry/web-vitals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

export function startPerformanceMonitoring(): void {
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}
