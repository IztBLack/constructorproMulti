import { formatCurrency } from '@/lib/data/format';

/**
 * AVANCE FÍSICO VS FINANCIERO (RF3.7): cuánto de la obra está hecho contra
 * cuánto se ha pagado. Lo usan el detalle de la obra (oficina) y el portal del
 * cliente, con los mismos números (`lib/estimaciones/avance.ts`).
 *
 * Componente de servidor sin estado: dos barras con su % en texto (no solo
 * color) y una frase que dice qué significa la diferencia.
 */
export function AvanceFisicoFinanciero({
  fisico,
  financiero,
  estimado,
  porCobrar,
  fondoRetenido,
  paraCliente = false,
}: {
  /** % hecho (ponderado por dinero); null = no se ha capturado avance por partida. */
  fisico: number | null;
  /** % pagado contra el costo total; null = sin costo. */
  financiero: number | null;
  /** % estimado (valuado en estimaciones) contra el costo total; solo oficina. */
  estimado?: number | null;
  porCobrar?: number;
  fondoRetenido?: number;
  paraCliente?: boolean;
}) {
  const f = fisico ?? 0;
  const p = financiero ?? 0;
  let lectura = '';
  if (fisico !== null && financiero !== null) {
    const dif = Math.round((p - f) * 10) / 10;
    if (Math.abs(dif) < 5) lectura = 'Lo pagado va parejo con lo hecho.';
    else if (dif > 0)
      lectura = paraCliente
        ? `Has pagado ${dif} puntos más de lo que va hecho (normal si diste anticipo).`
        : `El cliente ha pagado ${dif} puntos más de lo que va hecho (anticipo o pagos adelantados).`;
    else
      lectura = paraCliente
        ? `Va hecho ${-dif} puntos más de lo que has pagado.`
        : `Va hecho ${-dif} puntos más de lo que se ha cobrado: revisa si toca estimar.`;
  }

  return (
    <section aria-labelledby="fisico-financiero" className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 id="fisico-financiero" className="text-base font-semibold text-neutral-900">
        {paraCliente ? 'Cómo va tu obra: hecho vs pagado' : 'Avance físico vs financiero'}
      </h2>
      <div className="mt-3 space-y-3">
        <Barra
          etiqueta={paraCliente ? 'Hecho' : 'Físico (lo hecho)'}
          pct={fisico}
          vacio="Todavía no se mide por partida"
          color="bg-green-600"
        />
        {!paraCliente && estimado != null && (
          <Barra etiqueta="Estimado (valuado en estimaciones)" pct={estimado} vacio="—" color="bg-indigo-600" />
        )}
        <Barra etiqueta={paraCliente ? 'Pagado' : 'Financiero (lo cobrado)'} pct={financiero} vacio="Sin costo capturado" color="bg-blue-600" />
      </div>
      {lectura && <p className="mt-3 text-sm text-neutral-700">{lectura}</p>}
      {((porCobrar ?? 0) > 0 || (fondoRetenido ?? 0) > 0) && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-neutral-100 pt-3 text-sm text-neutral-700">
          {(porCobrar ?? 0) > 0 && (
            <div>
              <dt className="inline">{paraCliente ? 'Estimaciones autorizadas por pagar: ' : 'Autorizado por cobrar: '}</dt>
              <dd className="inline font-medium tabular-nums text-neutral-900">{formatCurrency(porCobrar)}</dd>
            </div>
          )}
          {(fondoRetenido ?? 0) > 0 && (
            <div>
              <dt className="inline">Fondo de garantía retenido: </dt>
              <dd className="inline font-medium tabular-nums text-neutral-900">{formatCurrency(fondoRetenido)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

function Barra({ etiqueta, pct, vacio, color }: { etiqueta: string; pct: number | null; vacio: string; color: string }) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-700">{etiqueta}</span>
        <span className="font-semibold tabular-nums text-neutral-900">
          {pct === null ? vacio : `${pct.toLocaleString('es-MX')} %`}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${etiqueta}: ${pct === null ? vacio : `${pct} %`}`}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
