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
        // Staff pages (My dashboard / My Schedule) — see globals.css.
        staff: {
          ink: "var(--staff-ink)",
          body: "var(--staff-body)",
          muted: "var(--staff-muted)",
          card: "var(--staff-card)",
          "card-2": "var(--staff-card-2)",
          chip: "var(--staff-chip)",
          border: "var(--staff-border)",
          "border-strong": "var(--staff-border-strong)",
          soft: "var(--staff-soft)",
          success: "var(--staff-success)",
          "success-soft": "var(--staff-success-soft)",
          "success-border": "var(--staff-success-border)",
          warning: "var(--staff-warning)",
          "warning-soft": "var(--staff-warning-soft)",
          "warning-border": "var(--staff-warning-border)",
          danger: "var(--staff-danger)",
          "danger-soft": "var(--staff-danger-soft)",
          "danger-border": "var(--staff-danger-border)",
          "danger-solid": "var(--staff-danger-solid)",
          blue: "rgb(var(--staff-blue) / <alpha-value>)",
          "blue-dark": "rgb(var(--staff-blue-dark) / <alpha-value>)",
          "blue-ink": "rgb(var(--staff-blue-ink) / <alpha-value>)",
        },
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
