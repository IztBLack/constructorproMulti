'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import { formatDateTime } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_CLIMA,
  ETIQUETA_TIPO,
  MAX_FOTOS,
  MAX_TEXTO,
  agruparPorDia,
  entradaAbierta,
  puedeEditarEntrada,
  textoCierre,
  type EntradaBitacora,
} from '@/lib/bitacora/bitacora';
import {
  agregarAclaracion,
  borrarEntradaBitacora,
  cambiarVisibilidadEntrada,
  quitarFoto,
} from './actions';
import { FormularioEntrada } from './formulario-entrada';
import { subirFotosEntrada } from './subir-fotos';

const TONO_TIPO = {
  AVANCE: 'green',
  INCIDENCIA: 'red',
  INSTRUCCION: 'blue',
  VISITA: 'amber',
  CLIMA: 'neutral',
  OTRO: 'neutral',
} as const;

const fmtDia = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export interface UsuarioBitacora {
  id: string;
  rol: string;
}

/** Timeline de la bitácora: días (más nuevo arriba) con sus entradas. */
export function TimelineBitacora({
  obraId,
  entradas,
  usuario,
  ahora,
  hoy,
}: {
  obraId: string;
  entradas: EntradaBitacora[];
  usuario: UsuarioBitacora;
  /** Reloj del servidor al pintar (evita diferencias al hidratar). */
  ahora: number;
  hoy: string;
}) {
  const dias = agruparPorDia(entradas);
  return (
    <ol className="space-y-8">
      {dias.map((d) => (
        <li key={d.clave} aria-labelledby={`dia-${d.clave}`}>
          <h3 id={`dia-${d.clave}`} className="mb-3 text-sm font-semibold capitalize text-neutral-900">
            {fmtDia.format(new Date(d.fecha))}
          </h3>
          <ol className="space-y-4 border-l-2 border-neutral-200 pl-4">
            {d.entradas.map((e) => (
              <li key={e.id}>
                <TarjetaEntrada obraId={obraId} entrada={e} usuario={usuario} ahora={ahora} hoy={hoy} />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function TarjetaEntrada({
  obraId,
  entrada: e,
  usuario,
  ahora,
  hoy,
}: {
  obraId: string;
  entrada: EntradaBitacora;
  usuario: UsuarioBitacora;
  ahora: number;
  hoy: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [aclarando, setAclarando] = useState(false);
  const [aclaracion, setAclaracion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const inputFotos = useRef<HTMLInputElement>(null);

  const escribe = ['admin', 'supervisor'].includes(usuario.rol);
  const abierta = entradaAbierta(e.registrada_en, ahora);
  const editable = puedeEditarEntrada(e, usuario, ahora);
  const cierre = textoCierre(e.registrada_en, ahora);

  function correr(fn: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo.');
        return;
      }
      despues?.();
      router.refresh();
    });
  }

  function agregarFotos(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(ev.target.files ?? []).slice(0, MAX_FOTOS - e.fotos.length);
    if (inputFotos.current) inputFotos.current.value = '';
    if (archivos.length === 0) return;
    setError(null);
    startTransition(async () => {
      const orden = e.fotos.reduce((m, f) => Math.max(m, f.orden + 1), 0);
      const { errores } = await subirFotosEntrada(obraId, e.id, archivos, orden);
      if (errores.length > 0) setError(errores.join(' '));
      router.refresh();
    });
  }

  if (editando) {
    return (
      <Card padding="md">
        <FormularioEntrada
          obraId={obraId}
          hoy={hoy}
          sugeridosHoy={[]}
          inicial={{ ...e, fechaInput: msAFechaInput(e.fecha) }}
          alTerminar={() => setEditando(false)}
        />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <article className="space-y-3" aria-busy={pendiente}>
        <header className="flex flex-wrap items-center gap-2">
          <Badge tone={TONO_TIPO[e.tipo]}>{ETIQUETA_TIPO[e.tipo]}</Badge>
          {e.clima && <span className="text-xs text-neutral-700">Clima: {ETIQUETA_CLIMA[e.clima]}</span>}
          {e.visible_cliente ? (
            <Badge tone="blue">La ve el cliente</Badge>
          ) : (
            <span className="text-xs text-neutral-600">Solo interna</span>
          )}
          <span className="ml-auto text-xs text-neutral-600">
            {abierta ? cierre : 'Cerrada · solo aclaraciones'}
          </span>
        </header>

        <p className="whitespace-pre-wrap text-sm text-neutral-900">{e.texto}</p>

        {(e.personal_presente !== null || e.personal_nombres.length > 0) && (
          <p className="text-xs text-neutral-700">
            <span className="font-medium">Personal: {e.personal_presente ?? e.personal_nombres.length}</span>
            {e.personal_nombres.length > 0 && ` · ${e.personal_nombres.join(', ')}`}
          </p>
        )}

        {e.fotos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Fotos de la entrada">
            {e.fotos.map((f, i) => (
              <li key={f.id} className="space-y-1">
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador */}
                    <img src={f.url} alt={`Foto ${i + 1} de la entrada`} loading="lazy" className="aspect-square w-full object-cover" />
                  </a>
                ) : (
                  <span className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-600">
                    No se pudo abrir
                  </span>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => correr(() => quitarFoto(obraId, f.id))}
                    disabled={pendiente}
                    className="min-h-11 w-full rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-neutral-600">
          Registró {e.autor_nombre || 'alguien del equipo'} · {formatDateTime(e.registrada_en)}
        </p>

        {e.aclaraciones.length > 0 && (
          <section aria-label="Aclaraciones" className="space-y-2 rounded-lg bg-amber-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Aclaraciones</h4>
            <ul className="space-y-2">
              {e.aclaraciones.map((a) => (
                <li key={a.id} className="text-sm text-neutral-900">
                  <p className="whitespace-pre-wrap">{a.texto}</p>
                  <p className="text-xs text-neutral-700">
                    {a.autor_nombre || 'Alguien del equipo'} · {formatDateTime(a.registrada_en)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {aclarando && (
          <form
            className="space-y-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              correr(
                () => agregarAclaracion(obraId, e.id, aclaracion),
                () => {
                  setAclaracion('');
                  setAclarando(false);
                },
              );
            }}
          >
            <label className="block space-y-1">
              <span className="text-sm font-medium text-neutral-700">Aclaración</span>
              <Textarea
                value={aclaracion}
                onChange={(ev) => setAclaracion(ev.target.value)}
                rows={3}
                maxLength={MAX_TEXTO}
                required
                placeholder="Ej.: Fueron 3 m³, no 4. Se corrige lo anotado."
              />
            </label>
            <p className="text-xs text-neutral-600">Una aclaración ya no se edita ni se borra.</p>
            <div className="flex gap-2">
              <Button type="submit" size="md" disabled={pendiente}>
                Guardar aclaración
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAclarando(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        {escribe && !aclarando && (
          <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
            {editable && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(true)} disabled={pendiente}>
                Editar
              </Button>
            )}
            {editable && e.fotos.length < MAX_FOTOS && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => inputFotos.current?.click()}
                  disabled={pendiente}
                >
                  {pendiente ? 'Subiendo…' : 'Agregar fotos'}
                </Button>
                <input
                  ref={inputFotos}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  multiple
                  onChange={agregarFotos}
                  className="hidden"
                  aria-label="Elegir fotos para esta entrada"
                />
              </>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={() => setAclarando(true)} disabled={pendiente}>
              Agregar aclaración
            </Button>
            {(usuario.rol === 'admin' || e.autor_id === usuario.id) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => correr(() => cambiarVisibilidadEntrada(obraId, e.id, !e.visible_cliente))}
                disabled={pendiente}
              >
                {e.visible_cliente ? 'Quitar del portal' : 'Mostrar al cliente'}
              </Button>
            )}
            {editable && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  if (window.confirm('¿Borrar esta entrada? Solo se puede mientras no pasen 24 horas.')) {
                    correr(() => borrarEntradaBitacora(obraId, e.id));
                  }
                }}
                disabled={pendiente}
              >
                Borrar
              </Button>
            )}
          </div>
        )}
      </article>
    </Card>
  );
}
