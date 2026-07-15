import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const performanceRegistry = new Registry();

collectDefaultMetrics({ register: performanceRegistry, prefix: "docsys_" });

export const httpRequestDuration = new Histogram({
  name: "docsys_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [performanceRegistry],
});

export const webVitalValue = new Gauge({
  name: "docsys_web_vital_value",
  help: "Latest browser Web Vital value",
  labelNames: ["metric", "rating", "page"],
  registers: [performanceRegistry],
});

export const webVitalSamples = new Counter({
  name: "docsys_web_vital_samples_total",
  help: "Browser Web Vital samples received",
  labelNames: ["metric", "rating", "page"],
  registers: [performanceRegistry],
});
