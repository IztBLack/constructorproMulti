'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { alternarActivaObra, eliminarObra } from '../actions';

export default function ObraAcciones({ id, activa }: { id: string; activa: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggleActiva() {
    setLoading(true);
    setError(null);
    const result = await alternarActivaObra(id, !activa);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo actualizar la obra.');
      return;
    }
    router.refresh();
  }

  async function onEliminar() {
    if (!confirm('¿Eliminar esta obra? No podrás revertir esta acción desde aquí.')) return;
    setLoading(true);
    setError(null);
    const result = await eliminarObra(id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar la obra.');
      return;
    }
    router.push('/admin/obras');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button
        onClick={onToggleActiva}
        disabled={loading}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
      >
        {activa ? 'Marcar inactiva' : 'Marcar activa'}
      </button>
      <button
        onClick={onEliminar}
        disabled={loading}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Eliminar
      </button>
    </div>
  );
}
