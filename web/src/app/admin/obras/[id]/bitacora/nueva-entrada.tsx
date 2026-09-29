'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { FormularioEntrada } from './formulario-entrada';

/** Botón "Nueva entrada" que abre el formulario en su lugar. */
export function NuevaEntrada({
  obraId,
  hoy,
  sugeridosHoy,
}: {
  obraId: string;
  hoy: string;
  sugeridosHoy: string[];
}) {
  const [abierto, setAbierto] = useState(false);
  // Se vuelve a montar en cada apertura: id nuevo, formulario limpio.
  const [vez, setVez] = useState(0);

  if (!abierto) {
    return (
      <Button
        type="button"
        onClick={() => {
          setVez((v) => v + 1);
          setAbierto(true);
        }}
      >
        Nueva entrada
      </Button>
    );
  }

  return (
    <Card padding="md" className="w-full">
      <h2 className="mb-4 text-base font-semibold text-neutral-900">Nueva entrada</h2>
      <FormularioEntrada
        key={vez}
        obraId={obraId}
        hoy={hoy}
        sugeridosHoy={sugeridosHoy}
        alTerminar={() => setAbierto(false)}
      />
    </Card>
  );
}
