/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["@typescript-eslint"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  rules: {
    // Enforce `import type` for type-only imports.
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
        disallowTypeAnnotations: false,
        fixStyle: "separate-type-imports",
      },
    ],

    // Unused vars: warn not error — codebase has legitimate unused imports
    // across files not yet rewritten. Prefix with _ to suppress individually.
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],

    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "import/order": "off",
    "no-console": "off",
    "no-debugger": "error",
    "no-alert": "error",
  },

  overrides: [
    // Next.js API routes import NextRequest as a value for instanceof checks
    // and type annotations simultaneously — consistent-type-imports conflicts
    // with this pattern. Disable for all API route handlers.
    {
      files: ["src/app/api/**/*.ts", "src/app/api/**/*.tsx"],
      rules: {
        "@typescript-eslint/consistent-type-imports": "off",
      },
    },

    // Type declaration files.
    {
      files: ["src/types/**/*.d.ts", "**/*.d.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/consistent-type-imports": "off",
        "@typescript-eslint/no-unused-vars": "off",
      },
    },

    // Test files.
    {
      files: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/__tests__/**",
      ],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
  ],
};