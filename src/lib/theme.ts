export type Theme = 'light' | 'dark' | 'system';

let mediaQueryCleanup: (() => void) | null = null;

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('theme', theme);
  applyTheme(theme);
}

export function applyTheme(theme?: string): void {
  if (typeof window === 'undefined') return;

  const resolved = (theme as Theme) || getTheme();
  const html = document.documentElement;

  // Clean up any previous matchMedia listener
  if (mediaQueryCleanup) {
    mediaQueryCleanup();
    mediaQueryCleanup = null;
  }

  if (resolved === 'dark') {
    html.classList.add('dark');
  } else if (resolved === 'light') {
    html.classList.remove('dark');
  } else {
    // system mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      if (mq.matches) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    };

    apply();

    const handler = (e: MediaQueryListEvent) => {
      // Only react if still in system mode
      if (getTheme() === 'system') {
        if (e.matches) {
          html.classList.add('dark');
        } else {
          html.classList.remove('dark');
        }
      }
    };

    mq.addEventListener('change', handler);
    mediaQueryCleanup = () => mq.removeEventListener('change', handler);
  }
}
