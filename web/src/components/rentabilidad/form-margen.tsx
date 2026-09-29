'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import { guardarMargenEmpresaAction, guardarMargenObraAction } from './margen-actions';

/**
 * Formulario del margen objetivo. Con `obraId` fija el de UNA obra (vacío =
 * vuelve al de la empresa); sin él, el de la empresa (Ajustes).
 */
export function FormMargen({
  obraId,
  actual,
  margenEmpresa,
}: {
  obraId?: string;
  /** Lo guardado: el de la obra (null = sin propio) o el de la empresa. */
  actual: number | null;
  /** Para el texto de ayuda de la obra. */
  margenEmpresa?: number;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAviso(null);
    const fd = new FormData(e.currentTarget);
    const r = obraId ? await guardarMargenObraAction(obraId, fd) : await guardarMargenEmpresaAction(fd);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar.');
      return;
    }
    setAviso(r.aviso ?? 'Guardado.');
    router.refresh();
  }

  const hint = obraId
    ? `Déjalo vacío para usar el de la empresa (${margenEmpresa ?? 15} %).`
    : 'Lo mínimo que quieres ganarle a cada obra. El semáforo se pone en amarillo si la obra va abajo de esto y en rojo si va más de 5 puntos abajo.';

  return (
    <form onSubmit={guardar} className="space-y-3">
      <Field label={obraId ? 'Margen objetivo de esta obra (%)' : 'Margen objetivo (%)'} hint={hint}>
        <Input
          name="margen_objetivo"
          type="number"
          step="0.1"
          min="0"
          max="99"
          required={!obraId}
          defaultValue={actual ?? ''}
          disabled={guardando}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="text-sm text-green-800">
          {aviso}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar margen'}
      </Button>
    </form>
  );
}
