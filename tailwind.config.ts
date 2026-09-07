import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#E6EBF2",
        "base-light": "#FFFFFF",
        "base-dark": "#B7C1D1",
        ink: "#2B3542",
        "ink-muted": "#71798A",
        accent: "#B8862E",
        "accent-dark": "#8F6820",
        "accent-soft": "#EFE1C4",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-manrope)", "sans-serif"],
      },
      borderRadius: {
        neu: "22px",
      },
    },
  },
  plugins: [],
};

export default config;
