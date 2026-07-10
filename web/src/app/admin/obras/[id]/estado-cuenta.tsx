import { Card, CardTitle, THead, Th, TBody, Tr, Td, LinkButton } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Movimiento, PartidaPresupuesto } from '@/lib/data/types';
import { costoTotal } from '@/lib/data/presupuesto-obra';

interface Props {
  obraId: string;
  partidas: PartidaPresupuesto[];
  movimientos: Movimiento[];
}

export default function EstadoCuenta({ obraId, partidas, movimientos }: Props) {
  // ── Cálculos principales ────────────────────────────────────────────────
  const costo = costoTotal(partidas);
  const recibido = movimientos
    .filter((m) => m.tipo === 'ENTRADA')
    .reduce((acc, m) => acc + m.monto, 0);
  const pendiente = costo - recibido;

  // ── Resumen: Pagado por persona (SALIDAS agrupadas por nombre) ───────────
  const porPersona = new Map<string, number>();
  for (const m of movimientos) {
    if (m.tipo !== 'SALIDA') continue;
    const key = m.nombre?.trim() || 'Sin nombre';
    porPersona.set(key, (porPersona.get(key) ?? 0) + m.monto);
  }
  const porPersonaEntries = [...porPersona.entries()].sort((a, b) => b[1] - a[1]);

  // ── Resumen: Recibido por tipo (ENTRADAS agrupadas por categoria) ────────
  const porTipo = new Map<string, number>();
  for (const m of movimientos) {
    if (m.tipo !== 'ENTRADA') continue;
    const key = m.categoria?.trim() || m.concepto?.trim() || 'Sin categoría';
    porTipo.set(key, (porTipo.get(key) ?? 0) + m.monto);
  }
  const porTipoEntries = [...porTipo.entries()].sort((a, b) => b[1] - a[1]);

  const totalSalidas = porPersonaEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-4">
      {/* ── Encabezado financiero ─────────────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <CardTitle as="h2" className="text-base font-semibold text-neutral-800">
            Estado de cuenta
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton
              href={`/admin/obras/${obraId}/importar`}
              variant="secondary"
              size="sm"
            >
              Importar movimientos
            </LinkButton>
            <LinkButton
              href={`/admin/obras/${obraId}/exportar`}
              variant="secondary"
              size="sm"
            >
              Exportar a Excel
            </LinkButton>
          </div>
        </div>

        {/* Presupuesto por partidas en el encabezado */}
        {partidas.length > 0 && (
          <div className="mb-4 space-y-1">
            {partidas.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-neutral-600">
                  {p.concepto}
                  {p.unidad ? (
                    <span className="ml-1 text-neutral-400">
                      {p.cantidad} {p.unidad} × {formatCurrency(p.precio_unitario)}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums font-medium text-neutral-900">
                  {formatCurrency(p.cantidad * p.precio_unitario)}
                </span>
              </div>
            ))}
            <div className="mt-2 border-t border-neutral-200 pt-2" />
          </div>
        )}

        {/* Totales clave */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatBox
            label="COSTO TOTAL"
            value={formatCurrency(costo)}
            valueClass="text-neutral-900"
          />
          <StatBox
            label="RECIBIDO"
            value={formatCurrency(recibido)}
            valueClass="text-green-700"
          />
          <StatBox
            label="PENDIENTE"
            value={formatCurrency(pendiente)}
            valueClass={pendiente > 0 ? 'text-red-600' : 'text-green-700'}
            hint={pendiente > 0 ? 'Por cobrar' : 'Al corriente'}
          />
        </div>
      </Card>

      {/* ── Resúmenes ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Pagado por persona */}
        <Card padding="none">
          <div className="px-5 pt-4 pb-3">
            <CardTitle as="h3" className="text-sm font-semibold text-neutral-700">
              Pagado por persona
            </CardTitle>
          </div>
          {porPersonaEntries.length === 0 ? (
            <p className="border-t border-neutral-200 px-5 py-6 text-sm text-neutral-400">
              Sin salidas registradas.
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-neutral-200">
              <table className="w-full text-sm">
                <THead>
                  <Th>Nombre</Th>
                  <Th className="text-right">Total pagado</Th>
                </THead>
                <TBody>
                  {porPersonaEntries.map(([nombre, monto]) => (
                    <Tr key={nombre}>
                      <Td>{nombre}</Td>
                      <Td className="text-right font-semibold tabular-nums text-red-600">
                        {formatCurrency(monto)}
                      </Td>
                    </Tr>
                  ))}
                  <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                    <td className="px-4 py-3 text-sm font-semibold text-neutral-700">Total</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-neutral-900">
                      {formatCurrency(totalSalidas)}
                    </td>
                  </tr>
                </TBody>
              </table>
            </div>
          )}
        </Card>

        {/* Recibido por tipo */}
        <Card padding="none">
          <div className="px-5 pt-4 pb-3">
            <CardTitle as="h3" className="text-sm font-semibold text-neutral-700">
              Recibido por tipo
            </CardTitle>
          </div>
          {porTipoEntries.length === 0 ? (
            <p className="border-t border-neutral-200 px-5 py-6 text-sm text-neutral-400">
              Sin entradas registradas.
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-neutral-200">
              <table className="w-full text-sm">
                <THead>
                  <Th>Concepto / Categoria</Th>
                  <Th className="text-right">Total recibido</Th>
                </THead>
                <TBody>
                  {porTipoEntries.map(([tipo, monto]) => (
                    <Tr key={tipo}>
                      <Td>{tipo}</Td>
                      <Td className="text-right font-semibold tabular-nums text-green-700">
                        {formatCurrency(monto)}
                      </Td>
                    </Tr>
                  ))}
                  <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                    <td className="px-4 py-3 text-sm font-semibold text-neutral-700">Total</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-neutral-900">
                      {formatCurrency(recibido)}
                    </td>
                  </tr>
                </TBody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  valueClass,
  hint,
}: {
  label: string;
  value: string;
  valueClass: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
