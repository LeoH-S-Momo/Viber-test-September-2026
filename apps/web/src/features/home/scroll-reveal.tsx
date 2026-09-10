'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fade + slide-up quando o elemento entra na viewport (ver .scroll-reveal em globals.css).
 * `threshold` baixo (0.15) — dispara um pouco antes do elemento ficar 100% visivel, senao a
 * animacao "ainda esta rolando" quando o usuario ja parou de rolar. Desconecta o observer depois
 * do primeiro reveal (nunca some de novo ao rolar pra cima, seria mais confuso que agradavel).
 */
export function ScrollReveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${isVisible ? 'is-visible' : ''} ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
