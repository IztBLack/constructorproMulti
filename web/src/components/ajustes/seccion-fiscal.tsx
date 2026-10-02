'use client';

import { Ayuda } from '@/components/guia/ayuda';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui';
import { FormularioDatosFiscales, type ValoresFiscales } from '@/components/fiscal/formulario-datos-fiscales';
import { guardarEmisorAction } from '@/app/admin/facturacion/actions';

/**
 * Ajustes → Datos para facturar: el EMISOR (RD1b.1). Solo admin y contador, y
 * solo con el módulo `fiscal` prendido. Nunca se pide e.firma, CSD ni la
 * contraseña del SAT (RR1b.2): la app no factura.
 */
export function SeccionFiscal({ valores }: { valores: ValoresFiscales | null }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">
            Tus datos fiscales <Ayuda clave="ajustes.fiscal" />
          </CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Salen en cada hoja para facturar, en el mismo orden que te los pide el SAT. Cópialos de tu
            constancia de situación fiscal.
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            La app no factura ni se conecta al SAT: nunca te va a pedir tu e.firma, tu sello digital ni
            tu contraseña.
          </p>
        </div>
      </CardHeader>
      <FormularioDatosFiscales
        valores={valores}
        accion={guardarEmisorAction}
        permitirGenerico={false}
        textoBoton="Guardar mis datos fiscales"
      />
      <p className="mt-4 text-sm text-neutral-600">
        Lo pendiente por facturar está en{' '}
        <Link href="/admin/facturacion" className="font-medium text-blue-700 underline">
          Facturación
        </Link>
        .
      </p>
    </Card>
  );
}
