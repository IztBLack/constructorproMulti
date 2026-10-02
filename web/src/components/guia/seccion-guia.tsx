'use client';

import { Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { useGuia } from './guia-provider';

/**
 * Ajustes → Preferencias → Recorrido guiado. Va en Preferencias porque, igual
 * que el tema, el avance es de ESTE dispositivo: no viaja con la cuenta.
 */
export function SeccionGuia() {
  const { alcances, abrirLanzador } = useGuia();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Recorrido guiado</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Te muestra cómo funciona el panel sobre las pantallas reales, sin guardar nada. Puedes repetirlo cuando
            quieras.
          </p>
        </div>
      </CardHeader>
      <ul className="mb-4 space-y-1 text-sm text-neutral-700">
        {alcances.map((a) => (
          <li key={a.clave} className="flex justify-between gap-3">
            <span>
              {a.titulo} <span className="text-neutral-600">· {a.minutos} min aprox.</span>
            </span>
            <span className="tabular-nums text-neutral-600">
              {a.avance.hechos} de {a.avance.temas} temas
            </span>
          </li>
        ))}
      </ul>
      <Button size="sm" onClick={abrirLanzador}>
        Abrir recorrido
      </Button>
    </Card>
  );
}
