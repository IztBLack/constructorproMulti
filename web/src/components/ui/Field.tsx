'use client';

import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

type FieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
};

/**
 * Envuelve un input/select/textarea con su <label> y mensajes de ayuda o error.
 *
 * Accesibilidad: si `children` es un único elemento (Input, Select, Textarea o un
 * <select>/<input> nativo), Field le inyecta automáticamente `aria-invalid` y
 * `aria-describedby` (apuntando al id del mensaje de error o de la pista) sin que
 * el llamador tenga que hacer nada. El mensaje de error se anuncia con
 * `role="alert"` para lectores de pantalla. Retrocompatible: no cambia la API.
 */
export function Field({ label, children, hint, error, className = '', ...rest }: FieldProps) {
  const reactId = useId();
  const hintId = `${reactId}-hint`;
  const errorId = `${reactId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  let content = children;
  if (isValidElement(children)) {
    const child = children as ReactElement<{ 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
    const existingDescribedBy = child.props['aria-describedby'];
    content = cloneElement(child, {
      'aria-invalid': error ? true : child.props['aria-invalid'],
      'aria-describedby':
        [describedBy, existingDescribedBy].filter(Boolean).join(' ') || undefined,
    });
  }

  return (
    <label className={`block space-y-1 ${className}`} {...rest}>
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {content}
      {hint && !error && (
        <span id={hintId} className="block text-xs text-neutral-500">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

const baseInputClasses =
  'w-full rounded-lg border px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

/** Input de texto estándar del kit, server-safe (sin estado propio). */
export function Input({ invalid = false, className = '', ...rest }: InputProps) {
  return (
    <input
      className={`${baseInputClasses} ${invalid ? 'border-red-400' : 'border-neutral-300'} ${className}`}
      {...rest}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

const baseSelectClasses =
  'w-full cursor-pointer rounded-lg border px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

/** Select estándar del kit, mismo look que Input. Úsalo como children de <Field>. */
export function Select({ invalid = false, className = '', children, ...rest }: SelectProps) {
  return (
    <select
      className={`${baseSelectClasses} ${invalid ? 'border-red-400' : 'border-neutral-300'} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

const baseTextareaClasses =
  'w-full rounded-lg border px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

/** Textarea estándar del kit, mismo look que Input. Úsalo como children de <Field>. */
export function Textarea({ invalid = false, className = '', rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={`${baseTextareaClasses} ${invalid ? 'border-red-400' : 'border-neutral-300'} ${className}`}
      {...rest}
    />
  );
}
