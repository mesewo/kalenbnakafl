import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "context/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/\\S/]",
          message: "Public interface text must come from the locale message catalog.",
        },
        {
          selector: "JSXAttribute[name.name='aria-label'] > Literal",
          message: "Public aria-label values must come from the locale message catalog.",
        },
        {
          selector: "CallExpression[callee.name='setError'] > Literal[value!='']",
          message: "User-facing errors must come from the locale message catalog.",
        },
        {
          selector: "NewExpression[callee.name='Error'] > Literal[value!='']",
          message: "User-facing errors must come from the locale message catalog.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
