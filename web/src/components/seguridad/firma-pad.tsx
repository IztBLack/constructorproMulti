'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Recuadro para firmar con el dedo o el mouse. Entrega un PNG (Blob) por
 * `alCambiar` cada vez que se termina un trazo, o `null` al borrar.
 *
 * Accesibilidad: firmar a mano no tiene alternativa de teclado, así que la
 * firma es OPCIONAL en todos los lugares donde se usa (se puede subir foto de
 * la hoja firmada o dejarlo sin evidencia).
 */
export function FirmaPad({ alCambiar }: { alCambiar: (firma: Blob | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const escala = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * escala);
    c.height = Math.round(height * escala);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function terminar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    dibujando.current = false;
    setVacia(false);
    e.currentTarget.toBlob((b) => alCambiar(b), 'image/png');
  }

  function borrar() {
    const c = lienzo.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { width, height } = c.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    setVacia(true);
    alCambiar(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={lienzo}
        aria-label="Recuadro para firmar"
        className="h-36 w-full touch-none rounded-lg border border-dashed border-neutral-400 bg-white"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
      />
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{vacia ? 'Firma aquí con el dedo' : 'Firma capturada'}</span>
        <button
          type="button"
          onClick={borrar}
          className="min-h-11 rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          Borrar firma
        </button>
      </div>
    </div>
  );
}
