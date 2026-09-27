'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { msAFechaInput } from '@/lib/data/tz';
import { vigenciaRepseSugerida } from '@/lib/cumplimiento/avisos';
import { ArchivoCumplimiento } from '@/components/cumplimiento/archivo-cumplimiento';
import type { EmpresaRepse, Subcontratista, TipoDocumentoSub } from '@/lib/data/cumplimiento';
import {
  actualizarSubcontratistaAction,
  agregarDocumentoAction,
  borrarDatosImssAction,
  crearSubcontratistaAction,
  guardarDatosImssAction,
  guardarRepseAction,
  marcarObligacionAction,
  quitarDocumentoAction,
} from './actions';

const fechaInput = (ms: number | null | undefined) => (ms ? msAFechaInput(ms) : '');

function useAccion() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  function correr(fn: () => Promise<{ ok: boolean; error?: string }>, alTerminar?: () => void) {
    setError(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      alTerminar?.();
      router.refresh();
    });
  }
  return { error, pendiente, correr };
}

function MensajeError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {texto}
    </p>
  );
}

// ── REPSE propio ─────────────────────────────────────────────────────────────

export function FormRepse({ repse }: { repse: EmpresaRepse | null }) {
  const { error, pendiente, correr } = useAccion();
  const [registro, setRegistro] = useState(fechaInput(repse?.fecha_registro));
  const [vigencia, setVigencia] = useState(fechaInput(repse?.vigencia_hasta));

  function alCambiarRegistro(v: string) {
    setRegistro(v);
    // Si la vigencia está vacía, se propone a 3 años. Nunca se pisa lo escrito.
    if (v && !vigencia) {
      const [y, m, d] = v.split('-').map(Number);
      setVigencia(msAFechaInput(vigenciaRepseSugerida(Date.UTC(y, m - 1, d, 18))));
    }
  }

  return (
    <form action={(fd) => correr(() => guardarRepseAction(fd))} className="grid gap-3 sm:grid-cols-3">
      <Field label="Folio del registro">
        <Input name="folio" maxLength={60} defaultValue={repse?.folio ?? ''} placeholder="Ej. AR12345/2024" />
      </Field>
      <Field label="Fecha de registro">
        <Input type="date" name="fecha_registro" value={registro} onChange={(e) => alCambiarRegistro(e.target.value)} />
      </Field>
      <Field label="Vigente hasta" hint="3 años desde el registro. Ajústala a lo que diga tu aviso.">
        <Input type="date" name="vigencia_hasta" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
      </Field>
      <Field label="Notas" className="sm:col-span-3">
        <Textarea name="notas" rows={2} maxLength={2000} defaultValue={repse?.notas ?? ''} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar REPSE'}
        </Button>
        {repse && (
          <ArchivoCumplimiento ambito="repse" registroId={repse.id} path={repse.comprobante_path} etiqueta="aviso de registro" puedeEditar />
        )}
      </div>
      <MensajeError texto={error} />
    </form>
  );
}

// ── ICSOE / SISUB ────────────────────────────────────────────────────────────

export function BotonEntregado({
  tipo,
  periodo,
  entregado,
}: {
  tipo: 'ICSOE' | 'SISUB';
  periodo: string;
  entregado: boolean;
}) {
  const { error, pendiente, correr } = useAccion();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={entregado ? 'ghost' : 'primary'}
        disabled={pendiente}
        onClick={() => correr(() => marcarObligacionAction(tipo, periodo, !entregado))}
      >
        {pendiente ? 'Guardando…' : entregado ? 'Desmarcar' : 'Marcar entregado'}
      </Button>
      <MensajeError texto={error} />
    </span>
  );
}

// ── Subcontratistas ─────────────────────────────────────────────────────────

export function FormSubcontratista({
  sub,
  colaboradores,
  alGuardar,
}: {
  sub?: Subcontratista;
  colaboradores: { id: string; nombre: string }[];
  alGuardar?: (id?: string) => void;
}) {
  const { error, pendiente, correr } = useAccion();
  return (
    <form
      action={(fd) =>
        correr(async () => {
          if (sub) return actualizarSubcontratistaAction(sub.id, fd);
          const r = await crearSubcontratistaAction(fd);
          if (r.ok) alGuardar?.(r.data?.id);
          return r;
        })
      }
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label="Nombre o razón social *">
        <Input name="nombre" required maxLength={200} defaultValue={sub?.nombre ?? ''} />
      </Field>
      <Field label="RFC (opcional)" hint="12 caracteres si es empresa, 13 si es persona. No se consulta al SAT.">
        <Input name="rfc" maxLength={20} autoComplete="off" defaultValue={sub?.rfc ?? ''} className="uppercase" />
      </Field>
      <Field label="Especialidad">
        <Input name="especialidad" maxLength={200} defaultValue={sub?.especialidad ?? ''} placeholder="Ej. impermeabilización" />
      </Field>
      <Field label="Persona de contacto">
        <Input name="contacto" maxLength={200} defaultValue={sub?.contacto ?? ''} />
      </Field>
      <Field label="Teléfono">
        <Input name="telefono" type="tel" maxLength={40} defaultValue={sub?.telefono ?? ''} />
      </Field>
      <Field label="Correo">
        <Input name="correo" type="email" maxLength={200} defaultValue={sub?.correo ?? ''} />
      </Field>
      <Field label="También está en tu equipo" hint="Opcional: si también cobra en la raya.">
        <Select name="colaborador_id" defaultValue={sub?.colaborador_id ?? ''}>
          <option value="">— No —</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notas">
        <Textarea name="notas" rows={2} maxLength={2000} defaultValue={sub?.notas ?? ''} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : sub ? 'Guardar cambios' : 'Dar de alta'}
        </Button>
      </div>
      <MensajeError texto={error} />
    </form>
  );
}

