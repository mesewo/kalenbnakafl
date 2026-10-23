import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./context/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: { extend: { colors: { primary: "#F5C842", primaryDark: "#152238", accent: "#355C4A" } } },
  plugins: [],
};
export default config;
