'use client';
import { useEffect, useState, useRef } from 'react';

export function useCountUp(target: number, duration = 1200, startOnView = true) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!startOnView || hasAnimated.current) return;
    const el = ref.current;
    if (!el) return;

    const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated.current) {
        hasAnimated.current = true;
        if (!motionOk) {
          setValue(target);
          return;
        }
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 4);
          setValue(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        observer.unobserve(el);
      }
    }, { threshold: 0.3 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, startOnView]);

  return { value, ref };
}
