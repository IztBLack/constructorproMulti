'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { Interruptor } from '@/components/modulos/interruptor';
import {
  MODULOS,
  NECESIDADES,
  OPCIONES_FACTURA,
  TIPOS_EMPRESA,
  apagarModulo,
  modulo,
  modulosPorPerfil,
  necesidadProximamente,
  prenderModulo,
  type ClaveModulo,
  type Factura,
  type Modulo,
  type Necesidad,
  type TipoEmpresa,
} from '@/lib/modulos';
import { crearEmpresa } from './actions';

const TOTAL_PASOS = 4;

/**
 * Asistente "Estoy creando mi empresa" (plan §4.1 y §4.2).
 *
 *   1. Nombre  →  2. ¿Cómo trabajas?  →  3. ¿Qué quieres resolver?  →  4. Resumen
 *
 * Todo es opcional menos el nombre, y "Saltar las preguntas" está a la vista en
 * los pasos 1 a 3: crea la empresa con el paquete de siempre (el del contratista
 * con cuadrillas). Nadie tiene que contestar un cuestionario para empezar.
 *
 * Accesibilidad:
 *   · radios y casillas NATIVOS dentro de `<fieldset>` con `<legend>`: teclado y
 *     lector de pantalla funcionan sin ARIA inventado;
 *   · al cambiar de paso el foco va al título del paso nuevo (y se anuncia), en
 *     vez de quedarse en un botón que ya no existe;
 *   · cada opción es una fila completa clicable de 44px o más.
 *
 * El `paso` vive en el padre porque el selector de camino ("Me invitaron" /
 * "Estoy creando mi empresa") solo se muestra en el paso 1.
 */
