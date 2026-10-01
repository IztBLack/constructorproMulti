'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { useGuia } from './guia-provider';

/**
 * Ajustes → Preferencias → Guía. Va en Preferencias porque, igual que el tema,
 * el avance es de ESTE dispositivo: no viaja con la cuenta.
 */
export function SeccionGuia() {
  const { abrir, avance, reiniciar } = useGuia();
  const [confirmar, setConfirmar] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Guía de la app</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Tarjetas que explican cada parte de la app y te llevan a la pantalla. Los ejemplos no se guardan en tu
            cuenta.
          </p>
        </div>
      </CardHeader>
      <p className="mb-3 text-sm text-neutral-700">
        Rango: <strong>{avance.rango}</strong> · {avance.hechas} de {avance.total} tarjetas
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={abrir}>
          {avance.hechas === 0 ? 'Empezar la guía' : 'Abrir la guía'}
        </Button>
        {avance.hechas > 0 &&
          (confirmar ? (
            <>
              <span className="text-sm text-neutral-700">¿Borrar tu avance?</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  reiniciar();
                  setConfirmar(false);
                }}
              >
                Sí, empezar de nuevo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
                No
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirmar(true)}>
              Repetir desde el principio
            </Button>
          ))}
      </div>
    </Card>
  );
}
