import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Netlify CLI's local build/deploy output (gitignored, vendors its own
    // dependency source under edge-functions/.../edge-runtime/lib) - never
    // present before a `netlify deploy`, so this gap went unnoticed until now.
    ".netlify/**",
  ]),
]);

export default eslintConfig;
