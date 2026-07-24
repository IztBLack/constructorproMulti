'use client';

import { useRef } from 'react';

/**
 * Muestra el documento de la cotización dentro de un <iframe srcDoc> con el MISMO
 * HTML que la ruta imprime a PDF. El iframe aísla el CSS del documento del resto
 * de la app (y viceversa), así que lo que se ve aquí es exactamente lo que sale
 * en el PDF. Se ajusta la altura al contenido para que no quede una barra de
 * scroll interna.
 */
export function PreviewFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  function ajustarAlto() {
    const f = ref.current;
    const alto = f?.contentWindow?.document?.body?.scrollHeight;
    if (f && alto) f.style.height = `${alto + 8}px`;
  }

  return (
    <iframe
      ref={ref}
      srcDoc={html}
      title="Vista previa de la cotización"
      onLoad={ajustarAlto}
      className="w-full rounded-xl border border-neutral-200 bg-white shadow-sm"
      style={{ minHeight: 640 }}
    />
  );
}
