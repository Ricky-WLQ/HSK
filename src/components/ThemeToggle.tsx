'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { getTheme, setTheme, type Theme } from '@/lib/theme';

const cycleOrder: Theme[] = ['light', 'dark', 'system'];

const icons: Record<Theme, React.ReactNode> = {
  light: <Sun className="w-4 h-4" />,
  dark: <Moon className="w-4 h-4" />,
  system: <Monitor className="w-4 h-4" />,
};

const labels: Record<Theme, string> = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System mode',
};

const bgColors: Record<Theme, string> = {
  light: 'bg-warning/15 border-warning/30 hover:bg-warning/25',
  dark: 'bg-accent/15 border-accent/30 hover:bg-accent/25',
  system: 'bg-primary-lighter border-primary-light/30 hover:bg-primary-lighter/80',
};

const iconColors: Record<Theme, string> = {
  light: 'text-warning',
  dark: 'text-accent',
  system: 'text-primary',
};

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(getTheme());
    setMounted(true);
  }, []);

  const handleClick = () => {
    const currentIndex = cycleOrder.indexOf(theme);
    const next = cycleOrder[(currentIndex + 1) % cycleOrder.length];
    setThemeState(next);
    setTheme(next);
  };

  // Avoid hydration mismatch: render a placeholder until mounted
  if (!mounted) {
    return (
      <button
        className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-card-border border-b-[4px] bg-card shadow-sm"
        aria-label="Toggle theme"
      >
        <Monitor className="w-4 h-4 opacity-0" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`group/theme w-9 h-9 flex items-center justify-center rounded-xl border-2 border-b-[4px] bg-card shadow-sm active:border-b-2 active:translate-y-0.5 transition-all duration-200 cursor-pointer ${bgColors[theme]}`}
      aria-label={labels[theme]}
      title={labels[theme]}
    >
      <span className={`transition-all duration-300 group-hover/theme:rotate-[30deg] group-hover/theme:scale-110 group-active/theme:scale-90 ${iconColors[theme]}`}>
        {icons[theme]}
      </span>
    </button>
  );
}
