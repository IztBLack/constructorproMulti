'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { comprimirFoto } from '@/lib/imagen/comprimir';
import { formatDate } from '@/lib/data/format';
import type { Incidente } from '@/lib/data/seguridad';
import {
  ATENCIONES,
  ETIQUETA_ATENCION,
  ETIQUETA_CORTA_TIPO,
  ETIQUETA_LESION,
  ETIQUETA_PARTE,
  ETIQUETA_TIPO_INCIDENTE,
  MAX_NOTA_SALUD,
  PARTES_CUERPO,
  TIPOS_INCIDENTE,
  TIPOS_LESION,
  URL_TRAMITE_ST7,
  avisoPendiente,
  type TipoIncidente,
} from '@/lib/seguridad/incidentes';
import {
  borrarIncidente,
  crearUrlSubidaComprobante,
  guardarIncidente,
  guardarSalud,
  marcarAvisoImss,
  registrarComprobante,
  urlComprobante,
} from './actions';

const TONO_TIPO: Record<TipoIncidente, 'red' | 'amber' | 'blue'> = {
  ACCIDENTE: 'red',
  CASI_ACCIDENTE: 'amber',
  CONDICION_INSEGURA: 'blue',
};

const CAMPO = 'mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900';

function msAInput(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(ms));
}

/** Recordatorio del aviso al IMSS. La app no se conecta al IMSS: solo recuerda. */
export function RecordatorioSt7() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Registra el aviso de accidente de trabajo ante el IMSS (formato ST-7).</p>
      <p className="mt-1">
        El trabajador lo tramita en Salud en el Trabajo de su Unidad de Medicina Familiar y tú, como
        patrón, firmas el formato. La Ley del Seguro Social (art. 51) te obliga a dar el aviso: hazlo
        cuanto antes y confirma el plazo con tu contador. Esta app no se conecta al IMSS; aquí solo
        guardas que ya lo hiciste.
      </p>
      <a
        href={URL_TRAMITE_ST7}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center font-medium underline"
      >
        Ver el trámite oficial en imss.gob.mx (IMSS-03-008)
      </a>
    </div>
  );
}

// ── Formulario de alta/edición ──────────────────────────────────────────────

