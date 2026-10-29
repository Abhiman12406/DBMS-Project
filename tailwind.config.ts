import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Lexend Mega', 'Plus Jakarta Sans', 'sans-serif'],
        sans: ['Public Sans', 'Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: {
          DEFAULT: '#F4F0EA',
          light: '#FAF8F5',
          dark: '#EBE5DB',
        },
        brutal: {
          yellow: '#FFE600',
          pink: '#FF6B8B',
          coral: '#FF5757',
          mint: '#4EFA8B',
          cyan: '#00F0FF',
          violet: '#C084FC',
          orange: '#FF8800',
          dark: '#121212',
        },
      },
      boxShadow: {
        'brutal-xs': '1.5px 1.5px 0px 0px #000000',
        'brutal-sm': '2px 2px 0px 0px #000000',
        brutal: '4px 4px 0px 0px #000000',
        'brutal-md': '5px 5px 0px 0px #000000',
        'brutal-lg': '6px 6px 0px 0px #000000',
        'brutal-xl': '8px 8px 0px 0px #000000',
        // Retain bento aliases mapped to Neu-Brutalist shadows for safety
        bento: '4px 4px 0px 0px #000000',
        'bento-hover': '6px 6px 0px 0px #000000',
        'glow-sky': '3px 3px 0px 0px #000000',
        'glow-emerald': '3px 3px 0px 0px #000000',
        'glow-rose': '3px 3px 0px 0px #000000',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        marquee: 'marquee 25s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
