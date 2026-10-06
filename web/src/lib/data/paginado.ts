/// Paginación transparente para lecturas que pueden pasar del tope de PostgREST.
///
/// EL PROBLEMA
/// ───────────
/// El proyecto tiene `max_rows = 1000` configurado en PostgREST (verificado en
/// producción el 2026-09-06 vía `GET /v1/projects/<ref>/postgrest`). Eso
/// significa que **cualquier** `select()` sin `.range()` devuelve como mucho
/// 1 000 filas —y lo hace SIN error, sin aviso y sin ninguna señal en la
/// respuesta—. Una lista se ve incompleta; peor, una suma sale mal.
///
/// No es hipotético: `catalogo_conceptos` ya tiene 763 filas en producción y
/// `asistencias` 739. Al cruzar las 1 000, el catálogo empezaría a esconder
/// conceptos y nadie vería un error en ningún lado.
///
/// LA SOLUCIÓN
/// ───────────
/// Pedir por páginas con `.range()` hasta que una página venga incompleta. La
/// función de abajo lo hace de forma genérica, para poder envolver una consulta
/// existente sin cambiar lo que devuelve.
///
/// CUÁNDO USARLA Y CUÁNDO NO
/// ─────────────────────────
/// - **Sí** cuando el resultado crece sin techo con el uso: catálogo,
///   movimientos de caja de una obra, asistencias de un histórico.
/// - **No** cuando el resultado está acotado por el dominio (las secciones de
///   una cotización, el equipo de una obra). Ahí una sola consulta basta y el
///   bucle sólo añade ruido.
/// - **Tampoco** cuando lo que se quiere es un total: para eso la respuesta
///   correcta es agregar en Postgres (`sum(...)` en una vista o RPC) y traer
///   una fila, no traer diez mil y sumarlas en JavaScript.

/// Tamaño de página. Por debajo del tope de PostgREST a propósito: si alguien
/// baja `max_rows` a 500, esto sigue funcionando sin tocar código.
export const TAMANO_PAGINA = 500;

/// Ejecuta `consulta(desde, hasta)` tantas veces como haga falta y concatena
/// los resultados.
///
/// `consulta` recibe los índices inclusivos que espera `.range()` y debe
/// devolver la respuesta tal cual la da supabase-js (`{ data, error }`).
///
/// Corta en cuanto una página devuelve menos de `TAMANO_PAGINA` filas: esa es
/// la señal de que ya no hay más. Un error en cualquier página aborta y se
/// devuelve ese error —no se entrega media lista como si estuviera completa,
/// que es justo el fallo que este archivo existe para evitar.
export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: string | null }> {
  const acumulado: T[] = [];

  for (let pagina = 0; ; pagina++) {
    const desde = pagina * TAMANO_PAGINA;
    const { data, error } = await consulta(desde, desde + TAMANO_PAGINA - 1);

    if (error) return { data: [], error: error.message };

    const filas = data ?? [];
    acumulado.push(...filas);

    if (filas.length < TAMANO_PAGINA) return { data: acumulado, error: null };

    // Cinturón de seguridad: 200 páginas son 100 000 filas. Si una consulta
    // llega ahí es que se está usando esto donde tocaba agregar en Postgres, y
    // es mejor enterarse por un error explícito que por una página que tarda
    // medio minuto en cargar.
    if (pagina >= 199) {
      return {
        data: [],
        error:
          'La consulta superó las 100 000 filas. Esto debe agregarse en Postgres, no traerse al servidor.',
      };
    }
  }
}
