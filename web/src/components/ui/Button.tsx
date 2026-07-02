import type { ButtonHTMLAttributes } from 'react';
import Link, { type LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-neutral-900 text-white hover:bg-neutral-700 disabled:hover:bg-neutral-900',
  secondary: 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100 bg-white',
  ghost: 'text-neutral-600 hover:bg-neutral-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium outline-none transition cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Construye las clases del botón; útil para reutilizar el look del botón en otros elementos (ej. Link). */
export function buttonClassName(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** Botón base del kit. Usa variantes en lugar de clases sueltas para mantener consistencia visual. */
export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: ButtonProps) {
  return <button className={buttonClassName(variant, size, className)} {...rest} />;
}

type LinkButtonProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
  };

/** Mismo look que Button, pero renderiza un next/link para navegación entre páginas. */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonClassName(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
