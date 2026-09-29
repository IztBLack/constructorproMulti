/**
 * Dinero de las ESTIMACIONES en CENTAVOS ENTEROS.
 *
 * Por qué no `Math.round(x * 100) / 100` como en el resto de la app: aquí cada
 * centavo se compara con la base. La base guarda `importe = round(cantidad ×
 * precio, 2)` en `numeric` (exacto, redondeo a la mitad alejándose del cero) y
 * rechaza una estimación cuyas cuentas no cuadren al centavo. En punto
 * flotante, `3 × 33.335` da `100.00499…` y se iría a 100.00 en vez de 100.01.
 * Con enteros (y BigInt para que el producto no pierda precisión) la web y la
 * base dan SIEMPRE lo mismo.
 *
 * Escalas:
 *   · cantidades y precios unitarios: 4 decimales (numeric(14,4)/(16,4)),
 *   · porcentajes: 4 decimales (numeric(7,4)),
 *   · dinero: 2 decimales (centavos).
 *
 * (BigInt se construye con `BigInt(…)`: el proyecto compila a ES2017 y no
 * admite literales `1n`.)
 */

/**
 * `n` como entero escalado a `dec` decimales, redondeando a la mitad hacia
 * afuera SOBRE SU ESCRITURA DECIMAL (no sobre el binario): así 2.00005 da
 * 2.0001, igual que `round(2.00005::numeric, 4)` en Postgres.
 */
export function escalar(n: number, dec: number): bigint {
  if (!Number.isFinite(n) || n === 0) return BigInt(0);
  const abs = Math.abs(n);
  let s = String(abs);
  if (/e/i.test(s)) s = abs.toFixed(Math.min(20, dec + 8));
  const [ent, frac = ''] = s.split('.');
  const relleno = (frac + '0'.repeat(dec + 1)).slice(0, dec + 1);
  let v = BigInt(ent + relleno.slice(0, dec));
  if (Number(relleno[dec]) >= 5) v += BigInt(1);
  return n < 0 ? -v : v;
}

/** `n / d` redondeado a la mitad, alejándose del cero (como `round()` de numeric). */
function dividirRedondeando(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  if ((r < BigInt(0) ? -r : r) * BigInt(2) >= d) return q + (n < BigInt(0) ? -BigInt(1) : BigInt(1));
  return q;
}

/** De pesos a centavos (redondeando al centavo). */
export function aCentavos(pesos: number): number {
  return Number(escalar(pesos, 2));
}

/** De centavos a pesos (para guardar y mostrar). */
export function deCentavos(c: number): number {
  return c / 100;
}

/** Importe de un renglón en centavos: round(cantidad × precio, 2). */
export function importeCentavos(cantidad: number, precioUnitario: number): number {
  // (cantidad ×10⁴) × (precio ×10⁴) = importe ×10⁸ → a centavos (×10²): ÷10⁶.
  return Number(dividirRedondeando(escalar(cantidad, 4) * escalar(precioUnitario, 4), BigInt(1_000_000)));
}

/** `pct` % de una base en centavos, redondeado al centavo. */
export function porcentajeCentavos(baseCentavos: number, pct: number): number {
  // base × (pct ×10⁴) / 100 / 10⁴
  return Number(dividirRedondeando(BigInt(Math.trunc(baseCentavos)) * escalar(pct, 4), BigInt(1_000_000)));
}

/**
 * Base SIN IVA de un monto que YA trae el IVA, en centavos:
 * round(monto / (1 + pct/100)). El IVA es la resta (monto − base), así que
 * base + IVA da SIEMPRE el monto exacto, sin centavos perdidos.
 */
export function baseSinIvaCentavos(montoCentavos: number, pct: number): number {
  // monto × 10⁶ / (10⁶ + pct ×10⁴)
  const millon = BigInt(1_000_000);
  return Number(dividirRedondeando(BigInt(Math.trunc(montoCentavos)) * millon, millon + escalar(pct, 4)));
}

/** round(a × b / c) en enteros (centavos), a la mitad alejándose del cero. c > 0. */
export function proporcionCentavos(a: number, b: number, c: number): number {
  return Number(dividirRedondeando(BigInt(Math.trunc(a)) * BigInt(Math.trunc(b)), BigInt(Math.trunc(c))));
}

/** Cantidad redondeada a 4 decimales (lo que cabe en la base). */
export function cantidad4(n: number): number {
  return Number(escalar(n, 4)) / 10_000;
}

/** Suma de cantidades a 4 decimales sin arrastrar error de punto flotante. */
export function sumarCantidades(valores: readonly number[]): number {
  let s = BigInt(0);
  for (const v of valores) s += escalar(v, 4);
  return Number(s) / 10_000;
}

/** a − b con cantidades a 4 decimales. */
export function restarCantidades(a: number, b: number): number {
  return Number(escalar(a, 4) - escalar(b, 4)) / 10_000;
}

/** Precio unitario tal como lo guarda la base (4 decimales). */
export const precio4 = cantidad4;
