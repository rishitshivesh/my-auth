import { nextJsConfig } from "@repo/eslint-config/next-js";

/**
 * Copy debt: pre-i18n components that still contain literals. Migrate a
 * directory into `i18n/` copy, then delete its glob here. New code never
 * goes on this list.
 */
const LEGACY_COPY_DEBT = [
  "components/layouts/**",
  "components/providers/**",
];

const NODE_CONFIG_FILES = ["*.cjs"];
const TEST_FILES = ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx", "test-utils/**"];

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  { ignores: NODE_CONFIG_FILES },
  {
    // User-facing copy lives in i18n/; components render only catalogue text.
    files: ["features/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: [...LEGACY_COPY_DEBT, ...TEST_FILES],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: ["·", "/", "|", "—", "-", "•", ":", "(", ")"] },
      ],
    },
  },
  {
    // Network access goes through the SDK (authClient) wrapped by withErrorHandler.
    // middleware.ts runs on the edge before the SDK exists; it may use fetch.
    ignores: ["lib/**", "middleware.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use authClient / authClient.request wrapped with withErrorHandler (lib/)." },
      ],
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "axios", message: "Use the SDK (authClient) instead of axios." }] },
      ],
    },
  },
];
