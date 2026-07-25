'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import MovimientoForm, { type SugerenciasMovimiento } from './movimiento-form';

export default function RegistrarMovimiento({
  obraId,
  sugerencias,
}: {
  obraId: string;
  sugerencias?: SugerenciasMovimiento;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        Registrar movimiento
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar movimiento" size="lg">
        <MovimientoForm
          obraId={obraId}
          mode="crear"
          sugerencias={sugerencias}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
