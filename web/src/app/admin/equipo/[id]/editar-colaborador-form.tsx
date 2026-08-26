'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@/components/ui';
import type { Colaborador, Puesto } from '@/lib/data/types';
import { actualizarColaborador } from '../actions';
import SueldoFields from '../sueldo-fields';

export default function EditarColaboradorForm({
  abrirAlEntrar = false,
  colaborador,
  puestos,
}: {
  /** Llega con el formulario ya abierto (desde el aviso de datos pendientes). */
  abrirAlEntrar?: boolean;
  colaborador: Colaborador;
  puestos: Puesto[];
}) {
  const router = useRouter();
  // Se abre solo si se llegó con `?editar=1`, que es como entra el aviso de
  // datos incompletos: llevar a la ficha y obligar a buscar el botón "Editar"
  // dejaba el trabajo a medias justo cuando el aviso decía qué faltaba.
  //
  // Inicializador perezoso y no un efecto: el valor se conoce en el primer
  // render, así que abrirlo después costaría un parpadeo.
  const [open, setOpen] = useState(() => abrirAlEntrar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleClose() {
    if (loading) return;
    setOpen(false);
    setError(null);
    setSuccess(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    const result = await actualizarColaborador(colaborador.id, formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo actualizar el colaborador.');
      return;
    }
    setSuccess(true);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Editar colaborador
      </Button>

      <Modal open={open} onClose={handleClose} title="Editar colaborador" size="lg">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *" className="sm:col-span-2">
            <Input name="nombre" required defaultValue={colaborador.nombre} autoFocus />
          </Field>

          <Field label="Puesto">
            <select
              name="puesto_id"
              defaultValue={colaborador.puesto_id ?? ''}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 cursor-pointer"
            >
              <option value="">Sin puesto</option>
              {puestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de pago">
            <select
              name="tipo_pago"
              defaultValue={colaborador.tipo_pago}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 cursor-pointer"
            >
              <option value="DIA">Por día</option>
              <option value="DESTAJO">Por destajo</option>
            </select>
          </Field>

          <Field label="Teléfono">
            <Input name="telefono" defaultValue={colaborador.telefono ?? ''} />
          </Field>

          <SueldoFields
            defaultPeriodo={colaborador.periodo_pago}
            defaultDiasSemana={colaborador.dias_semana}
            defaultMonto={colaborador.salario_periodo}
          />

          <div className="sm:col-span-2 border-t border-neutral-100 pt-4">
            <p className="mb-3 text-sm font-medium text-neutral-700">Contacto de emergencia</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre">
                <Input name="contacto_nombre" defaultValue={colaborador.contacto_nombre ?? ''} />
              </Field>
              <Field label="Teléfono">
                <Input name="contacto_telefono" defaultValue={colaborador.contacto_telefono ?? ''} />
              </Field>
              <Field label="Parentesco">
                <Input name="contacto_parentesco" defaultValue={colaborador.contacto_parentesco ?? ''} />
              </Field>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            <Button type="button" variant="secondary" disabled={loading} onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      {success && (
        <p className="mt-2 text-sm text-green-600">Cambios guardados.</p>
      )}
    </>
  );
}
