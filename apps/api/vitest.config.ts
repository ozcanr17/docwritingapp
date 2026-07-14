import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    globalSetup: ["test/global-setup.ts"],
    hookTimeout: 60000,
    testTimeout: 60000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
      },
    }),
  ],
});
