import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        cairo: ['var(--font-cairo)', 'Tahoma', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec5ff',
          400: '#59a5ff',
          500: '#2f82ff',
          600: '#1a63f0',
          700: '#154fd6',
          800: '#1841ab',
          900: '#193a86',
          950: '#132352',
        },
        status: {
          ready: '#16a34a',
          watch: '#eab308',
          fault: '#dc2626',
          unknown: '#6b7280',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(16, 24, 40, 0.06), 0 1px 3px 0 rgba(16, 24, 40, 0.10)',
      },
      borderRadius: {
        xl2: '1rem',
      },
    },
  },
  plugins: [],
};

export default config;
