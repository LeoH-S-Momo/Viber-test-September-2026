type Variant = 'primary' | 'secondary' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700 shadow-sm shadow-accent-900/10',
  secondary: 'bg-brand-800 text-white hover:bg-brand-900',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

/**
 * Retorna classes Tailwind em vez de um componente polimorfico — usado tanto
 * em `<button>` quanto em `<Link>` sem precisar de um wrapper `as=".."`.
 */
export function buttonVariants(options: { variant?: Variant; size?: Size; className?: string } = {}) {
  const { variant = 'primary', size = 'md', className = '' } = options;
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(' ');
}
