'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Modal, PageHeader } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { Cliente, Cotizacion, EstadoCotizacion } from '@/lib/data/types';
import { CotizacionForm } from './cotizacion-form';
import {
  cambiarEstadoCotizacionAction,
  convertirCotizacionEnObraAction,
  eliminarCotizacionAction,
  enviarCotizacionAction,
} from './actions';

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
  cambiosPendientes = false,
}: {
  cotizacion: Cotizacion;
  clientes: Cliente[];
  /** True si la cotización está ACEPTADA y hubo ediciones que el cliente aún no aprueba. */
  cambiosPendientes?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [pendingBorrado, startTransitionBorrado] = useTransition();

  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  const [pendingEstado, startTransitionEstado] = useTransition();

  const estado = cotizacion.estado;

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

  function handleEnviar() {
    setErrorEstado(null);
    startTransitionEstado(async () => {
      const result = await enviarCotizacionAction(cotizacion.id);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleTransicion(nuevo: EstadoCotizacion) {
    setErrorEstado(null);
    startTransitionEstado(async () => {
      const result = await cambiarEstadoCotizacionAction(cotizacion.id, nuevo);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleConvertir() {
    setErrorEstado(null);
    startTransitionEstado(async () => {
      const result = await convertirCotizacionEnObraAction(cotizacion.id);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      if (result.obraId) {
        router.push(`/admin/obras/${result.obraId}`);
        return;
      }
      router.refresh();
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
            <Badge tone={ESTADO_TONE[estado]}>{ESTADO_LABEL[estado]}</Badge>

            {/* Acciones de estado (máquina de estados guiada) */}
            {estado === 'BORRADOR' && (
              <Button variant="primary" size="sm" disabled={pendingEstado} onClick={handleEnviar}>
                {pendingEstado ? 'Enviando…' : 'Enviar al cliente'}
              </Button>
            )}
            {estado === 'ENVIADA' && (
              <>
                <Button variant="primary" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('ACEPTADA')}>
                  Marcar aceptada
                </Button>
                <Button variant="danger" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('RECHAZADA')}>
                  Marcar rechazada
                </Button>
                <Button variant="secondary" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('BORRADOR')}>
                  Revertir a borrador
                </Button>
              </>
            )}
            {estado === 'ACEPTADA' && (
              <Button variant="primary" size="sm" disabled={pendingEstado} onClick={handleConvertir}>
                Convertir en obra
              </Button>
            )}
            {(estado === 'ACEPTADA' || estado === 'RECHAZADA') && (
              <Button variant="secondary" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('BORRADOR')}>
                Reabrir (borrador)
              </Button>
            )}

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

      {errorEstado && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorEstado}
        </p>
      )}

      {/* Indicador: el cliente aceptó, pero hay ediciones que aún no aprueba. */}
      {cambiosPendientes && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          El cliente aceptó esta cotización, pero has hecho cambios que{' '}
          <strong>aún no ha aprobado</strong>. Los verá en su portal con la opción de aprobarlos.
        </p>
      )}

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
