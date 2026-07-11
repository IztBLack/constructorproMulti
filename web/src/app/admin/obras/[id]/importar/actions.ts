'use server';

// Importar un libro de pagos (Excel .xlsx o CSV) DENTRO de una obra que ya
// existe, sin duplicar movimientos y reconciliando el presupuesto por partidas.
// Es el flujo inverso de `web/src/app/admin/obras/importar/actions.ts` (que crea
// una obra nueva a partir del archivo). Este archivo es solo backend: expone los
// tipos y server actions que consume la UI (formulario de importación) a construir
// en una tarea posterior.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { getObra, listMovimientosByObra } from '@/lib/data/obras';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { partesTz } from '@/lib/data/tz';
import {
  parsearExcelObra,
  parsearCsvObra,
  type ExcelPartida,
  type ExcelMovimiento,
} from '@/lib/excel/estado-cuenta-excel';
import { parsearPdfObra } from '@/lib/pdf/estado-cuenta-pdf';
import type { PartidaPresupuesto } from '@/lib/data/types';

// ── Normalización / claves de comparación ─────────────────────────────────────

/** trim + colapsar espacios + minúsculas, para comparar texto libre de forma tolerante. */
function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Día calendario (zona México) de un epoch ms, como clave "YYYY-M-D". */
function diaKeyMx(ms: number): string {
  const p = partesTz(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Monto a centavos enteros, para comparar sin problemas de precisión de punto flotante. */
function montoKey(monto: number): number {
  return Math.round(monto * 100);
}

interface DatosClaveMovimiento {
  fecha: number;
  monto: number;
  categoria: string | null;
  tipo: string;
  nombre: string | null;
}

/**
 * Clave de deduplicación de un movimiento: fecha (día) + monto + categoría +
 * tipo + nombre, normalizados. Dos movimientos con la misma clave se consideran
 * el mismo pago.
 */
function claveMovimiento(m: DatosClaveMovimiento): string {
  return [
    diaKeyMx(m.fecha),
    montoKey(m.monto),
    normalizarTexto(m.categoria),
    normalizarTexto(m.tipo),
    normalizarTexto(m.nombre),
  ].join('|');
}

/** ¿Los dos números representan el mismo valor (tolerando redondeo de centavos)?
 * Tolerancia de medio centavo (mismo redondeo a centavo) — idéntica al móvil
 * (`_casiIgual` en presupuesto_reconciliation.dart) para clasificar igual en
 * ambas plataformas. */
function numerosIguales(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

// ── Tipos compartidos (consumidos por la UI de importación) ──────────────────

export type EstadoMovimientoImportado = 'nuevo' | 'duplicado';

/**
 * Fila de movimiento del archivo, ya clasificada contra los movimientos
 * existentes de la obra. Esta misma forma es la que se reenvía a
 * `confirmarImportacionObra` (no hay un payload "oculto" aparte: esta fila
 * ya trae todos los datos necesarios para insertar).
 */
export interface MovimientoImportadoPreview extends ExcelMovimiento {
  estado: EstadoMovimientoImportado;
}

export type EstadoPartidaImportada = 'igual' | 'conflicto' | 'nueva' | 'soloPortal';

/**
 * Fila de reconciliación de una partida de presupuesto. `cantidad` /
 * `precioUnitario` son siempre los valores del ARCHIVO (o los del portal
 * cuando `estado === 'soloPortal'`, ya que no hay valores de archivo).
 * `cantidadPortal` / `precioUnitarioPortal` solo vienen presentes cuando
 * `estado === 'conflicto'`, para que la UI pueda mostrar ambos valores.
 */
export interface PartidaImportadaPreview {
  concepto: string;
  estado: EstadoPartidaImportada;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  /** Solo presente cuando estado === 'conflicto'. */
  cantidadPortal?: number;
  /** Solo presente cuando estado === 'conflicto'. */
  precioUnitarioPortal?: number;
  /** id de la partida existente en el portal (igual | conflicto | soloPortal). Ausente si estado === 'nueva'. */
  partidaId?: string;
}

export interface PreviewImportacionObra {
  obraId: string;
  obraNombre: string;
  counts: {
    enArchivo: number;
    nuevos: number;
    duplicados: number;
  };
  /** Suma de ENTRADAs entre los movimientos NUEVOS (lo que se sumaría a "RECIBIDO" si se importa). */
  sumaRecibirNuevos: number;
  /** Todas las filas de movimiento del archivo, con su estado nuevo/duplicado. */
  movimientos: MovimientoImportadoPreview[];
  /** Reconciliación de partidas de presupuesto (archivo vs. portal). */
  presupuesto: PartidaImportadaPreview[];
  advertencias: string[];
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ── previsualizarImportacionObra ──────────────────────────────────────────────

export async function previsualizarImportacionObra(
  obraId: string,
  formData: FormData,
): Promise<ActionResult<PreviewImportacionObra>> {
  let empresaId: string;
  try {
    const emp = await getEmpresaUsuario();
    empresaId = emp.empresaId;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de autenticación.' };
  }

  const { data: obra, error: obraError } = await getObra(obraId);
  if (obraError) {
    return { ok: false, error: `No se pudo cargar la obra: ${obraError}` };
  }
  if (!obra || obra.empresa_id !== empresaId) {
    return { ok: false, error: 'Obra no encontrada.' };
  }

  const file = formData.get('archivo') as File | null;
  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'No se recibió ningún archivo.' };
  }

  const nombreArchivo = file.name.toLowerCase();
  const esCsv = nombreArchivo.endsWith('.csv');
  const esXlsx = nombreArchivo.endsWith('.xlsx');
  const esPdf = nombreArchivo.endsWith('.pdf');
  if (!esCsv && !esXlsx && !esPdf) {
    return { ok: false, error: 'Solo se aceptan archivos .xlsx, .csv o .pdf.' };
  }

  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `El archivo es demasiado grande (máximo 10 MB, recibido ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    };
  }

  let parsed;
  try {
    if (esCsv) {
      const texto = await file.text();
      parsed = parsearCsvObra(texto);
    } else if (esPdf) {
      const arrayBuffer = await file.arrayBuffer();
      parsed = await parsearPdfObra(arrayBuffer);
    } else {
      const arrayBuffer = await file.arrayBuffer();
      parsed = await parsearExcelObra(arrayBuffer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al leer el archivo.';
    return { ok: false, error: msg };
  }

  // ── Deduplicar movimientos contra los ya existentes en la obra ─────────────
  const { data: movimientosExistentes, error: movError } = await listMovimientosByObra(obraId);
  if (movError) {
    return { ok: false, error: `No se pudieron cargar los movimientos existentes: ${movError}` };
  }

  const clavesExistentes = new Set(
    movimientosExistentes.map((m) =>
      claveMovimiento({ fecha: m.fecha, monto: m.monto, categoria: m.categoria, tipo: m.tipo, nombre: m.nombre }),
    ),
  );

  const movimientosPreview: MovimientoImportadoPreview[] = parsed.movimientos.map((m) => ({
    ...m,
    estado: clavesExistentes.has(claveMovimiento(m)) ? 'duplicado' : 'nuevo',
  }));

  const nuevos = movimientosPreview.filter((m) => m.estado === 'nuevo');
  const duplicados = movimientosPreview.filter((m) => m.estado === 'duplicado');
  const sumaRecibirNuevos = nuevos
    .filter((m) => m.tipo === 'ENTRADA')
    .reduce((s, m) => s + m.monto, 0);

  // ── Reconciliar presupuesto por partidas ────────────────────────────────────
  const { data: partidasExistentes, error: presError } = await listPresupuestoObra(obraId);
  if (presError) {
    return { ok: false, error: `No se pudo cargar el presupuesto existente: ${presError}` };
  }

  const presupuesto = reconciliarPresupuesto(partidasExistentes, parsed.partidas);

  const advertencias = [...parsed.advertencias];
  if (esCsv && parsed.partidas.length === 0) {
    advertencias.push(
      'El CSV no incluye partidas de presupuesto; solo se importan movimientos. Las partidas existentes de la obra no se modifican.',
    );
  }

  return {
    ok: true,
    data: {
      obraId,
      obraNombre: obra.nombre,
      counts: {
        enArchivo: movimientosPreview.length,
        nuevos: nuevos.length,
        duplicados: duplicados.length,
      },
      sumaRecibirNuevos,
      movimientos: movimientosPreview,
      presupuesto,
      advertencias,
    },
  };
}

/**
 * Reconcilia las partidas del archivo contra las partidas existentes de la obra,
 * emparejando por `concepto` normalizado.
 *  - 'igual': mismo concepto, misma cantidad y precio unitario.
 *  - 'conflicto': mismo concepto, cantidad y/o precio unitario distintos.
 *  - 'nueva': el concepto solo existe en el archivo.
 *  - 'soloPortal': el concepto solo existe en el portal (NUNCA se borra).
 */
function reconciliarPresupuesto(
  existentes: PartidaPresupuesto[],
  archivo: ExcelPartida[],
): PartidaImportadaPreview[] {
  const resultado: PartidaImportadaPreview[] = [];
  const existentesPorConcepto = new Map<string, PartidaPresupuesto>();
  for (const p of existentes) {
    existentesPorConcepto.set(normalizarTexto(p.concepto), p);
  }

  const vistos = new Set<string>();

  for (const fp of archivo) {
    const key = normalizarTexto(fp.concepto);
    vistos.add(key);
    const existente = existentesPorConcepto.get(key);

    if (!existente) {
      resultado.push({
        concepto: fp.concepto,
        estado: 'nueva',
        unidad: fp.unidad,
        cantidad: fp.cantidad,
        precioUnitario: fp.precioUnitario,
      });
      continue;
    }

    const igual =
      numerosIguales(existente.cantidad, fp.cantidad) &&
      numerosIguales(existente.precio_unitario, fp.precioUnitario);

    if (igual) {
      resultado.push({
        concepto: fp.concepto,
        estado: 'igual',
        unidad: fp.unidad || existente.unidad,
        cantidad: fp.cantidad,
        precioUnitario: fp.precioUnitario,
        partidaId: existente.id,
      });
    } else {
      resultado.push({
        concepto: fp.concepto,
        estado: 'conflicto',
        unidad: fp.unidad || existente.unidad,
        cantidad: fp.cantidad,
        precioUnitario: fp.precioUnitario,
        cantidadPortal: existente.cantidad,
        precioUnitarioPortal: existente.precio_unitario,
        partidaId: existente.id,
      });
    }
  }

  for (const p of existentes) {
    const key = normalizarTexto(p.concepto);
    if (vistos.has(key)) continue;
    resultado.push({
      concepto: p.concepto,
      estado: 'soloPortal',
      unidad: p.unidad,
      cantidad: p.cantidad,
      precioUnitario: p.precio_unitario,
      partidaId: p.id,
    });
  }

  return resultado;
}

// ── confirmarImportacionObra ───────────────────────────────────────────────────

/** Resolución de una fila de partida al confirmar (misma forma que `PartidaImportadaPreview`, más `resolucion`). */
export interface ResolucionPartida {
  concepto: string;
  estado: EstadoPartidaImportada;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  partidaId?: string;
  /** Obligatorio cuando estado === 'conflicto': qué lado gana. Se ignora en los demás estados. */
  resolucion?: 'portal' | 'archivo';
}

export interface ConfirmarImportacionObraInput {
  obraId: string;
  /** Filas devueltas por `previsualizarImportacionObra` (o un subconjunto). */
  movimientos: MovimientoImportadoPreview[];
  /** true = insertar también los marcados como "duplicado". Default false (solo "nuevo"). */
  importarTodo?: boolean;
  /** true = aplicar los cambios de `presupuesto` a `obra_presupuesto`. Default false (no tocar partidas). */
  actualizarPresupuesto?: boolean;
  /** Filas de `PreviewImportacionObra.presupuesto`, con `resolucion` agregada en los conflictos. Requerido si actualizarPresupuesto === true. */
  presupuesto?: ResolucionPartida[];
}

export interface ResultadoImportacionObra {
  obraId: string;
  movimientosInsertados: number;
  partidasCreadas: number;
  partidasActualizadas: number;
}

export async function confirmarImportacionObra(
  input: ConfirmarImportacionObraInput,
): Promise<ActionResult<ResultadoImportacionObra>> {
  let empresaId: string;
  try {
    const emp = await getEmpresaUsuario();
    empresaId = emp.empresaId;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de autenticación.' };
  }

  const { data: obra, error: obraError } = await getObra(input.obraId);
  if (obraError) {
    return { ok: false, error: `No se pudo cargar la obra: ${obraError}` };
  }
  if (!obra || obra.empresa_id !== empresaId) {
    return { ok: false, error: 'Obra no encontrada.' };
  }

  const supabase = await createClient();
  const now = Date.now();

  // ── Movimientos ──────────────────────────────────────────────────────────
  const aInsertar = input.importarTodo
    ? input.movimientos
    : input.movimientos.filter((m) => m.estado === 'nuevo');

  let movimientosInsertados = 0;
  if (aInsertar.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < aInsertar.length; i += CHUNK) {
      const chunk = aInsertar.slice(i, i + CHUNK);
      const rows = chunk.map((m) => ({
        id: crypto.randomUUID(),
        empresa_id: empresaId,
        obra_id: input.obraId,
        fecha: m.fecha,
        tipo: m.tipo,
        categoria: m.categoria,
        // concepto = categoria: la tabla de movimientos del portal
        // (movimientos-tabla.tsx) y el resto de la app muestran `concepto`
        // como la etiqueta principal; dejarlo '' hacía que toda fila
        // importada apareciera con "Concepto: —". Mismo criterio que usa
        // el importador de Flutter (`MovimientoRepository.insertBatch`).
        concepto: m.categoria,
        monto: m.monto,
        metodo_pago: m.metodoPago,
        referencia: m.referencia,
        nombre: m.nombre,
        cotizacion_id: null,
        partida_id: null,
        created_at: now,
        updated_at: now,
      }));

      const { error: movErr } = await supabase.from('movimientos').insert(rows);
      if (movErr) {
        return {
          ok: false,
          error: `Se insertaron ${movimientosInsertados} movimientos antes de fallar en el bloque ${i}–${i + CHUNK}: ${movErr.message}`,
        };
      }
      movimientosInsertados += rows.length;
    }
  }

  // ── Presupuesto (opcional) ───────────────────────────────────────────────
  let partidasCreadas = 0;
  let partidasActualizadas = 0;

  if (input.actualizarPresupuesto && input.presupuesto && input.presupuesto.length > 0) {
    const { data: partidasActuales, error: presError } = await listPresupuestoObra(input.obraId);
    if (presError) {
      return {
        ok: false,
        error: `Los movimientos se importaron (${movimientosInsertados}), pero no se pudo leer el presupuesto actual: ${presError}`,
      };
    }
    let siguienteOrden = partidasActuales.reduce((max, p) => Math.max(max, p.orden), 0) + 1;

    for (const linea of input.presupuesto) {
      // 'igual' y 'soloPortal' nunca se tocan (soloPortal jamás se borra).
      if (linea.estado === 'igual' || linea.estado === 'soloPortal') continue;

      if (linea.estado === 'nueva') {
        const { error } = await supabase.from('obra_presupuesto').insert({
          id: crypto.randomUUID(),
          empresa_id: empresaId,
          obra_id: input.obraId,
          concepto: linea.concepto,
          unidad: linea.unidad,
          cantidad: linea.cantidad,
          precio_unitario: linea.precioUnitario,
          orden: siguienteOrden++,
          created_at: now,
          updated_at: now,
        });
        if (error) {
          return {
            ok: false,
            error: `Se importaron ${movimientosInsertados} movimientos, pero falló al crear la partida "${linea.concepto}": ${error.message}`,
          };
        }
        partidasCreadas++;
        continue;
      }

      if (linea.estado === 'conflicto') {
        // Sin resolución explícita, o resolución 'portal': se deja el valor del portal tal cual.
        if (linea.resolucion !== 'archivo') continue;
        if (!linea.partidaId) continue;

        const { error } = await supabase
          .from('obra_presupuesto')
          .update({
            unidad: linea.unidad,
            cantidad: linea.cantidad,
            precio_unitario: linea.precioUnitario,
            updated_at: now,
          })
          .eq('id', linea.partidaId);

        if (error) {
          return {
            ok: false,
            error: `Se importaron ${movimientosInsertados} movimientos, pero falló al actualizar la partida "${linea.concepto}": ${error.message}`,
          };
        }
        partidasActualizadas++;
      }
    }
  }

  revalidatePath(`/admin/obras/${input.obraId}`);
  revalidatePath('/admin/obras');
  revalidatePath('/admin');

  return {
    ok: true,
    data: {
      obraId: input.obraId,
      movimientosInsertados,
      partidasCreadas,
      partidasActualizadas,
    },
  };
}
