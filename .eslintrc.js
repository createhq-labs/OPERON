/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint"],
  rules: {
    // Enforce explicit return types on exported functions and class methods.
    "@typescript-eslint/explicit-module-boundary-types": "warn",

    // Ban `any` — use `unknown` with a type guard instead.
    "@typescript-eslint/no-explicit-any": "error",

    // Unused variables are bugs waiting to happen.
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    // Prevent accidental floating promises (e.g. unawaited Supabase calls).
    "@typescript-eslint/no-floating-promises": "error",

    // Consistent type imports keep bundle analysis accurate.
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports" },
    ],

    // No console.log in committed code. Use the structured logger service.
    "no-console": ["error", { allow: ["warn", "error"] }],

    // React 18 — no need to import React in every file.
    "react/react-in-jsx-scope": "off",

    // Exhaustive deps catches stale closures in hooks.
    "react-hooks/exhaustive-deps": "error",
  },
  overrides: [
    {
      // Relax boundary-type rule in test files.
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
      rules: {
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-explicit-any": "warn",
      },
    },
    {
      // API route files can use non-module exports.
      files: ["src/app/api/**/*.ts"],
      rules: {
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },
  ],
};
