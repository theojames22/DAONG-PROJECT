import type { Config } from "tailwindcss";

// All colors are CSS variables defined in app/globals.css (:root + .dark),
// so the whole neumorphic design system re-themes by swapping variables
// when <html> gets the `dark` class — no per-component dark: variants
// needed for anything that uses these tokens.
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "var(--base)",
        surface: "var(--surface)",
        "base-light": "var(--base-light)",
        "base-dark": "var(--base-dark)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-subtle": "var(--ink-subtle)",
        accent: "var(--accent)",
        "accent-dark": "var(--accent-dark)",
        "accent-light": "var(--accent-light)",
        "accent-soft": "var(--accent-soft)",
        border: "var(--border)",
        success: "var(--success)",
        "success-soft": "var(--success-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
      },
      fontFamily: {
        display: ["var(--font-manrope)", "Manrope", "sans-serif"],
        sans: ["var(--font-manrope)", "Manrope", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        card: "20px",
        neu: "20px",
        container: "24px",
      },
      boxShadow: {
        "level-1": "3px 3px 6px var(--shadow-dark), -3px -3px 6px var(--shadow-light)",
        "level-2": "8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light)",
        "level-3": "14px 14px 28px var(--shadow-dark), -14px -14px 28px var(--shadow-light)",
      },
    },
  },
  plugins: [],
};

export default config;
