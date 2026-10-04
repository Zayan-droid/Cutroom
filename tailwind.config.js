/** @type {import('tailwindcss').Config} */

// Every color is a theme token (see src/index.css): light "paper" is the
// default, dark is a warm graphite. Channels are stored as "R G B" so opacity
// modifiers like `bg-ink/10` keep working.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: token('paper'), // page
        sheet: token('sheet'), // panels
        well: token('well'), // media surround, insets
        field: token('field'), // text inputs
        ink: token('ink'), // primary text, strong rules
        'ink-2': token('ink-2'), // secondary text
        'ink-3': token('ink-3'), // tertiary text (still 4.5:1)
        edge: token('edge'), // control boundaries (3:1)
        rule: token('rule'), // hairline dividers
        mark: token('mark'), // the one accent: actions + selection
        'on-mark': token('on-mark'),
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
      },
      fontFamily: {
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        text: ['Newsreader', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
        lg: '6px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
};
