// Flat config for ESLint v9 + eslint-config-next 16. Replaces the old
// `next lint` runner (removed in Next 16).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "dist/**",
      "build/**",
      ".cache/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
      "public/**",
      "scripts/**",
      "*.tsbuildinfo",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Honor the leading-underscore "intentionally unused" convention used
      // throughout the codebase (e.g., destructure-discards like { _ix, _iy }).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
