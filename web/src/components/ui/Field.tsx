import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';

type FieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
};

/** Envuelve un input/select/textarea con su <label> y mensajes de ayuda o error. */
export function Field({ label, children, hint, error, className = '', ...rest }: FieldProps) {
  return (
    <label className={`block space-y-1 ${className}`} {...rest}>
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-neutral-400">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

const baseInputClasses =
  'w-full rounded-lg border px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

/** Input de texto estándar del kit, server-safe (sin estado propio). */
export function Input({ invalid = false, className = '', ...rest }: InputProps) {
  return (
    <input
      className={`${baseInputClasses} ${invalid ? 'border-red-400' : 'border-neutral-300'} ${className}`}
      {...rest}
    />
  );
}
