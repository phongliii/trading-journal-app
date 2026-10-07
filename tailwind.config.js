/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#080c12',
          1: '#0d1219',
          2: '#111827',
          3: '#161f2e',
          4: '#1c2a3d',
        },
        border: {
          DEFAULT: '#1e2d42',
          strong: '#2a3f5a',
        },
        brand: {
          DEFAULT: '#00c896',
          dim:    '#009e78',
          glow:   '#00c89630',
        },
        up:   '#00c896',
        down: '#ef4444',
        warn: '#f59e0b',
        ink: {
          DEFAULT: '#e2eaf4',
          muted:   '#e2eaf4',
          faint:   '#4d6580',
        }
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      }
    }
  },
  plugins: []
}
