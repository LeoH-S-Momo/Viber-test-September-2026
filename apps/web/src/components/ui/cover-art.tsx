import { Ship } from 'lucide-react';

const GRADIENTS = [
  'from-brand-700 via-brand-600 to-cyan-500',
  'from-accent-700 via-accent-600 to-amber-400',
  'from-brand-900 via-brand-700 to-brand-400',
  'from-indigo-800 via-brand-600 to-cyan-400',
];

/** Escolhe um gradiente estavel a partir do titulo — o mesmo cruzeiro sempre gera o mesmo visual. */
function gradientFor(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length] ?? 'from-brand-700 via-brand-600 to-cyan-500';
}

/**
 * Sem upload de imagem implementado ainda (ver docs/product/BACKLOG.md), os
 * cruzeiros de demonstracao nao tem `coverImageUrl`. Em vez de um icone de
 * imagem quebrada, mostra um gradiente + padrao de ondas consistente por
 * cruzeiro — parece intencional, nao "faltando".
 */
export function CoverArt({
  imageUrl,
  seed,
  title,
  className = '',
}: {
  imageUrl?: string | null;
  seed: string;
  title: string;
  className?: string;
}) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- URLs externas arbitrarias, sem loader configurado
    return <img src={imageUrl} alt={title} className={`object-cover ${className}`} />;
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${gradientFor(seed)} ${className}`}
    >
      <svg
        className="absolute inset-0 h-full w-full opacity-20"
        viewBox="0 0 200 200"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 140 Q 25 120 50 140 T 100 140 T 150 140 T 200 140 V200 H0 Z"
          fill="white"
        />
        <path
          d="M0 165 Q 25 150 50 165 T 100 165 T 150 165 T 200 165 V200 H0 Z"
          fill="white"
          opacity="0.6"
        />
      </svg>
      <Ship className="relative h-10 w-10 text-white/70" aria-hidden="true" />
    </div>
  );
}
