/**
 * Mensaje de resultado de un formulario de ajustes.
 *
 * POR QUÉ EXISTE: cada tarjeta traía su propio mensaje con su propio estilo
 * —una texto verde suelto, otra caja azul, otra rojo—, así que el mismo suceso
 * se veía distinto según dónde ocurriera. Aquí se unifican forma y semántica.
 *
 * Accesibilidad, que es la mitad del punto:
 *   · `role="alert"` en errores: interrumpe y se anuncia de inmediato.
 *   · `role="status"` en éxitos: se anuncia sin interrumpir lo que se esté
 *     leyendo. Usar "alert" para todo hace que el lector de pantalla grite por
 *     un "Guardado" y termina siendo ruido que la gente aprende a ignorar.
 *   · Un icono acompaña al color, porque el color solo no comunica a quien no
 *     lo distingue (`color-not-only`).
 */
export type TonoEstado = 'error' | 'exito' | 'info';

const ESTILOS: Record<TonoEstado, string> = {
  error: 'border-red-200 bg-red-50 text-red-700',
  exito: 'border-green-200 bg-green-50 text-green-800',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

function Icono({ tono }: { tono: TonoEstado }) {
  const comun = 'h-4 w-4 shrink-0 mt-0.5';
  if (tono === 'exito') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={comun}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (tono === 'error') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={comun}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={comun}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 7.5v.01" />
    </svg>
  );
}

export function EstadoFormulario({
  tono,
  mensaje,
}: {
  tono: TonoEstado;
  mensaje: string | null;
}) {
  if (!mensaje) return null;

  return (
    <p
      role={tono === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${ESTILOS[tono]}`}
    >
      <Icono tono={tono} />
      <span>{mensaje}</span>
    </p>
  );
}
