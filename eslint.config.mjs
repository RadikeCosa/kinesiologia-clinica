import architecture from "./eslint.architecture.mjs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { files: ["src/**/*.{ts,tsx}"], plugins: { architecture }, rules: { "architecture/boundaries": "error" } },
  globalIgnores([".next/**", ".next-e2e/**", ".next-*/**", "test-results/**", "playwright-report/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
