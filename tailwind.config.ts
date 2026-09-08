import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#F5F9FF",
        surface: "#FFFFFF",
        "base-light": "#FFFFFF",
        "base-dark": "#C7D6EE",
        ink: "#172033",
        "ink-muted": "#64748B",
        "ink-subtle": "#94A3B8",
        accent: "#2563EB",
        "accent-dark": "#1D4ED8",
        "accent-light": "#3B82F6",
        "accent-soft": "#EFF6FF",
        border: "rgba(37, 99, 235, 0.08)",
        success: "#15803D",
        "success-soft": "#DCFCE7",
        warning: "#C2410C",
        "warning-soft": "#FFEDD5",
        danger: "#B91C1C",
        "danger-soft": "#FEE2E2",
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
        "level-1": "3px 3px 6px rgba(148,163,184,0.16), -3px -3px 6px rgba(255,255,255,0.85)",
        "level-2": "8px 8px 16px rgba(148,163,184,0.18), -8px -8px 16px rgba(255,255,255,0.9)",
        "level-3": "14px 14px 28px rgba(148,163,184,0.20), -14px -14px 28px rgba(255,255,255,0.92)",
      },
    },
  },
  plugins: [],
};

export default config;
