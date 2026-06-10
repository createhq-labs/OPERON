import type { Config } from "tailwindcss";
import type { PluginAPI } from "tailwindcss/types/config";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/renderers/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/admin/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Satoshi", "sans-serif"],
        heading: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      fontSize: {
        xs:   ["var(--text-xs)",   { lineHeight: "1.5" }],
        sm:   ["var(--text-sm)",   { lineHeight: "1.5" }],
        base: ["var(--text-base)", { lineHeight: "1.6" }],
        lg:   ["var(--text-lg)",   { lineHeight: "1.5" }],
        xl:   ["var(--text-xl)",   { lineHeight: "1.4" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.3" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "1.25" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "1.2" }],
        "5xl": ["var(--text-5xl)", { lineHeight: "1.1" }],
        "6xl": ["var(--text-6xl)", { lineHeight: "1" }],
      },
      colors: {
        bg: {
          base:        "var(--color-bg-base)",
          surface:     "var(--color-bg-surface)",
          "surface-alt": "var(--color-bg-surface-alt)",
          elevated:    "var(--color-bg-elevated)",
          overlay:     "var(--color-bg-overlay)",
        },
        text: {
          primary:   "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted:     "var(--color-text-muted)",
          inverse:   "var(--color-text-inverse)",
        },
        border: {
          default: "var(--color-border-default)",
          subtle:  "var(--color-border-subtle)",
          strong:  "var(--color-border-strong)",
        },
        accent: {
          gold:    "var(--color-accent-gold)",
          primary: "var(--color-accent-primary)",
        },
        interactive: {
          hover:  "var(--color-hover-bg)",
          active: "var(--color-active-bg)",
          focus:  "var(--color-focus-ring)",
        },
        status: {
          success: "var(--color-success)",
          warning: "var(--color-warning)",
          error:   "var(--color-error)",
          info:    "var(--color-info)",
        },
      },
      spacing: {
        "1":  "var(--space-1)",
        "2":  "var(--space-2)",
        "3":  "var(--space-3)",
        "4":  "var(--space-4)",
        "5":  "var(--space-5)",
        "6":  "var(--space-6)",
        "8":  "var(--space-8)",
        "10": "var(--space-10)",
        "12": "var(--space-12)",
        "16": "var(--space-16)",
        "20": "var(--space-20)",
        "24": "var(--space-24)",
        "32": "var(--space-32)",
        "40": "var(--space-40)",
      },
      borderRadius: {
        sm:   "var(--radius-sm)",
        md:   "var(--radius-md)",
        lg:   "var(--radius-lg)",
        xl:   "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm:            "var(--shadow-sm)",
        md:            "var(--shadow-md)",
        lg:            "var(--shadow-lg)",
        xl:            "var(--shadow-xl)",
        card:          "var(--shadow-card)",
        "input-focus": "var(--shadow-input-focus)",
      },
      transitionDuration: {
        fast:   "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow:   "var(--duration-slow)",
        slower: "var(--duration-slower)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        spring:   "var(--ease-spring)",
        out:      "var(--ease-out)",
        in:       "var(--ease-in)",
      },
      animation: {
        "fade-in":  "fadeIn var(--duration-normal) var(--ease-standard) forwards",
        "slide-up": "slideUp var(--duration-normal) var(--ease-standard) forwards",
        "slide-down": "slideDown var(--duration-normal) var(--ease-standard) forwards",
        shimmer: "shimmer 1.6s linear infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
    },
  },
  plugins: [
    function ({ addComponents }: PluginAPI) {
      addComponents({
        ".glass-card": {
          background:   "rgba(255, 255, 255, 0.02)",
          backdropFilter: "blur(12px)",
          borderWidth:  "1px",
          borderColor:  "var(--color-border-default)",
          borderRadius: "var(--radius-xl)",
          transition:   "all 200ms var(--ease-standard)",
        },
        ".glass-hero": {
          background:   "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01))",
          backdropFilter: "blur(12px)",
          borderWidth:  "1px",
          borderColor:  "var(--color-border-default)",
          borderRadius: "var(--radius-xl)",
        },
        ".btn-primary": {
          display:         "inline-flex",
          alignItems:      "center",
          justifyContent:  "center",
          paddingInline:   "1.5rem",
          paddingBlock:    "0.75rem",
          borderRadius:    "var(--radius-full)",
          fontWeight:      "500",
          color:           "#ffffff",
          background:      "rgba(255, 255, 255, 0.08)",
          backdropFilter:  "blur(8px)",
          borderWidth:     "1px",
          borderColor:     "rgba(255, 255, 255, 0.1)",
          transition:      "all 200ms var(--ease-standard)",
          "&:hover":  { transform: "scale(1.02)" },
          "&:active": { transform: "scale(0.98)" },
        },
        ".btn-ghost": {
          display:        "inline-flex",
          alignItems:     "center",
          justifyContent: "center",
          paddingInline:  "1.5rem",
          paddingBlock:   "0.75rem",
          borderRadius:   "var(--radius-full)",
          fontWeight:     "500",
          color:          "#ffffff",
          transition:     "all 200ms var(--ease-standard)",
          "&:hover": {
            background: "rgba(255, 255, 255, 0.06)",
          },
        },
      });
    },
  ],
};

export default config;