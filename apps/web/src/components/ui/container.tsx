import type { ComponentPropsWithoutRef } from 'react';

export function Container({
  children,
  className = '',
  ...rest
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`} {...rest}>
      {children}
    </div>
  );
}
