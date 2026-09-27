'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input, Textarea } from '@/components/ui';
import { EstadoFormulario } from './estado-formulario';
import { decidirAprobacion, guardarRegla } from '@/lib/aprobaciones/actions';
import {
  TIPOS_CONFIGURABLES,
  TIPO_TEXTO,
  enlaceObjeto,
  type ReglaAprobacion,
  type SolicitudAprobacion,
} from '@/lib/aprobaciones/tipos';
import { formatCurrency, formatDateTime } from '@/lib/data/format';

/**
 * Ajustes → Visto bueno (RF6.3). Solo admin.
 *
 * Cómo leerlo: sin regla, solo tú mandas extras y emites órdenes de compra
 * (como siempre). Con regla, el equipo manda solo lo de menos del monto y lo de
 * más te llega aquí para que lo apruebes. Lo decide la base, no esta pantalla.
 */
export function SeccionAprobaciones({
  reglas,
  pendientes,
}: {
  reglas: ReglaAprobacion[];
  pendientes: SolicitudAprobacion[];
}) {
  return (
    <>
      {TIPOS_CONFIGURABLES.map((t) => (
        <FormRegla key={t.tipo} tipo={t.tipo} titulo={t.titulo} quien={t.quien} regla={reglas.find((r) => r.tipo === t.tipo)} />
      ))}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h3">Esperan tu visto bueno</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">
              {pendientes.length === 0
                ? 'No hay nada pendiente.'
                : `${pendientes.length} ${pendientes.length === 1 ? 'solicitud' : 'solicitudes'}. Revísala antes de decidir.`}
            </p>
          </div>
        </CardHeader>
        {pendientes.length > 0 && (
          <ul className="divide-y divide-neutral-100">
            {pendientes.map((s) => (
              <Solicitud key={s.id} s={s} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function FormRegla({
  tipo,
  titulo,
  quien,
  regla,
}: {
  tipo: string;
  titulo: string;
  quien: string;
  regla?: ReglaAprobacion;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const idMonto = `monto-${tipo}`;
  const idActiva = `activa-${tipo}`;

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);
    const fd = new FormData(e.currentTarget);
    fd.set('tipo', tipo);
    const r = await guardarRegla(fd);
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar.');
      return;
    }
    setAviso('Listo. Aplica desde ahora.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">{titulo}</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            {regla?.activa
              ? `${quien} Lo de ${formatCurrency(regla.monto_minimo)} o más necesita tu visto bueno.`
              : 'Sin regla: solo tú los mandas. Si prendes la regla, el equipo manda solo lo chico.'}
          </p>
        </div>
      </CardHeader>
      <form onSubmit={alEnviar} className="space-y-4">
        <Field label="Necesita visto bueno desde (pesos)" htmlFor={idMonto} hint={quien}>
          <Input
            id={idMonto}
            name="monto_minimo"
            inputMode="decimal"
            defaultValue={regla ? String(regla.monto_minimo) : '20000'}
            disabled={cargando}
            required
          />
        </Field>
        <label htmlFor={idActiva} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-neutral-900">
          <input
            id={idActiva}
            type="checkbox"
            name="activa"
            defaultChecked={regla?.activa ?? false}
            disabled={cargando}
            className="h-5 w-5 rounded border-neutral-400"
          />
          Usar esta regla
        </label>
        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="exito" mensaje={aviso} />
        <Button type="submit" disabled={cargando}>
          {cargando ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Card>
  );
}

function Solicitud({ s }: { s: SolicitudAprobacion }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const enlace = enlaceObjeto(s);

  async function decidir(aprobar: boolean, motivo = '') {
    setCargando(true);
    setError(null);
    const fd = new FormData();
    fd.set('id', s.id);
    fd.set('aprobar', aprobar ? '1' : '0');
    fd.set('motivo', motivo);
    const r = await decidirAprobacion(fd);
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo.');
      return;
    }
    router.refresh();
  }

  return (
    <li className="space-y-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium text-neutral-900">
            {TIPO_TEXTO[s.tipo]} por {formatCurrency(s.monto)}
          </p>
          <p className="text-neutral-600">
            Lo pidió {s.solicitado_nombre || 'alguien del equipo'} · {formatDateTime(s.solicitado_en)}
          </p>
          {enlace && (
            <Link href={enlace} className="text-blue-700 underline">
              Revisarlo
            </Link>
          )}
        </div>
        {!rechazando && (
          <div className="flex gap-2">
            <Button size="sm" disabled={cargando} onClick={() => decidir(true)}>
              Aprobar
            </Button>
            <Button size="sm" variant="secondary" disabled={cargando} onClick={() => setRechazando(true)}>
              No aprobar
            </Button>
          </div>
        )}
      </div>
      {rechazando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            decidir(false, String(new FormData(e.currentTarget).get('motivo') ?? ''));
          }}
          className="space-y-2"
        >
          <Field label="¿Por qué no?" htmlFor={`motivo-${s.id}`} hint="Lo lee quien lo pidió.">
            <Textarea id={`motivo-${s.id}`} name="motivo" required maxLength={1000} rows={2} disabled={cargando} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="danger" disabled={cargando}>
              No aprobar
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={cargando} onClick={() => setRechazando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      <EstadoFormulario tono="error" mensaje={error} />
    </li>
  );
}
