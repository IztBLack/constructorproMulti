'use client';

import { useId, useState, useTransition } from 'react';
import { Button, Card, EmptyState } from '@/components/ui';
import { FirmaPad } from '@/components/seguridad/firma-pad';
import { createClient } from '@/lib/supabase/client';
import { comprimirFoto } from '@/lib/imagen/comprimir';
import { formatDate } from '@/lib/data/format';
import type { EntregaEpp } from '@/lib/data/seguridad';
import { ARTICULOS_EPP, FUENTE_NOM_017, ultimaEntregaPorArticulo } from '@/lib/seguridad/epp';
import { crearUrlEvidenciaEpp, ligarEvidenciaEpp, quitarEntregaEpp, registrarEntregaEpp } from './epp-actions';

const CAMPO = 'mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900';

type Evidencia = 'NINGUNA' | 'FIRMA' | 'FOTO';

/**
 * Equipo de protección entregado a un colaborador (módulo `seguridad`). Es el
 * registro de entrega de la NOM-017-STPS-2024 (num. 5.12): qué, cuándo, quién
 * lo recibe y quién lo entrega; la firma o la foto de la hoja firmada son
 * opcionales.
 */
export function EppColaborador({
  colaboradorId,
  colaboradorNombre,
  hoy,
  entregas,
  obras,
  escribe,
}: {
  colaboradorId: string;
  colaboradorNombre: string;
  hoy: string;
  entregas: EntregaEpp[];
  obras: { id: string; nombre: string }[];
  escribe: boolean;
}) {
  const listaId = useId();
  const [abierto, setAbierto] = useState(false);
  const [articulo, setArticulo] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [fecha, setFecha] = useState(hoy);
  const [obraId, setObraId] = useState('');
  const [entrego, setEntrego] = useState('');
  const [notas, setNotas] = useState('');
  const [evidencia, setEvidencia] = useState<Evidencia>('NINGUNA');
  const [firma, setFirma] = useState<Blob | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const resumen = ultimaEntregaPorArticulo(entregas);

  function limpiar() {
    setArticulo('');
    setCantidad('1');
    setNotas('');
    setEvidencia('NINGUNA');
    setFirma(null);
    setFoto(null);
  }

  async function subirEvidencia(entregaId: string): Promise<string | null> {
    let blob: Blob | null = null;
    let tipo = 'image/png';
    if (evidencia === 'FIRMA' && firma) {
      blob = firma;
    } else if (evidencia === 'FOTO' && foto) {
      const lista = await comprimirFoto(foto);
      if (!lista) return 'La foto debe ser JPG, PNG o WEBP.';
      blob = lista.blob;
      tipo = lista.tipo;
    }
    if (!blob) return null;
    const prep = await crearUrlEvidenciaEpp(entregaId, tipo, blob.size);
    if (!prep.ok || !prep.path || !prep.token) return prep.error ?? 'No se pudo preparar la subida.';
    const { error: up } = await createClient()
      .storage.from('seguridad')
      .uploadToSignedUrl(prep.path, prep.token, blob, { contentType: tipo });
    if (up) return 'No se pudo subir la evidencia.';
    const r = await ligarEvidenciaEpp(colaboradorId, entregaId, prep.path, evidencia === 'FIRMA' ? 'FIRMA' : 'FOTO');
    return r.ok ? null : (r.error ?? 'No se pudo guardar la evidencia.');
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    const id = crypto.randomUUID();
    iniciar(async () => {
      const r = await registrarEntregaEpp(colaboradorId, {
        id,
        articulo,
        cantidad: Number(cantidad),
        fecha,
        obraId: obraId || null,
        entregoNombre: entrego,
        notas,
      });
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      const errEvidencia = await subirEvidencia(id);
      if (errEvidencia) setAviso(`La entrega quedó guardada, pero la evidencia no: ${errEvidencia}`);
      limpiar();
      setAbierto(false);
    });
  }

  function quitar(id: string) {
    if (!window.confirm('¿Quitar esta entrega? Deja de verse, pero no se borra de la base.')) return;
    iniciar(async () => {
      const r = await quitarEntregaEpp(colaboradorId, id);
      if (!r.ok) setError(r.error ?? 'No se pudo quitar.');
    });
  }

  return (
    <section aria-labelledby="epp-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="epp-heading" className="text-sm font-medium text-neutral-700">
            Equipo de protección entregado
          </h2>
          <p className="text-xs text-neutral-500">
            Registro de entrega según la{' '}
            <a href={FUENTE_NOM_017.url} target="_blank" rel="noopener noreferrer" className="underline">
              NOM-017-STPS-2024
            </a>
            . El equipo se entrega sin costo para el trabajador.
          </p>
        </div>
        {escribe && !abierto && <Button onClick={() => setAbierto(true)}>Registrar entrega</Button>}
      </div>

      {aviso && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {aviso}
        </p>
      )}

      {abierto && (
        <Card padding="md">
          <form onSubmit={enviar} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-neutral-700">¿Qué se entregó?</span>
                <input
                  required
                  list={listaId}
                  maxLength={120}
                  value={articulo}
                  onChange={(e) => setArticulo(e.target.value)}
                  placeholder="Casco, botas, guantes…"
                  className={CAMPO}
                />
                <datalist id={listaId}>
                  {ARTICULOS_EPP.map((a) => (
                    <option key={a.nombre} value={a.nombre}>
                      {a.region}
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-neutral-700">Cantidad</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  required
                  inputMode="numeric"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-neutral-700">Día</span>
                <input type="date" required max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-neutral-700">Obra (opcional)</span>
                <select value={obraId} onChange={(e) => setObraId(e.target.value)} className={CAMPO}>
                  <option value="">Sin obra</option>
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-neutral-700">Entregó</span>
                <input
                  maxLength={120}
                  value={entrego}
                  onChange={(e) => setEntrego(e.target.value)}
                  placeholder="Si lo dejas vacío, va tu nombre"
                  className={CAMPO}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Notas (opcional)</span>
              <input maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} className={CAMPO} />
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-neutral-700">
                ¿Cómo consta que {colaboradorNombre} lo recibió? (opcional)
              </legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['NINGUNA', 'Sin evidencia'],
                    ['FIRMA', 'Firma aquí'],
                    ['FOTO', 'Foto de la hoja firmada'],
                  ] as const
                ).map(([v, t]) => (
                  <label
                    key={v}
                    className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-neutral-900 ${
                      evidencia === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="evidencia"
                      className="sr-only"
                      checked={evidencia === v}
                      onChange={() => setEvidencia(v)}
                    />
                    {t}
                  </label>
                ))}
              </div>
              {evidencia === 'FIRMA' && <FirmaPad alCambiar={setFirma} />}
              {evidencia === 'FOTO' && (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                  className="block min-h-11 text-sm"
                />
              )}
            </fieldset>

            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pendiente}>
                {pendiente ? 'Guardando…' : 'Guardar entrega'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAbierto(false)} disabled={pendiente}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {entregas.length === 0 ? (
        !abierto && (
          <EmptyState
            title="Sin entregas registradas"
            description="Anota el casco, las botas y lo demás que le das: así sabes qué trae y cuándo toca reponerlo."
          />
        )
      ) : (
        <>
          <ul className="flex flex-wrap gap-2" aria-label="Lo último entregado de cada cosa">
            {resumen.map((r) => (
              <li key={r.articulo} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                {r.articulo}: {formatDate(r.fecha)}
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {entregas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-medium text-neutral-900">
                    {e.cantidad} × {e.articulo}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatDate(e.fecha)}
                    {e.obra_nombre ? ` · ${e.obra_nombre}` : ''}
                    {e.entrego_nombre ? ` · Entregó ${e.entrego_nombre}` : ''}
                  </p>
                  {e.notas && <p className="text-xs text-neutral-600">{e.notas}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {e.evidencia_url && (
                    <a
                      href={e.evidencia_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-sm font-medium underline"
                    >
                      Ver {e.evidencia_tipo === 'FIRMA' ? 'firma' : 'foto'}
                    </a>
                  )}
                  {escribe && (
                    <Button size="sm" variant="ghost" onClick={() => quitar(e.id)} disabled={pendiente}>
                      Quitar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
