import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const sentryButtonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-display font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm',
        ghost: 'bg-transparent border border-border text-muted-foreground hover:bg-black/5 hover:text-foreground',
        outline: 'bg-transparent border border-border text-foreground hover:bg-black/5',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
        icon: 'h-9 w-9 p-0 bg-transparent border border-border text-muted-foreground hover:bg-black/5 hover:text-foreground',
      },

      size: {
        default: 'h-[42px] px-6 py-2',
        sm: 'h-9 px-4',
        lg: 'h-12 px-8 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface SentryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof sentryButtonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

const SentryButton = React.forwardRef<HTMLButtonElement, SentryButtonProps>(
  ({ className, variant, size, asChild = false, isLoading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(sentryButtonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
SentryButton.displayName = 'SentryButton';

export { SentryButton, sentryButtonVariants };

