import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        surface: "#111114",
        "surface-light": "#16161b",
        border: "#23232a",
        accent: "#22d3ee",
        "accent-hover": "#06b6d4",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
