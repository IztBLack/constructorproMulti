'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { solicitarAprobacion } from '@/lib/aprobaciones/actions';
import type { TipoAprobacion } from '@/lib/data/aprobaciones';

/**
 * "Pedir visto bueno" para quien arma un extra o una orden de compra y no la
 * puede mandar solo (RF6.3). La base calcula el monto y decide si hace falta.
 */
export function PedirVistoBueno({ tipo, objetoId }: { tipo: TipoAprobacion; objetoId: string }) {
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function pedir() {
    setError(null);
    setAviso(null);
    start(async () => {
      const r = await solicitarAprobacion(tipo, objetoId);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo pedir el visto bueno.');
        return;
      }
      if (r.sinRegla) setAviso('Tu empresa no tiene regla de visto bueno: esto lo manda el administrador. Avísale.');
      else if (!r.necesaria) setAviso('No necesita visto bueno: ya lo puedes mandar.');
      else setAviso('Listo: el administrador lo verá en Ajustes → Visto bueno. Cuando lo apruebe, ya lo puedes mandar.');
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="secondary" disabled={pendiente} onClick={pedir}>
        {pendiente ? 'Pidiendo…' : 'Pedir visto bueno'}
      </Button>
      <EstadoFormulario tono="error" mensaje={error} />
      <EstadoFormulario tono="info" mensaje={aviso} />
    </div>
  );
}
