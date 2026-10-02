'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { recomendarAlcance, type Respuestas } from '@/lib/guia/recorrido/motor';
import type { Alcance } from '@/lib/guia/recorrido/tipos';
import { useGuia } from '../guia-provider';

const PREGUNTAS: {
  clave: keyof Respuestas;
  pregunta: string;
  opciones: [string, string, string];
}[] = [
  {
    clave: 'experiencia',
    pregunta: '¿Cómo llevas hoy el control de tus obras?',
    opciones: ['En libreta o de memoria', 'En Excel, WhatsApp o archivos sueltos', 'Ya uso otro programa'],
  },
  {
    clave: 'necesidad',
    pregunta: '¿Qué necesitas resolver primero?',
    opciones: ['Registrar obras y cotizar', 'Llevar a mi gente, la asistencia y la raya', 'Todo: dinero, compras, papeles y más'],
  },
];

/**
 * Elegir el recorrido: tres alcances con su duración aproximada y el avance
 * de cada uno. Las dos preguntas son OPCIONALES y solo recomiendan; la
 * elección siempre es del usuario.
 */
export function LanzadorRecorrido() {
  const { lanzador, cerrarLanzador } = useGuia();
  return (
    <Modal open={lanzador} onClose={cerrarLanzador} size="lg" title="Recorrido guiado">
      {/* Se desmonta al cerrar: la próxima vez empieza limpio. */}
      <Contenido />
    </Modal>
  );
}

function Contenido() {
  const { alcances, iniciar, cerrarLanzador, reiniciarAvance } = useGuia();
  const [preguntando, setPreguntando] = useState(false);
  const [respuestas, setRespuestas] = useState<Partial<Respuestas>>({});
  const [recomendado, setRecomendado] = useState<Alcance | null>(null);
  const [elegido, setElegido] = useState<Alcance>(() => {
    const enProgreso = alcances.find((a) => a.avance.hechos > 0 && a.avance.hechos < a.avance.temas);
    return enProgreso?.clave ?? 'esencial';
  });
  const [faltaResponder, setFaltaResponder] = useState(false);
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);
  const hayAvance = alcances.some((a) => a.avance.hechos > 0);

  if (preguntando) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-neutral-600">
          Dos preguntas para recomendarte un recorrido. Podrás elegir otro si lo prefieres.
        </p>
        {PREGUNTAS.map((q) => (
          <fieldset key={q.clave} className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-neutral-900">{q.pregunta}</legend>
            {q.opciones.map((texto, i) => (
              <label
                key={texto}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                  respuestas[q.clave] === i ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="radio"
                  name={q.clave}
                  checked={respuestas[q.clave] === i}
                  onChange={() => {
                    setRespuestas((r) => ({ ...r, [q.clave]: i }));
                    setFaltaResponder(false);
                  }}
                  className="h-4 w-4 accent-neutral-900"
                />
                {texto}
              </label>
            ))}
          </fieldset>
        ))}
        {faltaResponder && (
          <p role="alert" className="text-sm text-red-700">
            Responde las dos preguntas para ver la recomendación.
          </p>
        )}
        <div className="flex justify-between gap-2 border-t border-neutral-100 pt-4">
          <Button variant="ghost" size="sm" onClick={() => setPreguntando(false)}>
            Volver
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (respuestas.experiencia === undefined || respuestas.necesidad === undefined) {
                setFaltaResponder(true);
                return;
              }
              const r = recomendarAlcance(respuestas as Respuestas);
              setRecomendado(r);
              setElegido(r);
              setPreguntando(false);
            }}
          >
            Ver recomendación
          </Button>
        </div>
      </div>
    );
  }

  const seleccion = alcances.find((a) => a.clave === elegido) ?? alcances[0];
  const continuar = seleccion.avance.hechos > 0 && seleccion.avance.hechos < seleccion.avance.temas;

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-700">
        Te guiamos paso a paso sobre las pantallas reales. Mientras dura el recorrido, el resto de la app queda en
        pausa y <strong>no se guarda nada</strong> de lo que captures: los datos son de ejemplo. Puedes salir cuando
        quieras.
      </p>

      <fieldset>
        <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-semibold text-neutral-900">
          Elige el alcance
          {!recomendado && (
            <button
              type="button"
              onClick={() => setPreguntando(true)}
              className="min-h-11 cursor-pointer rounded-lg px-2 text-sm font-medium text-blue-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              ¿No sabes cuál? Te recomendamos uno
            </button>
          )}
        </legend>
        <div className="grid gap-2">
          {alcances.map((a) => {
            const activo = a.clave === elegido;
            const vacio = a.temas.length === 0;
            return (
              <label
                key={a.clave}
                className={`flex gap-3 rounded-xl border p-4 transition ${
                  activo ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50'
                } ${vacio ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="alcance"
                  value={a.clave}
                  checked={activo}
                  disabled={vacio}
                  onChange={() => setElegido(a.clave)}
                  className="mt-1 h-4 w-4 accent-neutral-900"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-900">{a.titulo}</span>
                    {recomendado === a.clave && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Recomendado para ti
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-neutral-600">{a.descripcion}</span>
                  <span className="mt-1.5 block text-xs text-neutral-600">
                    {a.temas.length} temas · duración aproximada {a.minutos} min
                    {a.avance.hechos > 0 &&
                      ` · ${a.avance.hechos} de ${a.avance.temas} temas completados${
                        a.avance.hechos < a.avance.temas ? ` (faltan ${a.avance.minutosRestantes} min aprox.)` : ''
                      }`}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4">
        <div>
          {hayAvance &&
            (confirmarReinicio ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                ¿Borrar el avance de todos los recorridos?
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    reiniciarAvance();
                    setConfirmarReinicio(false);
                  }}
                >
                  Borrar avance
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmarReinicio(false)}>
                  Cancelar
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmarReinicio(true)}>
                Reiniciar avance
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={cerrarLanzador}>
            Ahora no
          </Button>
          <Button size="sm" onClick={() => iniciar(seleccion.clave)} disabled={seleccion.temas.length === 0}>
            {continuar ? 'Continuar recorrido' : 'Iniciar recorrido'}
          </Button>
        </div>
      </div>
    </div>
  );
}
