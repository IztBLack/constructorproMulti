'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { CatalogoConcepto } from '@/lib/data/types';
import { eliminarConcepto } from './actions';
import EditarConceptoForm from './editar-concepto-form';

export default function TablaConceptos({ conceptos }: { conceptos: CatalogoConcepto[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtrados = conceptos.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.clave ?? '').toLowerCase().includes(q) ||
      c.descripcion.toLowerCase().includes(q) ||
      (c.categoria ?? '').toLowerCase().includes(q)
    );
  });

  async function onEliminar(id: string) {
    if (!confirm('¿Eliminar este concepto del catálogo?')) return;
    setEliminandoId(id);
    setError(null);
    const result = await eliminarConcepto(id);
    setEliminandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar el concepto.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Buscar por clave, descripción o categoría…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      {filtrados.length === 0 ? (
        <EmptyState
          title={conceptos.length === 0 ? 'Aún no hay conceptos en el catálogo.' : 'Sin resultados para tu búsqueda.'}
          description={
            conceptos.length === 0
              ? 'Usa el botón “Nuevo concepto” para crear el primero.'
              : undefined
          }
        />
      ) : (
        <TableContainer>
          <THead>
            <Th>Clave</Th>
            <Th>Descripción</Th>
            <Th>Categoría</Th>
            <Th>Unidad</Th>
            <Th className="text-right">Precio unitario</Th>
            <Th className="text-right">Acciones</Th>
          </THead>
          <TBody>
            {filtrados.map((c) =>
              editandoId === c.id ? (
                <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                  <td colSpan={6} className="px-4 py-4">
                    <EditarConceptoForm
                      concepto={c}
                      onDone={() => setEditandoId(null)}
                      onCancel={() => setEditandoId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <Tr key={c.id}>
                  <Td>{c.clave || '—'}</Td>
                  <Td className="font-medium text-neutral-900">
                    {c.descripcion}
                    {c.es_personalizado && (
                      <Badge tone="blue" className="ml-2">
                        Personalizado
                      </Badge>
                    )}
                  </Td>
                  <Td>{c.categoria || '—'}</Td>
                  <Td>{c.unidad || '—'}</Td>
                  <Td className="text-right">{formatCurrency(c.precio_unitario_default)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditandoId(c.id)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={eliminandoId === c.id}
                        onClick={() => onEliminar(c.id)}
                      >
                        {eliminandoId === c.id ? 'Eliminando…' : 'Eliminar'}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ),
            )}
          </TBody>
        </TableContainer>
      )}
    </div>
  );
}
