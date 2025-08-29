import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      fontFamily: {
        'pixel': ['var(--font-press-start)', 'monospace'],
        'retro': ['var(--font-vt323)', 'monospace'],
        'tech': ['var(--font-share-tech-mono)', 'monospace'],
        'cosmic': ['var(--font-space-grotesk)', 'sans-serif'],
        'sans': ['var(--font-space-grotesk)', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: "class",
};
export default config;
