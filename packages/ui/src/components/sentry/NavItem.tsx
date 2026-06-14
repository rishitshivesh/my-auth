'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';

export interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  className?: string;
}

export function NavItem({ href, icon: Icon, label, className }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center h-9 px-3 gap-3 rounded-sm transition-all duration-200 relative',
        'text-muted-foreground hover:text-foreground hover:bg-black/5',
        isActive && 'text-accent-foreground bg-accent/10',
        className
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-r-full" />
      )}
      <Icon
        className={cn(
          'w-[18px] h-[18px] transition-colors',
          isActive ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground'
        )}
      />
      <span className={cn(
        'text-[12px] font-display font-medium',
        isActive && 'font-semibold'
      )}>
        {label}
      </span>
    </Link>
  );
}
