import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "app/[locale]/**/*.{ts,tsx}",
      "components/{Navbar,Footer,AuthCard,ContactForm,EventSignup,LoginForm,RegisterForm,VolunteerClient}.tsx",
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