function FormIncidente({
  obraId,
  hoy,
  colaboradores,
  inicial,
  alTerminar,
}: {
  obraId: string;
  hoy: string;
  colaboradores: { id: string; nombre: string }[];
  inicial: Incidente | null;
  alTerminar: () => void;
}) {
  const [id] = useState(() => inicial?.id ?? crypto.randomUUID());
  const [fecha, setFecha] = useState(inicial ? msAInput(inicial.fecha) : hoy);
  const [tipo, setTipo] = useState<TipoIncidente>(inicial?.tipo ?? 'CASI_ACCIDENTE');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [acciones, setAcciones] = useState(inicial?.acciones ?? '');
  const [colaboradorId, setColaboradorId] = useState(inicial?.colaborador_id ?? '');
  const [dias, setDias] = useState(inicial?.dias_incapacidad?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const diasNum = tipo === 'ACCIDENTE' && dias.trim() !== '' ? Number(dias) : null;
    iniciar(async () => {
      const r = await guardarIncidente(obraId, {
        id,
        fecha,
        tipo,
        descripcion,
        acciones,
        colaboradorId: colaboradorId || null,
        diasIncapacidad: diasNum,
      });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else alTerminar();
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-neutral-700">Día</span>
          <input type="date" required value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-neutral-700">¿Qué fue?</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidente)} className={CAMPO}>
            {TIPOS_INCIDENTE.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_INCIDENTE[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium text-neutral-700">Qué pasó</span>
        <textarea
          required
          rows={3}
          maxLength={2000}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-neutral-500">
          Cuenta cómo pasó, no la lesión: los datos de salud los anota aparte el administrador.
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-neutral-700">¿A quién le pasó? (opcional)</span>
          <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className={CAMPO}>
            <option value="">Nadie en particular</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
            {inicial?.colaborador_id && !colaboradores.some((c) => c.id === inicial.colaborador_id) && (
              <option value={inicial.colaborador_id}>{inicial.colaborador_nombre ?? 'Colaborador'}</option>
            )}
          </select>
        </label>
        {tipo === 'ACCIDENTE' && (
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Días de incapacidad (si ya se saben)</span>
            <input
              type="number"
              min={0}
              max={3650}
              inputMode="numeric"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              className={CAMPO}
            />
          </label>
        )}
      </div>
      <label className="block text-sm">
        <span className="font-medium text-neutral-700">Qué se hizo para que no se repita (opcional)</span>
        <textarea
          rows={2}
          maxLength={2000}
          value={acciones}
          onChange={(e) => setAcciones(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>
      {tipo === 'ACCIDENTE' && !inicial && <RecordatorioSt7 />}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Registrar incidente'}
        </Button>
        <Button type="button" variant="secondary" onClick={alTerminar} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ── Aviso al IMSS ───────────────────────────────────────────────────────────

function AvisoImss({ obraId, i, hoy, esAdmin }: { obraId: string; i: Incidente; hoy: string; esAdmin: boolean }) {
  const [fecha, setFecha] = useState(i.aviso_imss_fecha ? msAInput(i.aviso_imss_fecha) : hoy);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function marcar(hecho: boolean) {
    setError(null);
    iniciar(async () => {
      const r = await marcarAvisoImss(obraId, i.id, hecho, hecho ? fecha : null);
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
    });
  }

  async function subir(archivo: File) {
    setError(null);
    const esPdf = archivo.type === 'application/pdf';
    const lista = esPdf ? { blob: archivo as Blob, tipo: 'application/pdf' } : await comprimirFoto(archivo);
    if (!lista) {
      setError('Solo foto (JPG, PNG, WEBP) o PDF.');
      return;
    }
    iniciar(async () => {
      const prep = await crearUrlSubidaComprobante(obraId, i.id, lista.tipo, lista.blob.size);
      if (!prep.ok || !prep.path || !prep.token) {
        setError(prep.error ?? 'No se pudo preparar la subida.');
        return;
      }
      const { error: upErr } = await createClient()
        .storage.from('seguridad')
        .uploadToSignedUrl(prep.path, prep.token, lista.blob, { contentType: lista.tipo });
      if (upErr) {
        setError('No se pudo subir el archivo.');
        return;
      }
      const r = await registrarComprobante(obraId, i.id, prep.path);
      if (!r.ok) setError(r.error ?? 'No se pudo guardar el comprobante.');
    });
  }

  function ver() {
    iniciar(async () => {
      const r = await urlComprobante(i.id);
      if (r.ok && r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
      else setError(r.error ?? 'No se pudo abrir.');
    });
  }

  return (
    <div className="space-y-2">
      {avisoPendiente(i) ? (
        <RecordatorioSt7 />
      ) : (
        <p className="text-sm text-green-800">
          Aviso al IMSS registrado{i.aviso_imss_fecha ? ` el ${formatDate(i.aviso_imss_fecha)}` : ''}.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {!i.aviso_imss_hecho ? (
          <>
            <label className="text-sm">
              <span className="block text-neutral-700">Fecha del aviso</span>
              <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            </label>
            <Button size="sm" onClick={() => marcar(true)} disabled={pendiente}>
              Ya se dio el aviso
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => marcar(false)} disabled={pendiente}>
            Marcar como pendiente
          </Button>
        )}
        {esAdmin && (
          <>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50 focus-within:ring-2 focus-within:ring-neutral-900">
              {i.tiene_comprobante ? 'Cambiar comprobante' : 'Subir comprobante'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                disabled={pendiente}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void subir(f);
                }}
              />
            </label>
            {i.tiene_comprobante && (
              <Button size="sm" variant="secondary" onClick={ver} disabled={pendiente}>
                Ver comprobante
              </Button>
            )}
          </>
        )}
      </div>
      {esAdmin && (
        <p className="text-xs text-neutral-500">
          El comprobante (el ST-7 trae el diagnóstico) solo lo puede abrir el administrador.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Datos de salud (solo admin) ─────────────────────────────────────────────

function SaludAdmin({ obraId, i }: { obraId: string; i: Incidente }) {
  const [tipoLesion, setTipoLesion] = useState<string>(i.salud?.tipo_lesion ?? 'OTRA');
  const [parte, setParte] = useState<string>(i.salud?.parte_cuerpo ?? 'OTRA');
  const [atencion, setAtencion] = useState<string>(i.salud?.atencion ?? 'NINGUNA');
  const [nota, setNota] = useState(i.salud?.nota ?? '');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pendiente, iniciar] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    iniciar(async () => {
      const r = await guardarSalud(obraId, i.id, { tipoLesion, parteCuerpo: parte, atencion, nota });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else setOk(true);
    });
  }

  return (
    <details className="rounded-lg border border-purple-200 bg-purple-50/40 p-3" open={!!i.salud}>
      <summary className="min-h-11 cursor-pointer text-sm font-medium text-neutral-900">
        Datos de salud · solo tú los ves
      </summary>
      <form onSubmit={guardar} className="mt-2 space-y-3">
        <p className="text-xs text-neutral-600">
          Son datos sensibles. Anota lo mínimo; nada de diagnósticos: eso queda en el expediente del IMSS.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-neutral-700">Tipo de lesión</span>
            <select value={tipoLesion} onChange={(e) => setTipoLesion(e.target.value)} className={CAMPO}>
              {TIPOS_LESION.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_LESION[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-700">Parte del cuerpo</span>
            <select value={parte} onChange={(e) => setParte(e.target.value)} className={CAMPO}>
              {PARTES_CUERPO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_PARTE[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-700">Atención recibida</span>
            <select value={atencion} onChange={(e) => setAtencion(e.target.value)} className={CAMPO}>
              {ATENCIONES.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_ATENCION[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-700">Nota corta (opcional, máx. {MAX_NOTA_SALUD})</span>
          <input
            type="text"
            maxLength={MAX_NOTA_SALUD}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className={CAMPO}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {ok && (
          <p role="status" className="text-sm text-green-700">
            Guardado.
          </p>
        )}
        <Button type="submit" size="sm" disabled={pendiente}>
          Guardar datos de salud
        </Button>
      </form>
    </details>
  );
}

// ── Lista ───────────────────────────────────────────────────────────────────

export function Incidentes({
  obraId,
  hoy,
  escribe,
  esAdmin,
  incidentes,
  colaboradores,
}: {
  obraId: string;
  hoy: string;
  escribe: boolean;
  esAdmin: boolean;
  incidentes: Incidente[];
  colaboradores: { id: string; nombre: string }[];
}) {
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function borrar(id: string) {
    if (!window.confirm('¿Quitar este incidente? Deja de verse, pero no se borra de la base.')) return;
    setError(null);
    iniciar(async () => {
      const r = await borrarIncidente(obraId, id);
      if (!r.ok) setError(r.error ?? 'No se pudo quitar.');
    });
  }

  return (
    <section aria-labelledby="incidentes-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="incidentes-heading" className="text-base font-semibold text-neutral-900">
          Incidentes
        </h2>
        {escribe && !nuevo && <Button onClick={() => setNuevo(true)}>Registrar incidente</Button>}
      </div>

      {nuevo && (
        <Card padding="md">
          <FormIncidente
            obraId={obraId}
            hoy={hoy}
            colaboradores={colaboradores}
            inicial={null}
            alTerminar={() => setNuevo(false)}
          />
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {incidentes.length === 0 && !nuevo && (
        <EmptyState
          title="Sin incidentes registrados"
          description="Anota también los casi accidentes y las condiciones inseguras: son los avisos de lo que puede pasar."
        />
      )}

      <ul className="space-y-3">
        {incidentes.map((i) => (
          <li key={i.id}>
            <Card padding="md">
              {editando === i.id ? (
                <FormIncidente
                  obraId={obraId}
                  hoy={hoy}
                  colaboradores={colaboradores}
                  inicial={i}
                  alTerminar={() => setEditando(null)}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONO_TIPO[i.tipo]}>{ETIQUETA_CORTA_TIPO[i.tipo]}</Badge>
                    <span className="text-sm font-medium text-neutral-900">{formatDate(i.fecha)}</span>
                    {i.colaborador_nombre && <span className="text-sm text-neutral-600">· {i.colaborador_nombre}</span>}
                    {i.dias_incapacidad !== null && (
                      <span className="text-sm text-neutral-600">
                        · {i.dias_incapacidad} {i.dias_incapacidad === 1 ? 'día' : 'días'} de incapacidad
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-line text-sm text-neutral-800">{i.descripcion}</p>
                  {i.acciones && (
                    <p className="text-sm text-neutral-700">
                      <span className="font-medium">Qué se hizo: </span>
                      {i.acciones}
                    </p>
                  )}
                  {i.registrado_nombre && (
                    <p className="text-xs text-neutral-500">Registró: {i.registrado_nombre}</p>
                  )}
                  {i.tipo === 'ACCIDENTE' && (escribe ? (
                    <AvisoImss obraId={obraId} i={i} hoy={hoy} esAdmin={esAdmin} />
                  ) : (
                    <p className="text-sm text-neutral-700">
                      Aviso al IMSS: {i.aviso_imss_hecho ? 'registrado' : 'pendiente'}
                    </p>
                  ))}
                  {esAdmin && i.tipo === 'ACCIDENTE' && <SaludAdmin obraId={obraId} i={i} />}
                  {escribe && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditando(i.id)} disabled={pendiente}>
                        Editar
                      </Button>
                      {esAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => borrar(i.id)} disabled={pendiente}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
