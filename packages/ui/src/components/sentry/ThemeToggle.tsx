'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme-provider';
import { SentryButton } from './SentryButton';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <SentryButton
      variant="icon"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className="rounded-full"
    >
      {theme === 'light' ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </SentryButton>
  );
}