export function AsistenteEmpresa({
  paso,
  setPaso,
  selectorCamino,
}: {
  paso: number;
  setPaso: (p: number) => void;
  /** El selector de camino, que se pinta arriba solo en el paso 1. */
  selectorCamino: ReactNode;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoEmpresa | null>(null);
  const [factura, setFactura] = useState<Factura | null>(null);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [seleccion, setSeleccion] = useState<ClaveModulo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const tituloRef = useRef<HTMLHeadingElement>(null);
  // Se compara con el paso anterior (y no con un "primer render") para que el
  // doble efecto del modo estricto de React no robe el foco al abrir la página.
  const pasoAnterior = useRef(paso);
  useEffect(() => {
    if (pasoAnterior.current === paso) return;
    pasoAnterior.current = paso;
    tituloRef.current?.focus();
  }, [paso]);

  const recomendacion = modulosPorPerfil(tipo, necesidades, factura);

  function irA(n: number) {
    setError(null);
    setErrorNombre(null);
    // Al llegar al resumen desde las preguntas se arma la selección con lo
    // recomendado. Si regresa a cambiar respuestas, se recalcula al volver.
    if (n === 4) setSeleccion(recomendacion.activos);
    setPaso(n);
  }

  function enviar(saltado: boolean) {
    setError(null);
    setErrorNombre(null);
    if (!nombre.trim()) {
      setPaso(1);
      setErrorNombre('Escribe el nombre de tu empresa o cómo te conocen.');
      return;
    }
    startTransition(async () => {
      const r = await crearEmpresa({
        nombre,
        // Saltar = paquete recomendado por la base (null), no lo que haya a medias aquí.
        modulos: saltado ? null : seleccion,
        tipo,
        factura,
        necesidades,
        saltado,
      });
      // Si se llega aquí sin redirección, es que falló.
      if (!r.ok) setError(r.error ?? 'No se pudo crear la empresa.');
    });
  }

  const saltar = (
    <Button
      type="button"
      variant="ghost"
      onClick={() => enviar(true)}
      disabled={pendiente}
      className="w-full sm:w-auto"
    >
      Saltar las preguntas
    </Button>
  );

  const atras = (
    <Button
      type="button"
      variant="secondary"
      onClick={() => irA(paso - 1)}
      disabled={pendiente}
      className="w-full sm:w-auto"
    >
      Atrás
    </Button>
  );

  return (
    <div className="space-y-6">
      {paso === 1 && selectorCamino}

      <Card padding="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (paso < TOTAL_PASOS) {
              if (paso === 1 && !nombre.trim()) {
                setErrorNombre('Escribe el nombre de tu empresa o cómo te conocen.');
                return;
              }
              irA(paso + 1);
            } else {
              enviar(false);
            }
          }}
          className="space-y-5"
          noValidate
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
              Paso {paso} de {TOTAL_PASOS}
            </p>
            <div
              className="mt-2 flex gap-1"
              role="progressbar"
              aria-label="Avance del registro"
              aria-valuemin={1}
              aria-valuemax={TOTAL_PASOS}
              aria-valuenow={paso}
            >
              {Array.from({ length: TOTAL_PASOS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i < paso ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                />
              ))}
            </div>
          </div>

          {paso === 1 && (
            <>
              <h2 ref={tituloRef} tabIndex={-1} className="text-lg font-semibold text-neutral-900 outline-none">
                ¿Cómo se llama tu empresa?
              </h2>
              <Field
                label="Nombre de la empresa o de cómo te conocen"
                hint="Es lo que verán tus clientes en las cotizaciones. Lo puedes cambiar después."
                htmlFor="nombre"
                error={errorNombre ?? undefined}
              >
                <Input
                  id="nombre"
                  name="nombre"
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setErrorNombre(null);
                  }}
                  required
                  autoFocus
                  maxLength={80}
                  autoComplete="organization"
                  placeholder="Ej. Construcciones Pérez o Maestro Juan"
                  disabled={pendiente}
                  invalid={!!errorNombre}
                />
              </Field>
            </>
          )}

          {paso === 2 && (
            <>
              <h2 ref={tituloRef} tabIndex={-1} className="text-lg font-semibold text-neutral-900 outline-none">
                ¿Cómo trabajas hoy?
              </h2>
              <Opciones
                legend="¿Cómo trabajas hoy?"
                ocultarLegend
                nombre="tipo"
                opciones={TIPOS_EMPRESA}
                valor={tipo}
                onCambiar={setTipo}
                deshabilitado={pendiente}
              />
              <Opciones
                legend="¿Facturas o tienes gente dada de alta en el IMSS?"
                nombre="factura"
                opciones={OPCIONES_FACTURA}
                valor={factura}
                onCambiar={setFactura}
                deshabilitado={pendiente}
                enLinea
              />
              <p className="text-sm text-neutral-600">
                Solo para sugerirte módulos. Aquí no te pedimos RFC ni datos fiscales.
              </p>
            </>
          )}

          {paso === 3 && (
            <>
              <h2 ref={tituloRef} tabIndex={-1} className="text-lg font-semibold text-neutral-900 outline-none">
                ¿Qué quieres resolver primero?
              </h2>
              <fieldset className="space-y-2" disabled={pendiente}>
                <legend className="mb-2 text-sm text-neutral-700">
                  Elige todas las que quieras. Con esto armamos tu menú.
                </legend>
                {NECESIDADES.map((n) => {
                  const marcada = necesidades.includes(n.valor);
                  const pronto = necesidadProximamente(n.valor, tipo);
                  return (
                    <label
                      key={n.valor}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition ${
                        marcada ? 'border-neutral-900' : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="necesidades"
                        value={n.valor}
                        checked={marcada}
                        onChange={(e) =>
                          setNecesidades((prev) =>
                            e.target.checked
                              ? [...prev, n.valor]
                              : prev.filter((x) => x !== n.valor),
                          )
                        }
                        className="h-5 w-5 shrink-0 accent-neutral-900"
                      />
                      <span className="min-w-0 flex-1 text-sm text-neutral-900">{n.texto}</span>
                      {pronto && <Badge tone="amber">Próximamente</Badge>}
                    </label>
                  );
                })}
              </fieldset>
            </>
          )}

          {paso === 4 && (
            <Resumen
              tituloRef={tituloRef}
              recomendados={recomendacion.activos}
              proximamente={recomendacion.proximamente}
              seleccion={seleccion}
              setSeleccion={setSeleccion}
              deshabilitado={pendiente}
            />
          )}

          <EstadoFormulario tono="error" mensaje={error} />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {paso > 1 && atras}
              {paso < TOTAL_PASOS && saltar}
            </div>
            <Button type="submit" disabled={pendiente} className="w-full sm:w-auto">
              {pendiente
                ? 'Creando tu empresa…'
                : paso < TOTAL_PASOS
                  ? 'Siguiente'
                  : 'Crear mi empresa'}
            </Button>
          </div>
          {paso < TOTAL_PASOS && (
            <p className="text-xs text-neutral-600">
              Si saltas las preguntas te dejamos lo que usa un contratista con cuadrillas. Lo cambias
              cuando quieras en Ajustes → Módulos.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}

/** Grupo de radios nativos con filas completas clicables. */
function Opciones<T extends string>({
  legend,
  ocultarLegend = false,
  nombre,
  opciones,
  valor,
  onCambiar,
  deshabilitado,
  enLinea = false,
}: {
  legend: string;
  ocultarLegend?: boolean;
  nombre: string;
  opciones: { valor: T; texto: string }[];
  valor: T | null;
  onCambiar: (v: T) => void;
  deshabilitado: boolean;
  enLinea?: boolean;
}) {
  return (
    <fieldset disabled={deshabilitado}>
      <legend
        className={ocultarLegend ? 'sr-only' : 'mb-2 text-sm font-medium text-neutral-900'}
      >
        {legend}
      </legend>
      <div className={enLinea ? 'grid gap-2 sm:grid-cols-3' : 'space-y-2'}>
        {opciones.map((o) => {
          const activa = valor === o.valor;
          return (
            <label
              key={o.valor}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition ${
                activa ? 'border-neutral-900' : 'border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <input
                type="radio"
                name={nombre}
                value={o.valor}
                checked={activa}
                onChange={() => onCambiar(o.valor)}
                className="h-5 w-5 shrink-0 accent-neutral-900"
              />
              <span className="text-sm text-neutral-900">{o.texto}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Paso 4 — "Te activamos esto", con interruptores. */
function Resumen({
  tituloRef,
  recomendados,
  proximamente,
  seleccion,
  setSeleccion,
  deshabilitado,
}: {
  tituloRef: React.RefObject<HTMLHeadingElement | null>;
  recomendados: ClaveModulo[];
  proximamente: ClaveModulo[];
  seleccion: ClaveModulo[];
  setSeleccion: (s: ClaveModulo[]) => void;
  deshabilitado: boolean;
}) {
  const disponibles = MODULOS.filter((m) => m.disponible);
  const sugeridos = disponibles.filter((m) => recomendados.includes(m.clave));
  const otros = disponibles.filter((m) => !recomendados.includes(m.clave));

  function cambiar(m: Modulo, prender: boolean) {
    setSeleccion(prender ? prenderModulo(seleccion, m.clave) : apagarModulo(seleccion, m.clave));
  }

  return (
    <>
      <h2 ref={tituloRef} tabIndex={-1} className="text-lg font-semibold text-neutral-900 outline-none">
        Te activamos esto
      </h2>
      <p className="text-sm text-neutral-700">
        Empieza con esto. Puedes prender o apagar módulos cuando quieras en Ajustes → Módulos;
        apagar uno no borra tus datos.
      </p>

      <ListaModulos
        titulo="Para empezar"
        modulos={sugeridos}
        seleccion={seleccion}
        onCambiar={cambiar}
        deshabilitado={deshabilitado}
      />

      {otros.length > 0 && (
        <ListaModulos
          titulo="Otros módulos disponibles"
          modulos={otros}
          seleccion={seleccion}
          onCambiar={cambiar}
          deshabilitado={deshabilitado}
        />
      )}

      {proximamente.length > 0 && (
        <section aria-labelledby="pronto-titulo" className="rounded-lg bg-neutral-100 p-3">
          <h3 id="pronto-titulo" className="text-sm font-medium text-neutral-900">
            Lo que pediste y viene pronto
          </h3>
          <p className="mt-1 text-sm text-neutral-700">
            Lo anotamos. Cuando esté listo lo verás en Ajustes → Módulos.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {proximamente.map((c) => (
              <li key={c}>
                <Badge tone="amber">{modulo(c).nombre}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ListaModulos({
  titulo,
  modulos,
  seleccion,
  onCambiar,
  deshabilitado,
}: {
  titulo: string;
  modulos: Modulo[];
  seleccion: ClaveModulo[];
  onCambiar: (m: Modulo, prender: boolean) => void;
  deshabilitado: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {titulo}
      </legend>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {modulos.map((m) => {
          const id = `mod-${m.clave}`;
          const activo = seleccion.includes(m.clave);
          return (
            <li key={m.clave} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id} className="text-sm font-medium text-neutral-900">
                    {m.nombre}
                  </label>
                  {m.nucleo && <Badge tone="neutral">Siempre prendido</Badge>}
                </div>
                <p id={`${id}-desc`} className="mt-0.5 text-sm text-neutral-600">
                  {m.descripcion}
                </p>
              </div>
              <Interruptor
                id={id}
                aria-describedby={`${id}-desc`}
                checked={activo}
                disabled={m.nucleo || deshabilitado}
                onChange={(e) => onCambiar(m, e.currentTarget.checked)}
              />
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
