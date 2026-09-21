import animate from 'tailwindcss-animate'

/**
 * Tokens are authored as complete `oklch(...)` values in index.css, which
 * Tailwind cannot parse for alpha modifiers. Exposing them as functions lets
 * `bg-primary/10`, `border-ok/35` and friends resolve to a real `color-mix`
 * instead of silently rendering at full opacity.
 */
const token = (name) => ({ opacityValue } = {}) =>
  opacityValue === undefined || opacityValue === '' || opacityValue === 1
    ? `var(${name})`
    : `color-mix(in oklab, var(${name}) calc(${opacityValue} * 100%), transparent)`

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'selector',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        background: token('--background'),
        foreground: token('--foreground'),
        card: token('--card'),
        'card-foreground': token('--card-foreground'),
        popover: token('--popover'),
        'popover-foreground': token('--popover-foreground'),
        primary: token('--primary'),
        'primary-foreground': token('--primary-foreground'),
        secondary: token('--secondary'),
        'secondary-foreground': token('--secondary-foreground'),
        muted: token('--muted'),
        'muted-foreground': token('--muted-foreground'),
        accent: token('--accent'),
        'accent-foreground': token('--accent-foreground'),
        destructive: token('--destructive'),
        'destructive-foreground': token('--destructive-foreground'),
        border: token('--border'),
        input: token('--input'),
        ring: token('--ring'),
        'chart-1': token('--chart-1'),
        'chart-2': token('--chart-2'),
        'chart-3': token('--chart-3'),
        'chart-4': token('--chart-4'),
        'chart-5': token('--chart-5'),
        sidebar: token('--sidebar'),
        'sidebar-foreground': token('--sidebar-foreground'),
        'sidebar-primary': token('--sidebar-primary'),
        'sidebar-primary-foreground': token('--sidebar-primary-foreground'),
        'sidebar-accent': token('--sidebar-accent'),
        'sidebar-accent-foreground': token('--sidebar-accent-foreground'),
        'sidebar-border': token('--sidebar-border'),
        'sidebar-ring': token('--sidebar-ring'),
        ok: token('--ok'),
        warn: token('--warn'),
        info: token('--info'),
        seal: token('--seal')
      },
      borderRadius: {
        sm: 'calc(var(--radius) * 0.5)',
        DEFAULT: 'calc(var(--radius) * 0.65)',
        md: 'calc(var(--radius) * 0.8)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) * 1.4)',
        '2xl': 'calc(var(--radius) * 1.9)',
        '3xl': 'calc(var(--radius) * 2.4)',
        '4xl': 'calc(var(--radius) * 3)'
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' }
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 color-mix(in oklch, var(--warn) 55%, transparent)' },
          '70%': { boxShadow: '0 0 0 10px transparent' },
          '100%': { boxShadow: '0 0 0 0 transparent' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        sweep: 'sweep 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite'
      }
    }
  },
  plugins: [animate]
}
