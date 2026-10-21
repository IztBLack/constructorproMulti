'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea, buttonClassName } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { ListaConRenglones, RenglonLista } from '@/lib/data/listas';
import {
  agruparPorSeccion,
  estribosPorPieza,
  listaCompleta,
  metros2,
  metrosLineales,
  numeroCorto,
  resumenTotales,
  tipoRenglonLista,
  totalesDe,
  type RenglonCalc,
  type TipoRenglonLista,
} from '@/lib/listas/calculo';
import { leerNotaMaterial } from '@/lib/listas/leer-nota';
import {
  actualizarListaAction,
  agregarRenglonAction,
  editarRenglonAction,
  eliminarListaAction,
  eliminarRenglonAction,
  marcarRenglonAction,
  pegarNotaAction,
} from '../actions';

const calc = (r: RenglonLista): RenglonCalc => ({
  tipo: tipoRenglonLista(r.tipo),
  cantidad: r.cantidad,
  largo: r.largo,
  separacion_cm: r.separacion_cm,
  marcado: r.marcado,
});

const nombreSeccion = (s: string) => (s === '' ? 'Sin sección' : s);

function tituloRenglon(r: RenglonLista): string {
  if (tipoRenglonLista(r.tipo) === 'PIEZA') {
    return `${numeroCorto(r.cantidad)} × ${r.largo != null ? `${metros2(r.largo)} m` : '?'}`;
  }
  return [numeroCorto(r.cantidad), r.unidad, r.descripcion].filter(Boolean).join(' ');
}

interface FormRenglon {
  seccion: string;
  tipo: TipoRenglonLista;
  cantidad: string;
  largo: string;
  separacion_cm: string;
  unidad: string;
  descripcion: string;
  nota: string;
}

function formDe(r: RenglonLista | null, seccion: string): FormRenglon {
  return {
    seccion: r?.seccion ?? seccion,
    tipo: r ? tipoRenglonLista(r.tipo) : 'PIEZA',
    cantidad: r ? numeroCorto(r.cantidad) : '',
    largo: r?.largo != null ? metros2(r.largo) : '',
    separacion_cm: r?.separacion_cm != null ? numeroCorto(r.separacion_cm) : '',
    unidad: r?.unidad ?? '',
    descripcion: r?.descripcion ?? '',
    nota: r?.nota ?? '',
  };
}

/**
 * El checklist de una lista de material (docs/PLAN_LISTAS_MATERIAL.md §7):
 * por sección, con casilla, metros y estribos recalculados (no se guardan). Se
 * palomea con la casilla; el renglón se edita con «Editar».
 */
