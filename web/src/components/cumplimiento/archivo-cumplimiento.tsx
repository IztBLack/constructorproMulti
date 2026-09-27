'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import {
  crearUrlSubidaCumplimiento,
  urlArchivoCumplimiento,
  vincularArchivoCumplimiento,
  type Ambito,
} from '@/app/admin/cumplimiento/actions';

/**
 * El comprobante / acuse / documento de un registro de cumplimiento.
 * Ver (URL firmada de 10 min), Adjuntar o Reemplazar, y Quitar.
 *
 * El archivo va DIRECTO del navegador a Storage con una URL firmada que arma
 * el servidor (patrón de 0024). La barrera real es la policy del bucket
 * `cumplimiento` (0040): solo admin y contador de la empresa dueña.
 */
export function ArchivoCumplimiento({
  ambito,
  registroId,
  path,
  etiqueta = 'comprobante',
  puedeEditar,
}: {
  ambito: Ambito;
  registroId: string;
  path: string | null;
  etiqueta?: string;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ver() {
    if (!path) return;
    setError(null);
    const url = await urlArchivoCumplimiento(path);
    if (!url) {
      setError('No se pudo abrir.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCargando(true);
    setError(null);
    const terminar = (msg: string | null) => {
      setCargando(false);
      if (input.current) input.current.value = '';
      setError(msg);
    };

    const prep = await crearUrlSubidaCumplimiento(ambito, registroId, file.name, file.type, file.size);
    if (!prep.ok || !prep.path || !prep.token) return terminar(prep.error ?? 'No se pudo preparar la subida.');

    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from('cumplimiento')
      .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
    if (upErr) return terminar('No se pudo subir el archivo. Revisa tu conexión e inténtalo otra vez.');

    const r = await vincularArchivoCumplimiento(ambito, registroId, prep.path);
    terminar(r.ok ? null : (r.error ?? 'No se pudo guardar.'));
    if (r.ok) router.refresh();
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar el ${etiqueta}? El archivo se borra.`)) return;
    setCargando(true);
    setError(null);
    const r = await vincularArchivoCumplimiento(ambito, registroId, null);
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo quitar.');
      return;
    }
    router.refresh();
  }

  if (!path && !puedeEditar) return <span className="text-xs text-neutral-500">Sin {etiqueta}</span>;

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-center gap-1">
        {path && (
          <Button type="button" variant="secondary" size="sm" onClick={ver} disabled={cargando}>
            Ver {etiqueta}
          </Button>
        )}
        {puedeEditar && (
          <>
            <Button
              type="button"
              variant={path ? 'ghost' : 'secondary'}
              size="sm"
              disabled={cargando}
              onClick={() => input.current?.click()}
            >
              {cargando ? 'Subiendo…' : path ? 'Reemplazar' : `Adjuntar ${etiqueta}`}
            </Button>
            {path && (
              <Button type="button" variant="ghost" size="sm" onClick={quitar} disabled={cargando}>
                Quitar
              </Button>
            )}
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={subir}
              className="hidden"
              aria-label={`Elegir ${etiqueta} (PDF o foto, máximo 10 MB)`}
            />
          </>
        )}
      </span>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