export function NuevoSubcontratista({ colaboradores }: { colaboradores: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setAbierto(true)}>
        Nuevo subcontratista
      </Button>
    );
  }
  return (
    <div className="w-full space-y-3 rounded-lg border border-neutral-200 p-4">
      <FormSubcontratista
        colaboradores={colaboradores}
        alGuardar={(id) => {
          setAbierto(false);
          if (id) router.push(`/admin/cumplimiento/subcontratistas/${id}`);
        }}
      />
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </div>
  );
}

export function FormDocumento({
  subcontratistaId,
  tipos,
}: {
  subcontratistaId: string;
  tipos: { valor: TipoDocumentoSub; texto: string; ayuda: string }[];
}) {
  const [tipo, setTipo] = useState<TipoDocumentoSub>('REPSE');
  const { error, pendiente, correr } = useAccion();
  const ayuda = tipos.find((t) => t.valor === tipo)?.ayuda;
  return (
    <form
      action={(fd) => correr(() => agregarDocumentoAction(subcontratistaId, fd))}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label="Documento" hint={ayuda}>
        <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumentoSub)}>
          {tipos.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Folio">
        <Input name="folio" maxLength={80} />
      </Field>
      <Field label="Fecha de emisión">
        <Input type="date" name="fecha_emision" />
      </Field>
      <Field label="Vigente hasta" hint="Déjala vacía si el documento no vence.">
        <Input type="date" name="vigencia_hasta" />
      </Field>
      {tipo === 'OTRO' && (
        <Field label="¿Qué documento es?" className="sm:col-span-2">
          <Input name="descripcion" maxLength={200} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Agregar al expediente'}
        </Button>
        <p className="mt-1 text-xs text-neutral-500">Después de agregarlo, adjunta el PDF o la foto.</p>
      </div>
      <MensajeError texto={error} />
    </form>
  );
}

export function QuitarDocumento({ id }: { id: string }) {
  const { error, pendiente, correr } = useAccion();
  return (
    <span className="inline-flex flex-col">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pendiente}
        onClick={() => {
          if (window.confirm('¿Quitar este documento del expediente? Su archivo se borra.')) {
            correr(() => quitarDocumentoAction(id));
          }
        }}
      >
        Quitar
      </Button>
      <MensajeError texto={error} />
    </span>
  );
}

// ── Datos IMSS de un colaborador ────────────────────────────────────────────

export function FilaDatosImss({
  colaborador,
  datos,
}: {
  colaborador: { id: string; nombre: string };
  datos: { nss: string | null; curp: string | null; rfc: string | null; documento_path: string | null } | null;
}) {
  const { error, pendiente, correr } = useAccion();
  const tiene = Boolean(datos && (datos.nss || datos.curp || datos.rfc || datos.documento_path));
  return (
    <li className="space-y-2 rounded-lg border border-neutral-200 p-3">
      <p className="text-sm font-medium text-neutral-900">{colaborador.nombre}</p>
      <form
        action={(fd) => correr(() => guardarDatosImssAction(colaborador.id, fd))}
        className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1.1fr_auto] sm:items-end"
        autoComplete="off"
      >
        <Field label="NSS">
          <Input name="nss" inputMode="numeric" maxLength={11} defaultValue={datos?.nss ?? ''} />
        </Field>
        <Field label="CURP">
          <Input name="curp" maxLength={18} defaultValue={datos?.curp ?? ''} className="uppercase" />
        </Field>
        <Field label="RFC">
          <Input name="rfc" maxLength={13} defaultValue={datos?.rfc ?? ''} className="uppercase" />
        </Field>
        <Button type="submit" size="sm" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {tiene && (
          <ArchivoCumplimiento
            ambito="colaborador"
            registroId={colaborador.id}
            path={datos?.documento_path ?? null}
            etiqueta="documento"
            puedeEditar
          />
        )}
        {tiene && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendiente}
            onClick={() => {
              if (window.confirm(`¿Borrar el NSS, la CURP, el RFC y el documento de ${colaborador.nombre}? No se pueden recuperar.`)) {
                correr(() => borrarDatosImssAction(colaborador.id));
              }
            }}
          >
            Borrar sus datos
          </Button>
        )}
      </div>
      <MensajeError texto={error} />
    </li>
  );
}

