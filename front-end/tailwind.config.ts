import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#FACC15",   // yellow-400
        primaryDark: "#EAB308", // yellow-500
        accent: "#78350F",    // dark brown
      },
    },
  },
  plugins: [],
};

export default config;
