import { legalIncompleto, RESPONSABLE } from '@/lib/legal/datos';

/**
 * Marcador visible de un dato legal que aún no se decide.
 *
 * Se pinta en ámbar y en el cuerpo del texto A PROPÓSITO. La alternativa —dejar
 * el hueco vacío, o poner "[pendiente]" en gris pequeño— produce documentos que
 * se publican con el agujero dentro, porque nadie lo ve al revisar. Aquí no se
 * puede leer la página sin tropezar con lo que falta.
 *
 * El estilo ámbar es el mismo que ya usan los avisos de la app
 * (`components/equipo/aviso-incompletos.tsx`), así que se comporta bien en tema
 * claro y oscuro.
 */
export function Pendiente({ que }: { que: string }) {
  return (
    <mark className="mx-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-sm font-medium text-amber-900">
      ⟨ falta: {que} ⟩
    </mark>
  );
}

/**
 * Dato que ya tiene valor, pero todavía no es el definitivo.
 *
 * Se distingue de `Pendiente` por el borde punteado: son dos estados distintos
 * y conviene poder leerlos de un vistazo. "Falta" es un hueco; "provisional" es
 * un valor que se usó para poder leer el documento completo, y que hay que
 * confirmar antes de publicarlo.
 */
export function Provisional({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 whitespace-nowrap rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">
      {children}{' '}
      {/* Los paréntesis y el espacio son texto real, no solo margen: así el
          distintivo sigue leyéndose al copiar el texto y al escucharlo con un
          lector de pantalla, que es donde un separador puramente visual
          desaparece y deja "Mario Ramosprovisional". */}
      <span className="text-xs font-normal uppercase tracking-wide">(provisional)</span>
    </span>
  );
}

/**
 * El nombre del responsable, en el estado en que esté: definitivo, provisional
 * o ausente. Vive aquí y no en cada página para que `/privacidad` y `/terminos`
 * no puedan quedar diciendo cosas distintas sobre quién presta el servicio.
 */
export function NombreResponsable() {
  if (!RESPONSABLE.nombre) return <Pendiente que="nombre o razón social del responsable" />;
  if (RESPONSABLE.nombreProvisional) return <Provisional>{RESPONSABLE.nombre}</Provisional>;
  return <>{RESPONSABLE.nombre}</>;
}

/**
 * Banner de encabezado mientras el cuerpo legal esté incompleto.
 *
 * Devuelve `null` en cuanto no falte nada, así que desaparece solo: no hay que
 * acordarse de quitarlo, que es justo como estos avisos acaban publicados.
 */
export function AvisoBorrador() {
  const faltantes = legalIncompleto();
  if (faltantes.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <p className="text-sm font-semibold">Borrador — no publicar todavía</p>
      <p className="mt-1 text-sm">
        Este documento aún no se puede presentar como definitivo. Falta decidir:{' '}
        {faltantes.join(', ')}.
      </p>
    </div>
  );
}
