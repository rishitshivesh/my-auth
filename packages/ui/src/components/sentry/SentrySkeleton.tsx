import { cn } from '../../lib/utils';

function SentrySkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-black/5', className)}
      {...props}
    />
  );
}

export { SentrySkeleton };

