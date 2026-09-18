import type { Config } from "tailwindcss";

// Paleta GloboPac (design system v1.0, fornecido pelo usuário — ver
// C:\Users\wande\Downloads\globopac-design-system.md): navy da marca como cor dominante em
// superfícies claras, lima como acento escasso (só preenchimento sólido ou sobre fundo
// escuro). Cores estruturais (border/primary/secondary/...) continuam vivendo em variáveis
// CSS (src/index.css) para trocar sem refatorar componente; tokens literais abaixo (lime,
// down, hairline, surface.*) são valores fixos do design system que não têm um papel
// estrutural equivalente no shadcn base.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          active: "#001540",
          soft: "#f0f2f5",
          disabled: "#a6b2c9",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
          soft: "#a4a9b2",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        // Tokens literais do design system, sem variável CSS equivalente no shadcn base.
        lime: {
          DEFAULT: "#c2ef4e",
          active: "#abe80f",
          soft: "#f5fce3",
        },
        down: {
          DEFAULT: "#cf202f",
          soft: "#fae9ea",
        },
        ink: "#101726",
        hairline: "#dfe2e7",
        canvas: "#ffffff",
        surface: {
          strong: "#f1f3f6",
          soft: "#f7f8fa",
          dark: "#020f2a",
          elevated: "#12306e",
        },
        ondark: {
          DEFAULT: "#ffffff",
          soft: "#a6b2c9",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "24px",
        pill: "100px",
      },
    },
  },
  plugins: [],
} satisfies Config;
