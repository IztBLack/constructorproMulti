'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { parsearExcelObra, type ExcelPartida, type ExcelMovimiento } from '@/lib/excel/estado-cuenta-excel';

// ── Tipos compartidos ─────────────────────────────────────────────────────────

export interface PreviewImportacion {
  obraNombre: string;
  numPartidas: number;
  numMovimientos: number;
  totalRecibido: number;
  advertencias: string[];
  /** Datos completos para confirmar (no se escribe en DB aún). */
  _partidas: ExcelPartida[];
  _movimientos: ExcelMovimiento[];
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ── previsualizarImportacion ──────────────────────────────────────────────────

export async function previsualizarImportacion(
  formData: FormData,
): Promise<ActionResult<PreviewImportacion>> {
  // Verificar sesión
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No hay sesión activa.' };
  }

  const file = formData.get('archivo') as File | null;

  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'No se recibió ningún archivo.' };
  }

  // Validar extensión
  const nombre = file.name.toLowerCase();
  if (!nombre.endsWith('.xlsx')) {
    return { ok: false, error: 'Solo se aceptan archivos .xlsx (Excel moderno).' };
  }

  // Validar tamaño (≤10 MB)
  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `El archivo es demasiado grande (máximo 10 MB, recibido ${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  let parsed;
  try {
    const arrayBuffer = await file.arrayBuffer();
    parsed = await parsearExcelObra(arrayBuffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al leer el archivo Excel.';
    return { ok: false, error: msg };
  }

  const totalRecibido = parsed.movimientos
    .filter((m) => m.tipo === 'ENTRADA')
    .reduce((s, m) => s + m.monto, 0);

  return {
    ok: true,
    data: {
      obraNombre: parsed.obraNombre,
      numPartidas: parsed.partidas.length,
      numMovimientos: parsed.movimientos.length,
      totalRecibido,
      advertencias: parsed.advertencias,
      _partidas: parsed.partidas,
      _movimientos: parsed.movimientos,
    },
  };
}

// ── Datos de confirmación ─────────────────────────────────────────────────────

export interface ConfirmarImportacionInput {
  obraNombre: string;
  partidas: ExcelPartida[];
  movimientos: ExcelMovimiento[];
}

export interface ObraCreada {
  obraId: string;
  obraNombre: string;
}

// ── confirmarImportacion ──────────────────────────────────────────────────────

export async function confirmarImportacion(
  datos: ConfirmarImportacionInput,
): Promise<ActionResult<ObraCreada>> {
  let empresaId: string;
  try {
    const emp = await getEmpresaUsuario();
    empresaId = emp.empresaId;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de autenticación.',
    };
  }

  const supabase = await createClient();
  const now = Date.now();

  // Nombre de la obra (no vacío)
  const nombreObra = datos.obraNombre.trim() || 'Obra importada';

  // fecha_inicio = movimiento más antiguo o ahora
  const fechaInicio =
    datos.movimientos.length > 0
      ? Math.min(...datos.movimientos.map((m) => m.fecha))
      : now;

  // ── Crear obra ────────────────────────────────────────────────────────────
  const obraId = crypto.randomUUID();

  const { error: obraError } = await supabase.from('obras').insert({
    id: obraId,
    empresa_id: empresaId,
    nombre: nombreObra,
    cliente: '',
    cliente_id: null,
    ubicacion: '',
    fecha_inicio: fechaInicio,
    activa: true,
    avance: 0,
    cotizacion_origen_id: null,
    pdf_config_json: null,
    created_at: now,
    updated_at: now,
  });

  if (obraError) {
    return { ok: false, error: `No se pudo crear la obra: ${obraError.message}` };
  }

  // ── Crear partidas en lote ────────────────────────────────────────────────
  if (datos.partidas.length > 0) {
    const partidasRows = datos.partidas.map((p, i) => ({
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      obra_id: obraId,
      concepto: p.concepto,
      unidad: p.unidad,
      cantidad: p.cantidad,
      precio_unitario: p.precioUnitario,
      orden: i + 1,
      created_at: now,
      updated_at: now,
    }));

    const { error: partidasError } = await supabase
      .from('obra_presupuesto')
      .insert(partidasRows);

    if (partidasError) {
      // Intentar limpiar la obra creada (best-effort)
      await supabase.from('obras').update({ deleted_at: now, updated_at: now }).eq('id', obraId);
      return { ok: false, error: `Error al guardar partidas: ${partidasError.message}` };
    }
  }

  // ── Crear movimientos en lote ─────────────────────────────────────────────
  if (datos.movimientos.length > 0) {
    // Insertar en bloques de 200 para no sobrecargar la API
    const CHUNK = 200;
    for (let i = 0; i < datos.movimientos.length; i += CHUNK) {
      const chunk = datos.movimientos.slice(i, i + CHUNK);
      const rows = chunk.map((m) => ({
        id: crypto.randomUUID(),
        empresa_id: empresaId,
        obra_id: obraId,
        fecha: m.fecha,
        tipo: m.tipo,
        categoria: m.categoria,
        concepto: '',
        monto: m.monto,
        metodo_pago: m.metodoPago,
        referencia: m.referencia,
        nombre: m.nombre,
        cotizacion_id: null,
        partida_id: null,
        created_at: now,
        updated_at: now,
      }));

      const { error: movError } = await supabase.from('movimientos').insert(rows);
      if (movError) {
        // La obra y partidas ya están; reportar error parcial.
        return {
          ok: false,
          error: `La obra fue creada (id: ${obraId}), pero falló la inserción de movimientos en el bloque ${i}–${i + CHUNK}: ${movError.message}`,
        };
      }
    }
  }

  revalidatePath('/admin/obras');
  revalidatePath('/admin');

  return {
    ok: true,
    data: { obraId, obraNombre: nombreObra },
  };
}
