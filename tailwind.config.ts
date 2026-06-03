import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-syne)", "sans-serif"],
        sans: ["var(--font-dm-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        primary: {
          DEFAULT: "#f97316",
          hover: "#fb923c",
          muted: "#f9731614",
          soft: "#f973161a",
        },
        secondary: {
          DEFAULT: "#7c3aed",
          hover: "#8b5cf6",
          muted: "#7c3aed22",
          soft: "#7c3aed15",
        },
        success: {
          DEFAULT: "#22c55e",
          muted: "#22c55e22",
          soft: "#22c55e15",
        },
        warning: {
          DEFAULT: "#f59e0b",
          muted: "#f59e0b22",
          soft: "#f59e0b15",
        },
        danger: {
          DEFAULT: "#ef4444",
          muted: "#ef444422",
          soft: "#ef444415",
        },
        info: {
          DEFAULT: "#38bdf8",
          muted: "#38bdf822",
          soft: "#38bdf815",
        },
        surface: {
          DEFAULT: "#121827",
          soft: "#161c2f",
          muted: "#0f172a",
          elevated: "#171d2b",
        },
        bg: {
          primary: "#05070d",
          secondary: "#10131f",
          tertiary: "#141b29",
          panel: "#111624",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.12)",
          subtle: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.16)",
        },
        content: {
          primary: "#f8fafc",
          secondary: "#a6accd",
          tertiary: "#7b8296",
          disabled: "#5a6076",
        },
      },
      borderRadius: {
        sm: "10px",
        DEFAULT: "18px",
        md: "20px",
        lg: "24px",
        xl: "28px",
      },
      boxShadow: {
        soft: "0 24px 60px rgba(0, 0, 0, 0.18)",
        card: "0 18px 48px rgba(0, 0, 0, 0.14)",
        glow: "0 0 40px rgba(249, 115, 22, 0.14)",
      },
      animation: {
        "fade-in": "fadeIn 0.32s ease forwards",
        "slide-up": "slideUp 0.36s cubic-bezier(0.25, 0.8, 0.25, 1) forwards",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;