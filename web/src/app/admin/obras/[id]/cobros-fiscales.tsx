import { Ayuda } from '@/components/guia/ayuda';
import { Card, CardTitle, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { EnlaceHoja, EstadoFiscalBadge } from '@/components/fiscal/estado-fiscal';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { estadoDe, type Cobro } from '@/lib/fiscal/tipos';

/**
 * Los cobros de la obra (entradas de caja) con su estado fiscal y el acceso a
 * su hoja para facturar. Solo se arma para admin y contador con el módulo
 * `fiscal` prendido (lo decide la página).
 */
export function CobrosFiscales({ cobros }: { cobros: Cobro[] }) {
  const pendientes = cobros.filter((c) => estadoDe(c) === 'por_facturar').length;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle as="h2" className="text-base font-semibold text-neutral-800">
          Cobros para facturar <Ayuda clave="obra.cobros-facturar" />
        </CardTitle>
        <p className="text-sm text-neutral-600">
          {pendientes === 0 ? 'Nada pendiente' : `${pendientes} por facturar`}
        </p>
      </div>
      {cobros.length === 0 ? (
        <EmptyState title="Sin cobros en esta obra" description="Las entradas de caja aparecen aquí." />
      ) : (
        <TableContainer>
          <THead>
            <Th>Fecha</Th>
            <Th>Concepto</Th>
            <Th className="text-right">Monto</Th>
            <Th>Factura</Th>
            <Th className="text-right">
              <span className="sr-only">Acciones</span>
            </Th>
          </THead>
          <TBody>
            {cobros.map((c) => (
              <Tr key={c.id}>
                <Td>{formatDate(c.fecha)}</Td>
                <Td>{c.concepto || '—'}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(c.monto)}</Td>
                <Td>
                  <EstadoFiscalBadge estado={estadoDe(c)} />
                </Td>
                <Td className="text-right">
                  <EnlaceHoja origen="movimiento" id={c.id} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableContainer>
      )}
    </Card>
  );
}
