import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        burgundy: { DEFAULT: '#401827', deep: '#28121D' },
        gold: { DEFAULT: '#C6A46A', soft: '#F3EBDB' },
        canvas: '#F7F5F1',
        surface: { DEFAULT: '#FFFFFF', 2: '#F0ECE6' },
        ink: { DEFAULT: '#242124', soft: '#777078' },
        line: '#E9E4DE',
        success: { DEFAULT: '#21845A', soft: '#E4F3EB' },
        warning: { DEFAULT: '#D99A35', soft: '#FBF0DC' },
        danger: { DEFAULT: '#C94B4B', soft: '#F9E5E5' },
        info: { DEFAULT: '#477BC4', soft: '#E6EEF9' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      boxShadow: {
        card: '0 1px 2px rgba(40,18,29,0.04), 0 1px 1px rgba(40,18,29,0.03)',
        pop: '0 12px 32px rgba(40,18,29,0.14)',
      },
    },
  },
  plugins: [],
};
export default config;