export default function EditorLista({
  obraId,
  lista,
  puedeEditar,
  abrirPegar,
}: {
  obraId: string;
  lista: ListaConRenglones;
  puedeEditar: boolean;
  abrirPegar: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cerrada = lista.estado === 'CERRADA';
  const edita = puedeEditar && !cerrada;
  const secciones = useMemo(() => agruparPorSeccion(lista.renglones, (r) => r.seccion), [lista.renglones]);
  const nombres = useMemo(() => secciones.map(([s]) => s), [secciones]);
  const total = totalesDe(lista.renglones.map(calc));

  // Modales
  const [renglon, setRenglon] = useState<{ actual: RenglonLista | null; form: FormRenglon } | null>(null);
  const [pegando, setPegando] = useState(abrirPegar && puedeEditar);
  const [nota, setNota] = useState('');
  const [datos, setDatos] = useState<{ titulo: string; plano: string; notas: string } | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const leidos = useMemo(() => leerNotaMaterial(nota, nombres.at(-1) ?? ''), [nota, nombres]);

  function correr(accion: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      router.refresh();
    });
  }

  async function guardarModal(accion: () => Promise<{ ok: boolean; error?: string }>, alTerminar: () => void) {
    setGuardando(true);
    setErrorModal(null);
    const r = await accion();
    setGuardando(false);
    if (!r.ok) {
      setErrorModal(r.error ?? 'No se pudo guardar.');
      return;
    }
    alTerminar();
    router.refresh();
  }

  const pdfHref = (marcas: boolean) => `/admin/obras/${obraId}/listas/${lista.id}/pdf${marcas ? '' : '?marcas=0'}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/admin/obras/${obraId}/listas`} className="text-sm text-neutral-600 hover:text-neutral-900">
            ← Listas de material
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">{lista.titulo || 'Lista sin título'}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {[lista.plano ? `Plano ${lista.plano}` : '', formatDate(lista.fecha)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={pdfHref(true)} className={buttonClassName('secondary', 'md')}>
            PDF
          </Link>
          <Link href={pdfHref(false)} className={buttonClassName('ghost', 'md')}>
            PDF en blanco
          </Link>
          {edita && (
            <>
              <Button type="button" variant="secondary" onClick={() => setPegando(true)}>
                Pegar nota
              </Button>
              <Button type="button" onClick={() => setRenglon({ actual: null, form: formDe(null, nombres.at(-1) ?? '') })}>
                + Agregar
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-semibold tabular-nums text-neutral-900">
            {resumenTotales(total) || 'Sin renglones todavía'}
          </p>
          {cerrada ? <Badge tone="neutral">Cerrada</Badge> : listaCompleta(total) ? <Badge tone="green">Completa</Badge> : null}
        </div>
        {total.renglones > 0 && (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
              <div
                className="h-full rounded-full bg-green-600"
                style={{ width: `${Math.round((total.marcados / total.renglones) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-neutral-600">
              {total.marcados} de {total.renglones} palomeados
            </p>
          </>
        )}
        {lista.notas && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{lista.notas}</p>}
        {puedeEditar && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDatos({ titulo: lista.titulo, plano: lista.plano, notas: lista.notas })}
            >
              Datos de la lista
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendiente}
              onClick={() =>
                correr(() => actualizarListaAction(obraId, lista.id, { estado: cerrada ? 'ABIERTA' : 'CERRADA' }))
              }
            >
              {cerrada ? 'Reabrir lista' : 'Cerrar lista'}
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={() => setBorrando(true)}>
              Borrar lista
            </Button>
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {lista.renglones.length === 0 ? (
        <EmptyState
          title="La lista está vacía"
          description={
            edita
              ? 'Pega la nota de WhatsApp tal como la escribes, o agrega los renglones uno por uno.'
              : 'Todavía no tiene renglones.'
          }
        />
      ) : (
        secciones.map(([seccion, renglones]) => {
          const t = totalesDe(renglones.map(calc));
          return (
            <section key={seccion || '_'} className="space-y-2">
              <h2 className="border-l-4 border-neutral-900 pl-3 text-sm font-bold uppercase tracking-wide text-neutral-900">
                {nombreSeccion(seccion)}
                <span className="ml-2 font-normal normal-case tracking-normal text-neutral-500">{resumenTotales(t)}</span>
              </h2>
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
                {renglones.map((r) => {
                  const metros = metrosLineales(calc(r));
                  const porPieza = estribosPorPieza(r.largo, r.separacion_cm);
                  const detalle = [
                    r.separacion_cm != null
                      ? `Estribo @${numeroCorto(r.separacion_cm)} cm${porPieza != null ? ` · ${porPieza} por pieza` : ''}`
                      : '',
                    r.nota,
                    r.marcado && r.marcado_por_nombre
                      ? `Palomeó ${r.marcado_por_nombre}${r.marcado_at ? ` · ${formatDate(r.marcado_at)}` : ''}`
                      : '',
                  ].filter(Boolean);
                  const falta = tipoRenglonLista(r.tipo) === 'PIEZA' && r.largo == null;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-neutral-900"
                          checked={r.marcado}
                          disabled={!edita || pendiente}
                          onChange={(e) => correr(() => marcarRenglonAction(obraId, lista.id, r.id, e.target.checked))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium tabular-nums text-neutral-900">{tituloRenglon(r)}</span>
                          {detalle.map((d) => (
                            <span key={d} className="block text-xs text-neutral-500">
                              {d}
                            </span>
                          ))}
                          {falta && (
                            <Badge tone="amber" className="mt-1">
                              Falta el largo del plano
                            </Badge>
                          )}
                        </span>
                        {metros != null && (
                          <span className="text-sm tabular-nums text-neutral-600">{metros2(metros)} m</span>
                        )}
                      </label>
                      {edita && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ${tituloRenglon(r)}`}
                          onClick={() => setRenglon({ actual: r, form: formDe(r, seccion) })}
                        >
                          Editar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {/* Agregar / editar renglón */}
      <Modal
        open={renglon != null}
        onClose={() => {
          setRenglon(null);
          setErrorModal(null);
        }}
        title={renglon?.actual ? 'Editar renglón' : 'Agregar'}
        footer={
          renglon && (
            <div className="flex flex-wrap justify-between gap-2">
              {renglon.actual ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={guardando}
                  onClick={() =>
                    guardarModal(
                      () => eliminarRenglonAction(obraId, lista.id, renglon.actual!.id),
                      () => setRenglon(null),
                    )
                  }
                >
                  Borrar renglón
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="button"
                disabled={guardando}
                onClick={() =>
                  guardarModal(
                    () =>
                      renglon.actual
                        ? editarRenglonAction(obraId, lista.id, renglon.actual.id, { ...renglon.form })
                        : agregarRenglonAction(obraId, lista.id, { ...renglon.form }),
                    () => setRenglon(null),
                  )
                }
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          )
        }
      >
        {renglon && (
          <FormularioRenglon
            form={renglon.form}
            secciones={nombres}
            onChange={(form) => setRenglon({ ...renglon, form })}
            error={errorModal}
          />
        )}
      </Modal>

      {/* Pegar nota */}
      <Modal
        open={pegando}
        onClose={() => {
          setPegando(false);
          setErrorModal(null);
        }}
        title="Pegar nota"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={guardando || leidos.length === 0}
              onClick={() =>
                guardarModal(
                  () => pegarNotaAction(obraId, lista.id, nota, nombres.at(-1) ?? ''),
                  () => {
                    setPegando(false);
                    setNota('');
                  },
                )
              }
            >
              {leidos.length === 0
                ? 'Agregar'
                : `Agregar ${leidos.length} ${leidos.length === 1 ? 'renglón' : 'renglones'}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            Una pieza por renglón: «4 10:45» son 4 piezas de 10.45 m. Una línea sin números es el nombre de la
            sección («Trabes»).
          </p>
          <Field label="Nota">
            <Textarea
              rows={8}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={'Trabes\n4 10:45\n2 12:25\nPasillo\n2 3:55 estribo 25'}
              autoFocus
            />
          </Field>
          {leidos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Así se entendió</p>
              {agruparPorSeccion(leidos, (l) => l.seccion).map(([s, rs]) => (
                <div key={s || '_'}>
                  <p className="text-sm font-semibold text-neutral-900">{nombreSeccion(s)}</p>
                  <ul className="mt-1 space-y-1">
                    {rs.map((l, i) => (
                      <li key={`${l.linea}-${i}`} className="text-sm">
                        <span className={l.duda ? 'text-amber-800' : 'text-neutral-900'}>
                          {l.duda ? '? ' : '✓ '}
                          {l.tipo === 'PIEZA'
                            ? [
                                `${numeroCorto(l.cantidad)} × ${l.largo != null ? `${metros2(l.largo)} m` : '?'}`,
                                l.separacionCm != null ? `estribo @${numeroCorto(l.separacionCm)}` : '',
                                l.nota,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : [numeroCorto(l.cantidad), l.unidad, l.descripcion].filter(Boolean).join(' ')}
                        </span>
                        <span className="ml-2 text-xs text-neutral-500">«{l.linea}»</span>
                        {l.duda && <span className="block text-xs text-neutral-700">Revisa: {l.duda}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {errorModal && (
            <p role="alert" className="text-sm text-red-600">
              {errorModal}
            </p>
          )}
        </div>
      </Modal>

      {/* Datos de la lista */}
      <Modal
        open={datos != null}
        onClose={() => setDatos(null)}
        title="Datos de la lista"
        footer={
          datos && (
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={guardando}
                onClick={() =>
                  guardarModal(() => actualizarListaAction(obraId, lista.id, datos), () => setDatos(null))
                }
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          )
        }
      >
        {datos && (
          <div className="space-y-3">
            <Field label="Nombre de la lista">
              <Input value={datos.titulo} maxLength={200} onChange={(e) => setDatos({ ...datos, titulo: e.target.value })} />
            </Field>
            <Field label="Plano" hint="Clave u hoja del plano, ej. E-03.">
              <Input value={datos.plano} maxLength={60} onChange={(e) => setDatos({ ...datos, plano: e.target.value })} />
            </Field>
            <Field label="Notas" hint="Salen en el PDF.">
              <Textarea
                rows={3}
                maxLength={2000}
                value={datos.notas}
                onChange={(e) => setDatos({ ...datos, notas: e.target.value })}
              />
            </Field>
            {errorModal && (
              <p role="alert" className="text-sm text-red-600">
                {errorModal}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Borrar lista */}
      <Modal
        open={borrando}
        onClose={() => setBorrando(false)}
        title="Borrar lista"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBorrando(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={guardando}
              onClick={() =>
                guardarModal(
                  () => eliminarListaAction(obraId, lista.id),
                  () => router.push(`/admin/obras/${obraId}/listas`),
                )
              }
            >
              Borrar lista
            </Button>
          </div>
        }
      >
        <p className="text-sm text-neutral-700">
          Se borra «{lista.titulo || 'Lista sin título'}» con todos sus renglones, también en los teléfonos cuando
          sincronicen.
        </p>
      </Modal>
    </div>
  );
}

function FormularioRenglon({
  form,
  secciones,
  onChange,
  error,
}: {
  form: FormRenglon;
  secciones: string[];
  onChange: (f: FormRenglon) => void;
  error: string | null;
}) {
  const pieza = form.tipo === 'PIEZA';
  const num = (s: string) => {
    const n = Number(s.trim().replace(/[:,]/g, '.'));
    return s.trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const cantidad = num(form.cantidad);
  const largo = num(form.largo);
  const porPieza = estribosPorPieza(largo, num(form.separacion_cm));
  const resultado =
    pieza && cantidad != null
      ? [
          largo != null ? `${metros2(cantidad * largo)} m lineales` : '',
          porPieza != null ? `${porPieza} estribos por pieza` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  const otras = secciones.filter((s) => s && s !== form.seccion.trim());

  return (
    <div className="space-y-3">
      <Field label="Tipo">
        <Select value={form.tipo} onChange={(e) => onChange({ ...form, tipo: e.target.value as TipoRenglonLista })}>
          <option value="PIEZA">Piezas (cantidad × largo)</option>
          <option value="LIBRE">Material suelto</option>
        </Select>
      </Field>
      <Field label="Sección" hint="Ej. Trabes, Pasillo, Castillos">
        <Input value={form.seccion} maxLength={120} onChange={(e) => onChange({ ...form, seccion: e.target.value })} />
      </Field>
      {otras.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {otras.map((s) => (
            <Button key={s} type="button" variant="secondary" size="sm" onClick={() => onChange({ ...form, seccion: s })}>
              {s}
            </Button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={pieza ? 'Piezas' : 'Cantidad'}>
          <Input inputMode="decimal" value={form.cantidad} onChange={(e) => onChange({ ...form, cantidad: e.target.value })} />
        </Field>
        {pieza ? (
          <Field label="Largo (m)">
            <Input
              inputMode="decimal"
              value={form.largo}
              placeholder="10.45"
              onChange={(e) => onChange({ ...form, largo: e.target.value })}
            />
          </Field>
        ) : (
          <Field label="Unidad">
            <Input
              value={form.unidad}
              maxLength={20}
              placeholder="bultos, kg, pzas"
              onChange={(e) => onChange({ ...form, unidad: e.target.value })}
            />
          </Field>
        )}
      </div>
      {pieza ? (
        <Field label="Estribos a cada (cm)" hint="Opcional. Como lo marca el plano.">
          <Input
            inputMode="decimal"
            value={form.separacion_cm}
            onChange={(e) => onChange({ ...form, separacion_cm: e.target.value })}
          />
        </Field>
      ) : (
        <Field label="Material">
          <Input
            value={form.descripcion}
            maxLength={300}
            placeholder="Ej. cemento gris, arena, alambre recocido"
            onChange={(e) => onChange({ ...form, descripcion: e.target.value })}
          />
        </Field>
      )}
      <Field label="Nota" hint="Opcional. Ej. chica">
        <Input value={form.nota} maxLength={500} onChange={(e) => onChange({ ...form, nota: e.target.value })} />
      </Field>
      {resultado && <p className="text-sm font-medium tabular-nums text-neutral-900">{resultado}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
