/**
 * Números del ESTADO DE CUENTA de una obra frente al cliente. Puro: lo usan la
 * vía del cliente (`portal-cliente.ts`), la de oficina
 * (`estado-cuenta-obra-admin.ts`) y el tablero de la obra, que antes sumaban
 * cada uno por su cuenta.
 *
 *   COSTO TOTAL = presupuesto (Σ partidas) + extras APROBADOS (RF1.4)
 *   PENDIENTE   = costo total − recibido (Σ ENTRADAS)
 *
 * Los extras van como LÍNEA APARTE, no mezclados con las partidas: el cliente
 * tiene que poder ver qué era el trato original y qué se agregó después.
 */

export interface TotalesEstadoCuenta {
  presupuesto: number;
  totalExtras: number;
  costoTotal: number;
  recibido: number;
  pendiente: number;
  /** 0–100, redondeado. 0 si no hay costo. */
  pagadoPct: number;
}

function centavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function totalesEstadoCuenta(p: {
  partidas: { cantidad: number; precio_unitario: number }[];
  entradas: { monto: number }[];
  extras: { total: number }[];
}): TotalesEstadoCuenta {
  const presupuesto = centavos(
    p.partidas.reduce((acc, x) => acc + Number(x.cantidad) * Number(x.precio_unitario), 0),
  );
  const totalExtras = centavos(p.extras.reduce((acc, e) => acc + Number(e.total), 0));
  const costoTotal = centavos(presupuesto + totalExtras);
  const recibido = centavos(p.entradas.reduce((acc, e) => acc + Number(e.monto), 0));
  const pendiente = centavos(costoTotal - recibido);
  const pagadoPct = costoTotal > 0 ? Math.min(100, Math.round((recibido / costoTotal) * 100)) : 0;
  return { presupuesto, totalExtras, costoTotal, recibido, pendiente, pagadoPct };
}
