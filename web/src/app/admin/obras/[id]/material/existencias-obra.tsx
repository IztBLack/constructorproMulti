'use client';

import { Ayuda } from '@/components/guia/ayuda';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input, Select } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import { ETIQUETA_MOVIMIENTO_MATERIAL, type TipoMovimientoMaterial } from '@/lib/compras/tipos';
import { eliminarMovimientoMaterialAction, registrarMovimientoMaterialAction } from '@/app/admin/compras/actions';

interface ExistenciaVista {
  materialId: string;
  nombre: string;
  unidad: string;
  recibido: number;
  consumido: number;
  traspasoEntrada: number;
  traspasoSalida: number;
  ajuste: number;
  existencia: number;
}

interface MovimientoVista {
  id: string;
  fecha: number;
  tipo: TipoMovimientoMaterial;
  cantidad: number;
  material: string;
  /** true = traspaso que LLEGÓ a esta obra desde otra. */
  entrada: boolean;
  otraObra: string | null;
  notas: string;
}

const num = (n: number) => Number(n.toFixed(4)).toLocaleString('es-MX');

/**
 * Existencias por obra y traspasos (RF2.7, versión simple): lo recibido menos
 * lo usado, lo mandado a otra obra y los ajustes de conteo. Solo cuenta
 * material del catálogo.
 */
export function ExistenciasObra({
  obraId,
  existencias,
  movimientos,
  materiales,
  obras,
  puedeRegistrar,
  hoy,
  error,
}: {
  obraId: string;
  existencias: ExistenciaVista[];
  movimientos: MovimientoVista[];
  materiales: { id: string; nombre: string; unidad: string }[];
  obras: { id: string; nombre: string }[];
  puedeRegistrar: boolean;
  hoy: string;
  error: string | null;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoMovimientoMaterial>('CONSUMO');
  const [err, setErr] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">
            Lo que hay en la obra <Ayuda clave="material.existencias" />
          </CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Recibido − lo que se usó − lo que se mandó a otra obra + lo que llegó de otra obra ± ajustes. Solo material
            del catálogo.
          </p>
        </div>
      </CardHeader>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {existencias.length === 0 ? (
        <p className="text-sm text-neutral-600">Todavía no ha llegado material del catálogo a esta obra.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-600">
                <th className="py-2 pr-3 font-medium">Material</th>
                <th className="py-2 pr-3 text-right font-medium">Recibido</th>
                <th className="py-2 pr-3 text-right font-medium">Usado</th>
                <th className="py-2 pr-3 text-right font-medium">Traspasos</th>
                <th className="py-2 pr-3 text-right font-medium">Ajustes</th>
                <th className="py-2 text-right font-medium">Hay</th>
              </tr>
            </thead>
            <tbody>
              {existencias.map((e) => (
                <tr key={e.materialId} className="border-b border-neutral-100 last:border-0">
                  <td className="py-2 pr-3 text-neutral-900">
                    {e.nombre} <span className="text-neutral-600">({e.unidad})</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(e.recibido)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(e.consumido)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(e.traspasoEntrada - e.traspasoSalida)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(e.ajuste)}</td>
                  <td
                    className={`py-2 text-right font-semibold tabular-nums ${e.existencia < 0 ? 'text-red-700' : 'text-neutral-900'}`}
                  >
                    {num(e.existencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {puedeRegistrar && materiales.length > 0 && (
        <form
          className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            const form = ev.currentTarget;
            const fd = new FormData(form);
            setErr(null);
            startTransition(async () => {
              const r = await registrarMovimientoMaterialAction(obraId, fd);
              if (!r.ok) {
                setErr(r.error ?? 'No se pudo registrar.');
                return;
              }
              form.reset();
              setTipo('CONSUMO');
              router.refresh();
            });
          }}
        >
          <Field label="¿Qué pasó?">
            <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimientoMaterial)}>
              {(Object.keys(ETIQUETA_MOVIMIENTO_MATERIAL) as TipoMovimientoMaterial[])
                .filter((t) => t !== 'TRASPASO' || obras.length > 0)
                .map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_MOVIMIENTO_MATERIAL[t]}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Material">
            <Select name="material_id" required defaultValue="">
              <option value="" disabled>
                Elige…
              </option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.unidad})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cantidad">
            <Input name="cantidad" inputMode="decimal" required />
          </Field>
          {tipo === 'AJUSTE' && (
            <Field label="El conteo dio">
              <Select name="signo" defaultValue="menos">
                <option value="menos">Menos de lo que dice la app (se perdió o faltó)</option>
                <option value="mas">Más de lo que dice la app (sobró)</option>
              </Select>
            </Field>
          )}
          {tipo === 'TRASPASO' && (
            <Field label="¿A qué obra?">
              <Select name="obra_destino_id" required defaultValue="">
                <option value="" disabled>
                  Elige…
                </option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Fecha">
            <Input name="fecha" type="date" defaultValue={hoy} />
          </Field>
          <Field label="Nota (opcional)">
            <Input name="notas" maxLength={500} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Registrar'}
            </Button>
          </div>
          {err && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">
              {err}
            </p>
          )}
        </form>
      )}

      {movimientos.length > 0 && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-neutral-800">
            Movimientos registrados ({movimientos.length})
          </summary>
          <ul className="divide-y divide-neutral-100 text-sm">
            {movimientos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-neutral-800">
                  {formatDate(m.fecha)} · {m.material} ·{' '}
                  {m.tipo === 'TRASPASO'
                    ? m.entrada
                      ? `llegó ${num(m.cantidad)} de ${m.otraObra ?? 'otra obra'}`
                      : `se mandó ${num(m.cantidad)} a ${m.otraObra ?? 'otra obra'}`
                    : `${ETIQUETA_MOVIMIENTO_MATERIAL[m.tipo].toLowerCase()}: ${num(m.cantidad)}`}
                  {m.notas ? <span className="text-neutral-600"> ({m.notas})</span> : null}
                </span>
                {puedeRegistrar && !m.entrada && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendiente}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await eliminarMovimientoMaterialAction(obraId, m.id);
                        if (!r.ok) setErr(r.error ?? 'No se pudo borrar.');
                        else router.refresh();
                      })
                    }
                  >
                    Borrar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
