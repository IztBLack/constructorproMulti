'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Modal, PageHeader } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { Cliente, Cotizacion, EstadoCotizacion } from '@/lib/data/types';
import { CotizacionForm } from './cotizacion-form';
import { eliminarCotizacionAction } from './actions';

const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CONVERTIDA: 'Convertida',
};

const ESTADO_TONE: Record<EstadoCotizacion, BadgeTone> = {
  BORRADOR: 'neutral',
  ENVIADA: 'blue',
  ACEPTADA: 'green',
  RECHAZADA: 'red',
  CONVERTIDA: 'purple',
};

export function CotizacionHeader({
  cotizacion,
  clientes,
}: {
  cotizacion: Cotizacion;
  clientes: Cliente[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [pendingBorrado, startTransitionBorrado] = useTransition();

  function handleEliminar() {
    setErrorBorrado(null);
    startTransitionBorrado(async () => {
      const result = await eliminarCotizacionAction(cotizacion.id);
      if (result.error) {
        setErrorBorrado(result.error);
        return;
      }
      router.push('/admin/cotizaciones');
    });
  }

  return (
    <>
      <PageHeader
        title={cotizacion.nombre_proyecto}
        eyebrow={`Cliente: ${cotizacion.cliente}${cotizacion.ubicacion ? ` · ${cotizacion.ubicacion}` : ''}`}
        description={`Fecha: ${formatDate(cotizacion.fecha)}`}
        actions={
          <>
            <Badge tone={ESTADO_TONE[cotizacion.estado]}>{ESTADO_LABEL[cotizacion.estado]}</Badge>
            <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
              Editar
            </Button>
            {confirmandoBorrado ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">¿Eliminar cotización?</span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pendingBorrado}
                  onClick={handleEliminar}
                >
                  {pendingBorrado ? 'Eliminando…' : 'Sí, eliminar'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingBorrado}
                  onClick={() => setConfirmandoBorrado(false)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmandoBorrado(true)}>
                Eliminar
              </Button>
            )}
          </>
        }
      />

      {errorBorrado && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorBorrado}
        </p>
      )}

      <Modal open={editando} onClose={() => setEditando(false)} title="Editar cotización" size="lg">
        <CotizacionForm
          mode="editar"
          cotizacion={cotizacion}
          clientes={clientes}
          onCancelar={() => setEditando(false)}
        />
      </Modal>
    </>
  );
}
