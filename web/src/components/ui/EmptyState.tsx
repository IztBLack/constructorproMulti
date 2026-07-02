import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Estado vacío estándar: ícono opcional, título, descripción y acción opcional. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 p-10 text-center">
      {icon && <div className="mb-1 text-3xl text-neutral-400" aria-hidden="true">{icon}</div>}
      <p className="text-sm font-medium text-neutral-600">{title}</p>
      {description && <p className="max-w-sm text-sm text-neutral-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
