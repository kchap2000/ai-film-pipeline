import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          navy:   "#0B1C2D",
          mid:    "#142B44",
          steel:  "#2C4F73",
          orange: "#FF8A2A",
          glow:   "#FFB25C",
          cyan:   "#4CC9F0",
          white:  "#F5F7FA",
          gray:   "#9BA4B5",
        },
      },
      fontFamily: {
        sans: ["Inter", "DM Sans", "Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
