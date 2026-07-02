'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, CardTitle } from '@/components/ui';
import MovimientoForm from './movimiento-form';

export default function RegistrarMovimiento({ obraId }: { obraId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} type="button">
        Registrar movimiento
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base font-medium text-neutral-900">
          Registrar movimiento
        </CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </CardHeader>
      <MovimientoForm obraId={obraId} mode="crear" onDone={() => setOpen(false)} />
    </Card>
  );
}
