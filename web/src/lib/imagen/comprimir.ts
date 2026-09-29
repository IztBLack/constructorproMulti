/**
 * Compresión de fotos EN EL NAVEGADOR antes de subirlas (bitácora).
 *
 * Una foto de celular pesa 3–8 MB; en obra la señal es mala y cada MB cuenta.
 * Se reduce al lado mayor `maxLado` y se re-codifica a JPEG. No había utilidad
 * previa en el repo (los comprobantes suben el archivo tal cual): esta es la
 * primera y queda aquí para reusarla.
 *
 * Si el navegador no puede decodificar la imagen (p. ej. HEIC en Chrome de
 * escritorio) o el resultado sale más pesado, se devuelve el archivo ORIGINAL:
 * la compresión es una mejora, nunca un motivo para no subir la evidencia.
 * Solo corre en el cliente (usa canvas).
 */

export interface OpcionesCompresion {
  maxLado?: number;
  calidad?: number;
}

export interface FotoLista {
  blob: Blob;
  tipo: 'image/jpeg' | 'image/png' | 'image/webp';
  comprimida: boolean;
}

const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Nuevo tamaño conservando proporción. Pura: se prueba sin navegador. */
export function medidasReducidas(
  ancho: number,
  alto: number,
  maxLado: number,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= maxLado || mayor === 0) return { ancho, alto };
  const f = maxLado / mayor;
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)) };
}

function tipoOriginal(f: File): FotoLista['tipo'] | null {
  return (TIPOS_OK as readonly string[]).includes(f.type) ? (f.type as FotoLista['tipo']) : null;
}

export async function comprimirFoto(
  archivo: File,
  { maxLado = 1600, calidad = 0.8 }: OpcionesCompresion = {},
): Promise<FotoLista | null> {
  const original = tipoOriginal(archivo);
  const sinCambios = original ? { blob: archivo as Blob, tipo: original, comprimida: false } : null;

  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return sinCambios;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    return sinCambios;
  }

  try {
    const { ancho, alto } = medidasReducidas(bitmap.width, bitmap.height, maxLado);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return sinCambios;
    // Fondo blanco: un PNG con transparencia saldría negro en JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', calidad));
    if (!blob) return sinCambios;
    if (sinCambios && blob.size >= archivo.size) return sinCambios;
    return { blob, tipo: 'image/jpeg', comprimida: true };
  } finally {
    bitmap.close();
  }
}
