'use client';

import { Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { FormularioDatosFiscales } from '@/components/fiscal/formulario-datos-fiscales';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/data/format';
import type { MisDatosFiscales } from '@/lib/data/fiscal-portal';
import { confirmarMisDatosAction, urlSubidaConstanciaAction } from './fiscal-actions';

/**
 * "Mis datos para factura" en el portal (RF1b.1). El cliente llena o confirma
 * sus datos y sube su constancia: es la fuente más común de facturas
 * rechazadas por un dato mal copiado.
 */
export function MisDatosFiscalesCard({ datos }: { datos: MisDatosFiscales }) {
  async function accion(formData: FormData) {
    let constanciaPath: string | null = null;
    const archivo = formData.get('constancia');
    formData.delete('constancia');
    if (archivo instanceof File && archivo.size > 0) {
      const prep = await urlSubidaConstanciaAction(datos.cliente_id, archivo.type, archivo.size);
      if (!prep.ok || !prep.ruta || !prep.token) return { ok: false, error: prep.error };
      const { error } = await createClient()
        .storage.from('fiscal')
        .uploadToSignedUrl(prep.ruta, prep.token, archivo, { contentType: archivo.type });
      if (error) return { ok: false, error: `No se pudo subir tu constancia: ${error.message}` };
      constanciaPath = prep.ruta;
    }
    return confirmarMisDatosAction(datos.cliente_id, constanciaPath, formData);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Mis datos para factura · {datos.empresa_nombre}</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Cópialos de tu constancia de situación fiscal. Solo los ven tu contratista y su contador.
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-800">
            {datos.confirmados_at
              ? `Los confirmaste el ${formatDate(datos.confirmados_at)}.`
              : 'Todavía no los confirmas.'}
            {datos.constancia_path ? ' Ya subiste tu constancia.' : ''}
          </p>
        </div>
      </CardHeader>
      <FormularioDatosFiscales
        valores={datos}
        accion={accion}
        conReceptor
        textoBoton="Confirmar mis datos"
        extra={
          <Field
            label="Constancia de situación fiscal (opcional)"
            hint="PDF o foto, hasta 5 MB. La descargas del portal del SAT."
            className="sm:col-span-2"
          >
            <Input type="file" name="constancia" accept="application/pdf,image/jpeg,image/png,image/webp" className="min-h-11" />
          </Field>
        }
      />
    </Card>
  );
}
