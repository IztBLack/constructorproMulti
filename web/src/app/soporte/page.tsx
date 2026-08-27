import type { Metadata } from 'next';
import Link from 'next/link';
import { PaginaLegal, Seccion } from '@/components/legal/pagina-legal';
import { Pendiente } from '@/components/legal/pendiente';
import { COMPROMISO_RESPUESTA, RESPONSABLE, metadataBorrador } from '@/lib/legal/datos';

export const metadata: Metadata = {
  title: 'Soporte y preguntas frecuentes',
  description:
    'Cómo contactarnos, en cuánto tiempo respondemos y las respuestas a las dudas más comunes sobre ConstructorPro.',
  ...metadataBorrador(),
};

/**
 * Soporte + preguntas frecuentes.
 *
 * Las FAQ aquí no son marketing: son el lugar donde queda por escrito lo que el
 * servicio NO hace, en lenguaje que un constructor lee sin abogado. Una promesa
 * que nunca se hizo explícita es una promesa que después se da por hecha.
 *
 * El compromiso de respuesta va arriba y acotado a propósito. Sin plazo escrito,
 * el usuario asume que se le contesta el domingo por la noche; con un plazo
 * cumplible, la expectativa queda fijada por nosotros y no por él.
 */

/**
 * Pares pregunta/respuesta en texto plano — se pintan en la página y alimentan
 * el JSON-LD de `FAQPage`. Una sola fuente para que el buscador no muestre una
 * respuesta distinta de la que se lee en pantalla.
 */
const FAQS: { p: string; r: string }[] = [
  {
    p: '¿De quién es la información que capturo?',
    r: 'Tuya. No la vendemos, no la usamos para publicidad y no la compartimos con otros usuarios. Puedes exportarla completa desde la aplicación cuando quieras.',
  },
  {
    p: '¿Qué pasa si dejo de usar ConstructorPro?',
    r: 'Puedes exportar toda tu información antes de irte y conservarla. No se queda secuestrada: la exportación está siempre disponible dentro de la aplicación, sin pedírnosla.',
  },
  {
    p: '¿Me sirve para cumplir con el IMSS o con el SAT?',
    r: 'No. La aplicación calcula la raya con los datos que tú capturas, pero no emite recibos de nómina (CFDI) ni presenta nada ante ninguna autoridad. Para el cumplimiento fiscal y laboral necesitas a tu contador.',
  },
  {
    p: '¿La cotización que genera es un contrato?',
    r: 'No. Las cotizaciones, presupuestos y estados de cuenta son documentos informativos para presentarle cuentas claras a tu cliente. El contrato con él es aparte.',
  },
  {
    p: '¿Mis clientes pueden ver lo que gasto o lo que le pago a mi gente?',
    r: 'No. El cliente solo ve su cotización aprobada, el avance de su obra y lo que ha pagado. Nunca ve costos internos, nómina, destajos, proveedores ni datos de otros clientes. Esa separación está hecha en la base de datos, no solo en la pantalla.',
  },
  {
    p: '¿Quién puede ver los comprobantes y los planos que subo?',
    r: 'Los archivos se guardan en almacenamiento privado: no tienen dirección pública ni aparecen en buscadores. Los planos y archivos de cotización los ve el personal de tu empresa, nunca tus clientes. Los comprobantes de pago son más estrechos todavía: solo administrador, supervisor y contador; ni el personal de campo ni tus clientes, porque un comprobante suele traer datos bancarios.',
  },
  {
    p: '¿Revisan lo que subo?',
    r: 'No. No abrimos tus archivos ni los usamos para nada distinto a mostrártelos dentro de la aplicación. Tampoco los analizamos en busca de virus, así que sube solo material del que tengas certeza. Y si borras el registro al que pertenece un archivo, el archivo se borra del almacenamiento, no solo de la pantalla.',
  },
  {
    p: '¿Funciona sin internet en la obra?',
    r: 'Sí. En el celular puedes pasar lista y capturar aunque no haya señal; se guarda en el teléfono y se sincroniza solo cuando vuelve el internet.',
  },
  {
    p: '¿Y si pierdo el celular o se descompone?',
    r: 'Lo que ya se sincronizó está en tu cuenta y lo recuperas al entrar desde otro dispositivo. Lo que se capturó sin señal y nunca alcanzó a sincronizar, no. Por eso conviene abrir la app con internet de vez en cuando y exportar tu respaldo con regularidad.',
  },
  {
    p: '¿Cómo la instalo en iPhone?',
    r: 'Por ahora la aplicación instalable es para Android. Para iPhone estamos preparando la vía de instalación; mientras tanto puedes usar el panel desde el navegador del teléfono.',
  },
];

export default function SoportePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.p,
      acceptedAnswer: { '@type': 'Answer', text: f.r },
    })),
  };

  return (
    <PaginaLegal
      titulo="Soporte"
      entradilla="Cómo localizarnos, en cuánto tiempo contestamos y las dudas que más nos llegan."
    >
      {/* JSON-LD de FAQPage. Se genera del mismo arreglo que se pinta abajo. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Seccion titulo="Cómo contactarnos">
        <p>
          El canal de soporte es el correo{' '}
          <a
            href={`mailto:${RESPONSABLE.correo}`}
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            {RESPONSABLE.correo}
          </a>
          . Escribir por ahí deja registro de tu solicitud, que es lo que nos permite darle
          seguimiento y contestarte con orden.
        </p>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <p className="font-medium text-neutral-900">Nuestro compromiso de respuesta</p>
          <p className="mt-2 text-sm text-neutral-600">
            Respondemos dentro de{' '}
            {COMPROMISO_RESPUESTA.plazo ?? <Pendiente que="plazo de respuesta de soporte" />} en
            horario de{' '}
            {COMPROMISO_RESPUESTA.horario ?? <Pendiente que="horario de atención" />}.
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            Fuera de ese horario también puedes escribir: tu mensaje entra en la fila y se atiende al
            siguiente día hábil. Responder es un compromiso; resolver de inmediato no siempre es
            posible, y cuando algo tome más tiempo te lo diremos con una fecha.
          </p>
        </div>
      </Seccion>

      <Seccion titulo="Preguntas frecuentes">
        <div className="space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.p}
              className="group rounded-xl border border-neutral-200 bg-white p-4 open:shadow-sm"
            >
              <summary className="cursor-pointer list-none font-medium text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2">
                {f.p}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.r}</p>
            </details>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Si necesitas el detalle formal">
        <p>
          El{' '}
          <Link
            href="/privacidad"
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            aviso de privacidad
          </Link>{' '}
          explica qué datos guardamos y cómo ejercer tus derechos. Los{' '}
          <Link
            href="/terminos"
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            términos del servicio
          </Link>{' '}
          detallan el alcance de la herramienta y la responsabilidad de cada parte.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
