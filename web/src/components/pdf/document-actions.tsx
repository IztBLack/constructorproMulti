import Link from 'next/link';

/**
 * Barra de acciones de una página de documento imprimible: Volver, Descargar PDF
 * e Imprimir. Genérica para todos los documentos.
 *
 * - "Descargar PDF" es la acción primaria (baja el archivo, Content-Disposition
 *   attachment).
 * - "Imprimir" abre el MISMO PDF en otra pestaña (`?disp=inline`), listo para
 *   imprimir desde el visor — así se imprime exactamente lo que se ve.
 * - `estadoCuentaClienteHref` (opcional): descarga un SEGUNDO documento pensado
 *   PARA EL CLIENTE (solo pagos recibidos, sin salidas), distinto del PDF de
 *   caja interno. Se muestra como acción secundaria cuando se provee.
 */
export function DocumentActions({
  volverHref,
  descargarHref,
  estadoCuentaClienteHref,
}: {
  volverHref: string;
  descargarHref: string;
  estadoCuentaClienteHref?: string;
}) {
  // Añade disp=inline respetando si la URL ya trae query params (p. ej. ?inicio=).
  const imprimirHref = `${descargarHref}${descargarHref.includes('?') ? '&' : '?'}disp=inline`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={volverHref}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        ← Volver
      </Link>

      <div className="flex-1" />

      {/* Documento PARA EL CLIENTE: solo pagos recibidos (ENTRADAS), sin caja
          interna ni salidas. Sirve para mandárselo a clientes no registrados.
          Se distingue visualmente del "Descargar PDF" (caja interna) por ser un
          botón secundario con etiqueta explícita. */}
      {estadoCuentaClienteHref && (
        <a
          href={estadoCuentaClienteHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Estado de cuenta del cliente (PDF)
        </a>
      )}

      {/* `siempre-oscuro/claro` NO se invierten con el tema: el botón queda
          negro con texto blanco en claro, oscuro y dentro de `tema-papel`. Con
          `bg-neutral-900` se volvía invisible en el documento (tema-papel no
          re-fija el tono 900, así que quedaba fondo claro + texto blanco). */}
      <a
        href={descargarHref}
        className="inline-flex items-center gap-1.5 rounded-lg bg-siempre-oscuro px-4 py-2 text-sm font-medium text-siempre-claro transition-opacity hover:opacity-90"
      >
        Descargar PDF
      </a>

      <a
        href={imprimirHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        Imprimir
      </a>
    </div>
  );
}
