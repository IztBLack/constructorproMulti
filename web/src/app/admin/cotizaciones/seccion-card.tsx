'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, TBody, TableContainer, Td, Th, THead, Tr } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Partida, Seccion } from '@/lib/data/types';
import { actualizarSeccionAction, eliminarPartidaAction, eliminarSeccionAction } from './actions';
import { PartidaForm } from './partida-form';

type SeccionConPartidas = Seccion & { partidas: Partida[] };

export function SeccionCard({
  seccion,
  cotizacionId,
}: {
  seccion: SeccionConPartidas;
  cotizacionId: string;
}) {
  const router = useRouter();
  const [renombrando, setRenombrando] = useState(false);
  const [agregandoPartida, setAgregandoPartida] = useState(false);
  const [editandoPartidaId, setEditandoPartidaId] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [confirmandoBorradoPartidaId, setConfirmandoBorradoPartidaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRenombrar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await actualizarSeccionAction(seccion.id, cotizacionId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      setRenombrando(false);
    });
  }

  function handleEliminarSeccion() {
    setError(null);
    startTransition(async () => {
      const result = await eliminarSeccionAction(seccion.id, cotizacionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleEliminarPartida(partidaId: string) {
    setError(null);
    startTransition(async () => {
      const result = await eliminarPartidaAction(partidaId, cotizacionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const siguienteOrden = seccion.partidas.length;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        {renombrando ? (
          <form action={handleRenombrar} className="flex flex-1 items-center gap-2">
            <Input name="nombre" defaultValue={seccion.nombre} required disabled={pending} className="max-w-xs" />
            <input type="hidden" name="orden" value={seccion.orden} />
            <Button type="submit" size="sm" disabled={pending}>
              Guardar
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setRenombrando(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <h3 className="text-sm font-semibold text-neutral-800">{seccion.nombre}</h3>
        )}

        {!renombrando && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRenombrando(true)}>
              Renombrar
            </Button>
            {confirmandoBorrado ? (
              <>
                <span className="text-xs text-neutral-500">¿Eliminar sección y sus partidas?</span>
                <Button variant="danger" size="sm" disabled={pending} onClick={handleEliminarSeccion}>
                  Sí, eliminar
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmandoBorrado(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmandoBorrado(true)}>
                Eliminar sección
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>
      )}

      {seccion.partidas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-400">Sin partidas en esta sección.</p>
      ) : (
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>Clave</Th>
            <Th>Descripción</Th>
            <Th className="text-right">Cantidad</Th>
            <Th>Unidad</Th>
            <Th className="text-right">P. unitario</Th>
            <Th className="text-right">Importe</Th>
            <Th className="text-right">Acciones</Th>
          </THead>
          <TBody>
            {seccion.partidas.map((p) =>
              editandoPartidaId === p.id ? (
                <tr key={p.id}>
                  <td colSpan={7} className="p-3">
                    <PartidaForm
                      mode="editar"
                      partida={p}
                      cotizacionId={cotizacionId}
                      onListo={() => setEditandoPartidaId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <Tr key={p.id}>
                  <Td>{p.clave || '—'}</Td>
                  <Td className="text-neutral-700">{p.descripcion}</Td>
                  <Td className="text-right">{p.cantidad}</Td>
                  <Td>{p.unidad || '—'}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(p.precio_unitario)}</Td>
                  <Td className="text-right font-medium tabular-nums text-neutral-900">
                    {formatCurrency(p.cantidad * p.precio_unitario)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {confirmandoBorradoPartidaId === p.id ? (
                        <>
                          <span className="text-xs text-neutral-500">¿Eliminar partida?</span>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              setConfirmandoBorradoPartidaId(null);
                              handleEliminarPartida(p.id);
                            }}
                          >
                            Sí, eliminar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirmandoBorradoPartidaId(null)}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEditandoPartidaId(p.id)}>
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirmandoBorradoPartidaId(p.id)}
                          >
                            Eliminar
                          </Button>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              ),
            )}
          </TBody>
        </TableContainer>
      )}

      <div className="border-t border-neutral-100 p-4">
        {agregandoPartida ? (
          <PartidaForm
            mode="crear"
            seccionId={seccion.id}
            cotizacionId={cotizacionId}
            siguienteOrden={siguienteOrden}
            onListo={() => setAgregandoPartida(false)}
          />
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setAgregandoPartida(true)}>
            + Agregar partida
          </Button>
        )}
      </div>
    </div>
  );
}
