'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import {
  CLIMAS,
  ETIQUETA_CLIMA,
  ETIQUETA_TIPO,
  MAX_FOTOS,
  MAX_TEXTO,
  TIPOS_ENTRADA,
  type EntradaBitacora,
} from '@/lib/bitacora/bitacora';
import { crearEntradaBitacora, editarEntradaBitacora, sugerirPersonal, type EntradaInput } from './actions';
import { subirFotosEntrada } from './subir-fotos';

/**
 * Formulario de una entrada de bitácora: nueva (con fotos) o edición de una
 * abierta (sin fotos: se agregan desde la tarjeta).
 *
 * El `id` lo genera el navegador al abrir el formulario: si la señal se cae a
 * media subida y se vuelve a dar "Guardar", la entrada no se duplica (la base
 * responde "ya existe" y se sigue con las fotos).
 */
export function FormularioEntrada({
  obraId,
  hoy,
  sugeridosHoy,
  inicial,
  alTerminar,
}: {
  obraId: string;
  /** 'YYYY-MM-DD' de hoy en México (lo calcula el servidor). */
  hoy: string;
  /** Personal del pase de lista de hoy, para prellenar. */
  sugeridosHoy: string[];
  /** Si viene, es edición. */
  inicial?: EntradaBitacora & { fechaInput: string };
  alTerminar: () => void;
}) {
  const router = useRouter();
  const editando = Boolean(inicial);
  const [id] = useState(() => inicial?.id ?? crypto.randomUUID());
  const [fecha, setFecha] = useState(inicial?.fechaInput ?? hoy);
  const [tipo, setTipo] = useState<string>(inicial?.tipo ?? 'AVANCE');
  const [clima, setClima] = useState<string>(inicial?.clima ?? '');
  const [texto, setTexto] = useState(inicial?.texto ?? '');
  const [nombres, setNombres] = useState<string[]>(inicial?.personal_nombres ?? sugeridosHoy);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [conteo, setConteo] = useState<string>(
    inicial && inicial.personal_nombres.length === 0 && inicial.personal_presente !== null
      ? String(inicial.personal_presente)
      : '',
  );
  const [visible, setVisible] = useState(inicial?.visible_cliente ?? false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [trayendo, setTrayendo] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);
  const idNombres = useId();

  async function traerDelPaseDeLista() {
    setTrayendo(true);
    setAviso(null);
    const r = await sugerirPersonal(obraId, fecha);
    setTrayendo(false);
    if (r.error) {
      setAviso(`No se pudo leer el pase de lista: ${r.error}`);
      return;
    }
    if (r.nombres.length === 0) {
      setAviso('Ese día no hay pase de lista en esta obra. Puedes anotar los nombres o solo cuántos eran.');
      return;
    }
    setNombres(r.nombres);
    setConteo('');
  }

  function agregarNombre() {
    const n = nuevoNombre.trim();
    if (!n) return;
    if (!nombres.some((x) => x.toLocaleLowerCase('es') === n.toLocaleLowerCase('es'))) {
      setNombres([...nombres, n]);
    }
    setNuevoNombre('');
  }

  function elegirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidas = Array.from(e.target.files ?? []);
    const juntas = [...fotos, ...elegidas];
    if (juntas.length > MAX_FOTOS) setAviso(`Se tomaron las primeras ${MAX_FOTOS} fotos (es el máximo por entrada).`);
    setFotos(juntas.slice(0, MAX_FOTOS));
    if (inputFotos.current) inputFotos.current.value = '';
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const conteoNum = conteo.trim() === '' ? null : Number(conteo);
    if (conteoNum !== null && (!Number.isInteger(conteoNum) || conteoNum < 0)) {
      setError('El número de personas debe ser un entero.');
      return;
    }
    const input: EntradaInput = {
      id,
      fecha,
      tipo,
      texto,
      clima,
      personalNombres: nombres,
      personalPresente: conteoNum,
      visibleCliente: visible,
    };

    startTransition(async () => {
      const r = editando ? await editarEntradaBitacora(obraId, input) : await crearEntradaBitacora(obraId, input);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      if (!editando && fotos.length > 0) {
        const { subidas, errores } = await subirFotosEntrada(obraId, id, fotos, 0, (hechas, total) =>
          setProgreso(`Subiendo fotos ${Math.min(hechas + 1, total)} de ${total}…`),
        );
        setProgreso(null);
        if (errores.length > 0) {
          // La entrada ya quedó guardada: se avisa, y las fotos que faltaron se
          // pueden volver a agregar desde la tarjeta mientras esté abierta.
          setError(
            `La entrada se guardó con ${subidas} de ${fotos.length} fotos. ` +
              `Las demás se pueden agregar desde la entrada: ${errores.join(' ')}`,
          );
          router.refresh();
          return;
        }
      }
      router.refresh();
      alTerminar();
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-4" aria-busy={pendiente}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Día">
          <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required />
        </Field>
        <Field label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_ENTRADA.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Clima">
          <Select value={clima} onChange={(e) => setClima(e.target.value)}>
            {CLIMAS.map((c) => (
              <option key={c || 'nada'} value={c}>
                {ETIQUETA_CLIMA[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="¿Qué pasó?" hint={`${texto.length} de ${MAX_TEXTO} letras`}>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={MAX_TEXTO}
          required
          placeholder="Ej.: Se coló la losa del eje 3. Llegaron 8 m³ de concreto, faltó 1."
        />
      </Field>

      <fieldset className="space-y-2 rounded-xl border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-medium text-neutral-700">Personal presente</legend>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={traerDelPaseDeLista} disabled={trayendo}>
            {trayendo ? 'Leyendo…' : 'Traer del pase de lista'}
          </Button>
          <span className="text-xs text-neutral-600">
            {nombres.length > 0 ? `${nombres.length} persona${nombres.length === 1 ? '' : 's'}` : 'Sin nombres'}
          </span>
        </div>
        {nombres.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Personas anotadas">
            {nombres.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setNombres(nombres.filter((x) => x !== n))}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-800 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  aria-label={`Quitar a ${n}`}
                >
                  {n} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1" htmlFor={idNombres}>
            <span className="text-xs text-neutral-600">Agregar a alguien</span>
            <Input
              id={idNombres}
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregarNombre();
                }
              }}
              placeholder="Nombre"
            />
          </label>
          <Button type="button" variant="secondary" onClick={agregarNombre}>
            Agregar
          </Button>
        </div>
        {nombres.length === 0 && (
          <Field label="O solo cuántos eran" className="max-w-40">
            <Input type="number" min={0} step={1} inputMode="numeric" value={conteo} onChange={(e) => setConteo(e.target.value)} />
          </Field>
        )}
      </fieldset>

      {!editando && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputFotos.current?.click()}
              disabled={fotos.length >= MAX_FOTOS}
            >
              Agregar fotos
            </Button>
            <span className="text-xs text-neutral-600">
              {fotos.length} de {MAX_FOTOS}. Se reducen antes de subir para gastar menos datos.
            </span>
            <input
              ref={inputFotos}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              multiple
              onChange={elegirFotos}
              className="hidden"
              aria-label="Elegir fotos"
            />
          </div>
          {fotos.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs text-neutral-700">
              {fotos.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-neutral-300 px-3 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    aria-label={`Quitar la foto ${f.name}`}
                  >
                    {f.name.length > 24 ? `${f.name.slice(0, 21)}…` : f.name} <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
          className="h-5 w-5 rounded border-neutral-300"
        />
        Que el cliente la vea en su portal
      </label>

      <p className="text-xs text-neutral-600">
        Después de 24 horas la entrada queda cerrada: ya no se cambia ni se borra, solo se le agregan aclaraciones.
      </p>

      <div aria-live="polite" className="space-y-1">
        {progreso && <p className="text-sm text-neutral-700">{progreso}</p>}
        {aviso && <p className="text-sm text-amber-800">{aviso}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar entrada'}
        </Button>
        <Button type="button" variant="ghost" onClick={alTerminar} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
