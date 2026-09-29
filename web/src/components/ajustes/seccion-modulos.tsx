'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Modal } from '@/components/ui';
import { Interruptor } from '@/components/modulos/interruptor';
import { EstadoFormulario } from './estado-formulario';
import { guardarModulos } from '@/lib/auth/modulos-actions';
import {
  GRUPOS_MODULO,
  MODULOS,
  apagarModulo,
  dependientesDe,
  modulo,
  prenderModulo,
  type ClaveModulo,
  type Modulo,
} from '@/lib/modulos';

function nombres(claves: readonly ClaveModulo[]): string {
  const n = claves.map((c) => modulo(c).nombre);
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}

/**
 * Ajustes → Módulos (solo admin; plan RF0.2 y RF0.3).
 *
 * Cada interruptor guarda al momento: no hay botón "Guardar" que olvidar. Lo
 * que protege del error es la confirmación AL APAGAR, que es el único cambio que
 * asusta ("¿se borra lo que capturé?"): la respuesta va escrita ahí mismo, antes
 * de decidir.
 *
 * Dependencias, dichas antes y no después:
 *   · al PRENDER, se prenden solas las que falten, y se avisa cuáles;
 *   · al APAGAR, la confirmación lista lo que también se apaga porque depende.
 *
 * Los módulos que todavía no existen salen como "Próximamente", deshabilitados:
 * así el dueño ve hacia dónde va la app, sin prometer una pantalla que no hay.
 */
export function SeccionModulos({
  activosIniciales,
  pedidos,
}: {
  activosIniciales: ClaveModulo[];
  /** Módulos que la empresa pidió al registrarse y aún no existen. */
  pedidos: ClaveModulo[];
}) {
  const router = useRouter();
  const [activos, setActivos] = useState<ClaveModulo[]>(activosIniciales);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [porApagar, setPorApagar] = useState<ClaveModulo | null>(null);

  function guardar(nuevos: ClaveModulo[], mensaje: string) {
    const anteriores = activos;
    setActivos(nuevos); // optimista: el interruptor responde al instante
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await guardarModulos(nuevos);
      if (!r.ok) {
        setActivos(anteriores);
        setError(r.error ?? 'No se pudo guardar. Intenta de nuevo.');
        return;
      }
      if (r.modulos) setActivos(r.modulos);
      setAviso(mensaje);
      // La barra de arriba y la paleta viven en el layout: se refrescan aquí.
      router.refresh();
    });
  }

  function alCambiar(m: Modulo, prender: boolean) {
    if (prender) {
      const nuevos = prenderModulo(activos, m.clave);
      const extra = nuevos.filter((c) => c !== m.clave && !activos.includes(c));
      guardar(
        nuevos,
        extra.length > 0
          ? `Listo: prendiste ${m.nombre}. También se prendió ${nombres(extra)}, que lo necesita para funcionar.`
          : `Listo: prendiste ${m.nombre}.`,
      );
      return;
    }
    setPorApagar(m.clave);
  }

  function confirmarApagado() {
    if (!porApagar) return;
    const m = modulo(porApagar);
    const arrastrados = dependientesDe(porApagar, activos);
    setPorApagar(null);
    guardar(
      apagarModulo(activos, porApagar),
      arrastrados.length > 0
        ? `Apagaste ${m.nombre} y ${nombres(arrastrados)}. Sus datos siguen guardados.`
        : `Apagaste ${m.nombre}. Sus datos siguen guardados.`,
    );
  }

  const arrastrados = porApagar ? dependientesDe(porApagar, activos) : [];

  return (
    <Card>
      <p className="text-sm text-neutral-700">
        Prende solo lo que usas; lo demás no aparece en el menú. Apagar un módulo{' '}
        <strong className="font-semibold text-neutral-900">no borra tus datos</strong>: si lo
        vuelves a prender, todo sigue ahí.
      </p>

      <div aria-live="polite" className="mt-4 space-y-2 empty:mt-0">
        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="exito" mensaje={aviso} />
      </div>

      <div className="mt-6 space-y-6">
        {GRUPOS_MODULO.map((g) => {
          const delGrupo = MODULOS.filter((m) => m.grupo === g.clave);
          if (delGrupo.length === 0) return null;
          return (
            <fieldset key={g.clave}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                {g.titulo}
              </legend>
              <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                {delGrupo.map((m) => (
                  <FilaModulo
                    key={m.clave}
                    modulo={m}
                    activo={activos.includes(m.clave)}
                    pedido={pedidos.includes(m.clave)}
                    deshabilitado={pendiente}
                    onCambiar={(v) => alCambiar(m, v)}
                  />
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>

      <Modal
        open={porApagar !== null}
        onClose={() => setPorApagar(null)}
        title={porApagar ? `¿Apagar ${modulo(porApagar).nombre}?` : undefined}
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setPorApagar(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarApagado}>Sí, apagarlo</Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-neutral-700">
          <p>
            <strong className="font-semibold text-neutral-900">Tus datos se conservan.</strong> Solo
            deja de verse en el menú para todos en tu empresa. Si lo vuelves a prender, aparece
            todo como lo dejaste.
          </p>
          {arrastrados.length > 0 && (
            <p>
              También se apaga <strong className="font-semibold">{nombres(arrastrados)}</strong>,
              porque no funciona sin este.
            </p>
          )}
        </div>
      </Modal>
    </Card>
  );
}

function FilaModulo({
  modulo: m,
  activo,
  pedido,
  deshabilitado,
  onCambiar,
}: {
  modulo: Modulo;
  activo: boolean;
  pedido: boolean;
  deshabilitado: boolean;
  onCambiar: (prender: boolean) => void;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const fijo = m.nucleo === true;
  const proximamente = !m.disponible;

  return (
    <li className="flex items-start gap-3 p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="text-sm font-medium text-neutral-900">
            {m.nombre}
          </label>
          {fijo && <Badge tone="neutral">Siempre prendido</Badge>}
          {proximamente && <Badge tone="amber">Próximamente</Badge>}
          {proximamente && pedido && <Badge tone="blue">Lo pediste</Badge>}
        </div>
        <p id={descId} className="mt-0.5 text-sm text-neutral-600">
          {m.descripcion}
          {m.dependeDe.length > 0 && (
            <span className="block text-xs text-neutral-600">
              Necesita {nombres(m.dependeDe)}: se prende solo si hace falta.
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* El estado en palabras, no solo en la posición del interruptor. */}
        <span className="hidden text-xs text-neutral-600 sm:inline" aria-hidden="true">
          {proximamente ? '' : activo ? 'Prendido' : 'Apagado'}
        </span>
        <Interruptor
          id={id}
          aria-describedby={descId}
          checked={proximamente ? false : activo}
          disabled={fijo || proximamente || deshabilitado}
          onChange={(e) => onCambiar(e.currentTarget.checked)}
        />
      </div>
    </li>
  );
}
