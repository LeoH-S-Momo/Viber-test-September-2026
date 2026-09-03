import type { ReactNode } from 'react';

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-600">
          {eyebrow}
        </p>
      )}
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
        {icon}
        {title}
      </h2>
      {description && <p className="mt-2 max-w-2xl text-slate-600">{description}</p>}
    </div>
  );
}
