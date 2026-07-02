import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Texto secundario alineado a la derecha del título (ej. el correo del usuario). */
  eyebrow?: string;
  actions?: ReactNode;
};

/** Encabezado estándar de página: título + descripción opcional + acciones a la derecha. */
export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        {eyebrow && <p className="text-sm text-neutral-500">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        {description && <p className="text-sm text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
