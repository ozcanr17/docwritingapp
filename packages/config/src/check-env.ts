import { loadEnv } from "./env.ts";

try {
  loadEnv();
  console.log("Environment configuration is valid.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
