'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface AnimateInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section';
}

export function AnimateIn({ children, className, delay = 0, as: Tag = 'div' }: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const reveal = useCallback(() => setVisible(true), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!motionOk) {
            // No animation — show immediately via rAF to satisfy lint
            requestAnimationFrame(reveal);
          } else if (delay > 0) {
            setTimeout(reveal, delay);
          } else {
            requestAnimationFrame(reveal);
          }
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, reveal]);

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn(
        'transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className
      )}
    >
      {children}
    </Tag>
  );
}
