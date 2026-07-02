import type { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-8',
};

/** Contenedor base: fondo blanco, borde neutral suave, esquinas redondeadas. */
export function Card({ children, padding = 'md', className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white ${PADDING[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/** Encabezado opcional dentro de una Card (título + descripción + acción). */
export function CardHeader({ children, className = '', ...rest }: CardSectionProps) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  children: ReactNode;
  /** Nivel de encabezado HTML a renderizar (por defecto h3). Útil para jerarquía semántica. */
  as?: 'h2' | 'h3' | 'h4';
};

export function CardTitle({ children, className = '', as = 'h3', ...rest }: CardTitleProps) {
  const Tag = as;
  return (
    <Tag className={`text-sm font-medium text-neutral-500 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
