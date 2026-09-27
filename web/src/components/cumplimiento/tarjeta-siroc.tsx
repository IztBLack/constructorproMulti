'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import type { AvisoSiroc, EstadoSiroc } from '@/lib/cumplimiento/avisos';
import type { ObraSiroc } from '@/lib/data/cumplimiento';
import { guardarSirocAction } from '@/app/admin/cumplimiento/actions';
import { ArchivoCumplimiento } from './archivo-cumplimiento';
import { EnlaceOficial, Semaforo } from './semaforo';

const ESTADOS: { valor: EstadoSiroc; texto: string }[] = [
  { valor: 'PENDIENTE', texto: 'Falta registrarla' },
  { valor: 'REGISTRADA', texto: 'Registrada' },
  { valor: 'SUSPENDIDA', texto: 'Suspendida (incidencia avisada)' },
  { valor: 'TERMINADA', texto: 'Terminada (aviso de terminación presentado)' },
  { valor: 'NO_APLICA', texto: 'No se registra (no aplica)' },
];

const fechaInput = (ms: number | null | undefined) => (ms ? msAFechaInput(ms) : '');

/**
 * Tarjeta SIROC en el detalle de la obra (RF5.1). Arriba el aviso ("te quedan
 * N días hábiles"); abajo, para admin/contador, lo que se anota del trámite
 * que se hizo en el SIROC del IMSS. La app no registra nada por su cuenta.
 */
export function TarjetaSiroc({
  obraId,
  siroc,
  obraFechaInicio,
  aviso,
}: {
  obraId: string;
  siroc: ObraSiroc | null;
  obraFechaInicio: number | null;
  aviso: AvisoSiroc;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = await guardarSirocAction(obraId, fd);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <section aria-labelledby={`siroc-${obraId}`} className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id={`siroc-${obraId}`} className="text-sm font-medium text-neutral-700">
              Registro de obra ante el IMSS (SIROC)
            </h2>
            <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-900">
              <Semaforo nivel={aviso.nivel} />
              <span className="font-medium">{aviso.titulo}</span>
            </p>
            <p className="text-sm text-neutral-600">{aviso.detalle}</p>
            {aviso.fechaLimite && (
              <p className="text-xs text-neutral-500">
                Fecha límite: {formatDate(aviso.fechaLimite)} · cuenta de lunes a viernes sin días de
                descanso oficiales; confírmala con tu contador.
              </p>
            )}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
            {abierto ? 'Cerrar' : siroc ? 'Editar datos' : 'Anotar registro'}
          </Button>
        </div>

        {siroc && (
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-neutral-500">Número de registro</dt>
              <dd className="text-neutral-900">{siroc.numero_registro || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Inicio de trabajos</dt>
              <dd className="text-neutral-900">{formatDate(siroc.fecha_inicio_obra)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Acuse</dt>
              <dd>
                <ArchivoCumplimiento ambito="siroc" registroId={siroc.id} path={siroc.comprobante_path} etiqueta="acuse" puedeEditar />
              </dd>
            </div>
          </dl>
        )}

        {abierto && (
          <form action={guardar} className="grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2">
            <Field label="Inicio de los trabajos *" hint="Desde aquí corren los 5 días hábiles.">
              <Input
                type="date"
                name="fecha_inicio_obra"
                required
                defaultValue={fechaInput(siroc?.fecha_inicio_obra ?? obraFechaInicio)}
              />
            </Field>
            <Field label="Estado">
              <Select name="estado" defaultValue={siroc?.estado ?? 'PENDIENTE'}>
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.texto}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de registro de obra" hint="El que te da el SIROC al registrarla.">
              <Input name="numero_registro" maxLength={60} defaultValue={siroc?.numero_registro ?? ''} />
            </Field>
            <Field label="Fecha en que se registró">
              <Input type="date" name="fecha_registro" defaultValue={fechaInput(siroc?.fecha_registro)} />
            </Field>
            <Field label="Terminación de los trabajos" hint="Desde aquí corren 5 días hábiles para el aviso.">
              <Input type="date" name="fecha_terminacion" defaultValue={fechaInput(siroc?.fecha_terminacion)} />
            </Field>
            <Field label="Aviso de terminación presentado el">
              <Input type="date" name="aviso_terminacion_at" defaultValue={fechaInput(siroc?.aviso_terminacion_at)} />
            </Field>
            <Field label="Notas" className="sm:col-span-2" hint="Incidencias, quién lo tramitó, etc.">
              <Textarea name="notas" rows={2} maxLength={2000} defaultValue={siroc?.notas ?? ''} />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-red-600 sm:col-span-2">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={pendiente}>
                {pendiente ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        <EnlaceOficial clave="siroc" />
      </section>
    </Card>
  );
}
