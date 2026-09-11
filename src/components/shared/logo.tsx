'use client';

interface LogoProps {
  variant?: 'white' | 'dark';
  className?: string;
}

export function Logo({ variant = 'white', className }: LogoProps) {
  const multiColor = variant === 'white' ? 'text-white' : 'text-foreground';
  const w2Color = variant === 'white' ? 'text-white' : 'text-primary';

  return (
    <span className={className} aria-label="MultiW2">
      <span className={`font-sans text-lg tracking-wide font-normal ${multiColor}`}>
        Multi
      </span>
      <span className={`font-sans text-lg tracking-wide font-semibold ${w2Color}`}>
        W2
      </span>
    </span>
  );
}
