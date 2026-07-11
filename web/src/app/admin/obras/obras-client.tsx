'use client';

import { useState } from 'react';
import { Button, LinkButton, PageHeader } from '@/components/ui';
import type { Obra } from '@/lib/data/types';
import NuevaObraForm from './nueva-obra-form';
import BuscadorObras from './buscador-obras';

interface ObrasClientProps {
  obras: Obra[];
  error?: string | null;
}

/**
 * Envuelve el encabezado y el buscador de obras en un client component para
 * elevar el estado del modal "Nueva obra": así el botón del header y el
 * estado vacío del buscador abren el mismo modal en vez de duplicar lógica
 * o navegar a un sitio muerto.
 */
export default function ObrasClient({ obras, error }: ObrasClientProps) {
  const [nuevaObraAbierta, setNuevaObraAbierta] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Obras"
        description="Gestiona las obras activas e inactivas de tu empresa."
        actions={
          <div className="flex items-center gap-3">
            <LinkButton href="/admin/obras/importar" variant="secondary">
              Importar de Excel
            </LinkButton>
            <Button onClick={() => setNuevaObraAbierta(true)}>+ Nueva obra</Button>
          </div>
        }
      />

      <NuevaObraForm open={nuevaObraAbierta} onOpenChange={setNuevaObraAbierta} />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las obras: {error}
        </p>
      )}

      {!error && (
        <BuscadorObras obras={obras} onNuevaObra={() => setNuevaObraAbierta(true)} />
      )}
    </div>
  );
}
