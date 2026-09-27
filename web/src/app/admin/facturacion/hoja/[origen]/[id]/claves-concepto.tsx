'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { CLAVES_CONSTRUCCION, LEYENDA_SUGERENCIA, UNIDADES_SAT } from '@/lib/fiscal/catalogos';
import { guardarClavesSatAction } from '../../../actions';

/**
 * Guardar la clave SAT de un concepto EN SU ORIGEN (la partida de la cotización
 * o del presupuesto de la obra). Así se captura una vez y la próxima hoja ya la
 * trae; si la partida salió del catálogo, también se guarda allá (RD1b.3).
 */
export function ClavesConcepto({
  tabla,
  id,
  clave,
  unidad,
  volverA,
}: {
  tabla: 'partidas' | 'obra_presupuesto';
  id: string;
  clave: string;
  unidad: string;
  volverA: string;
}) {
  const router = useRouter();
  const listaId = useId();
  const [valorClave, setValorClave] = useState(clave);
  const [valorUnidad, setValorUnidad] = useState(unidad || 'E48');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);
    const r = await guardarClavesSatAction(tabla, id, valorClave.trim(), valorUnidad, volverA);
    setCargando(false);
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.');
    setAviso(r.aviso ?? 'Guardado.');
    router.refresh();
  }

  return (
    <details className="mt-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-blue-700">
        {clave ? 'Cambiar la clave SAT de este concepto' : 'Guardar la clave SAT de este concepto'}
      </summary>
      <form onSubmit={guardar} className="mt-2 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Clave de producto o servicio</span>
          <input
            list={listaId}
            value={valorClave}
            onChange={(e) => setValorClave(e.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            placeholder="Ej. 72111000"
            className="block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 font-mono text-sm text-neutral-900"
          />
          <datalist id={listaId}>
            {CLAVES_CONSTRUCCION.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.uso} — {c.texto}
              </option>
            ))}
          </datalist>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Clave de unidad</span>
          <select
            value={valorUnidad}
            onChange={(e) => setValorUnidad(e.target.value)}
            className="block min-h-11 w-full cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            {UNIDADES_SAT.map((u) => (
              <option key={u.clave} value={u.clave}>
                {u.clave} · {u.texto}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={cargando}>
          {cargando ? 'Guardando…' : 'Guardar'}
        </Button>
        <div className="sm:col-span-3">
          <p className="text-xs text-neutral-600">
            Sugerencias para obra: {CLAVES_CONSTRUCCION.slice(0, 4).map((c) => `${c.clave} ${c.uso.toLowerCase()}`).join(' · ')}…{' '}
            {LEYENDA_SUGERENCIA}
          </p>
          <EstadoFormulario tono="error" mensaje={error} />
          <EstadoFormulario tono="exito" mensaje={aviso} />
        </div>
      </form>
    </details>
  );
}
