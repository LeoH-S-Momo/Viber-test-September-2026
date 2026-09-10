'use client';

import { useEffect, useRef, useState } from 'react';

export interface StatItem {
  value: number;
  label: string;
  suffix?: string;
  decimals?: number;
}

/** Uma stat que sobe de 0 até `value` quando entra na viewport — ver StatsCounter abaixo. */
function AnimatedStat({ value, label, suffix = '', decimals = 0 }: StatItem) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // `matchMedia` em vez de depender só do CSS — sem isto o rAF ainda rodaria 1.4s de contagem
    // mesmo com a transição desabilitada visualmente, gastando ciclos à toa pra quem pediu menos
    // movimento.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        const durationMs = 1400;
        const start = performance.now();
        function tick(now: number) {
          const elapsed = now - start;
          const progress = Math.min(elapsed / durationMs, 1);
          // ease-out cubic — sobe rapido no comeco, desacelera perto do valor final.
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(value * eased);
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <p className="font-display text-4xl font-extrabold tabular-nums text-white sm:text-5xl">
        {display.toFixed(decimals)}
        {suffix}
      </p>
      <p className="mt-2 text-sm font-medium text-white/70">{label}</p>
    </div>
  );
}

export function StatsCounter({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
      {stats.map((stat) => (
        <AnimatedStat key={stat.label} {...stat} />
      ))}
    </div>
  );
}
