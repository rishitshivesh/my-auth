'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';

interface TokenDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  masked?: boolean;
}

export function TokenDisplay({ value, masked = true, className, ...props }: TokenDisplayProps) {
  const [isMasked, setIsMasked] = React.useState(masked);
  const [copied, setCopied] = React.useState(false);

  const displayValue = isMasked
    ? value.length > 12
      ? `${value.slice(0, 8)}••••••••${value.slice(-4)}`
      : '••••••••••••'
    : value;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 bg-black/5 border border-border rounded-sm px-3.5 py-2.5 font-mono text-[12px] group transition-all',
        className
      )}
      {...props}
    >
      <code className="flex-1 text-muted-foreground select-all truncate">
        {displayValue}
      </code>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsMasked(!isMasked)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label={isMasked ? 'Reveal token' : 'Mask token'}
        >
          {isMasked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Copy token"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-accent" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
