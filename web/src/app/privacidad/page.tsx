import type { Metadata } from 'next';
import Link from 'next/link';
import { PaginaLegal, Seccion } from '@/components/legal/pagina-legal';
import { NombreResponsable, Pendiente } from '@/components/legal/pendiente';
import { ARCHIVOS, CATEGORIAS_DATOS, RESPONSABLE, TERCEROS, metadataBorrador } from '@/lib/legal/datos';

export const metadata: Metadata = {
  title: 'Aviso de privacidad',
  description:
    'Qué datos trata ConstructorPro, para qué, con quién se comparten y cómo ejercer tus derechos ARCO.',
  ...metadataBorrador(),
};

/**
 * Aviso de privacidad (LFPDPPP, art. 15-17).
 *
 * ⚠️ SUSTITUYE al texto de `POLITICA_PRIVACIDAD.md` / `privacy_policy.html` de la
 * raíz del repo, que quedó desfasado: aquel dice que la app no usa servidor ni
 * cuentas ni analítica, y hoy usa Supabase, Auth y Sentry. Al publicar esta
 * página hay que actualizar aquellos dos archivos y la ficha de la app para que
 * apunten aquí; si no, quedan dos avisos vivos que se contradicen, que es peor
 * que tener uno solo malo.
 */
export default function PrivacidadPage() {
  return (
    <PaginaLegal
      titulo="Aviso de privacidad"
      entradilla="Qué información guardamos, para qué la usamos y qué puedes hacer con ella."
    >
      <Seccion titulo="1. Quién es responsable de tus datos">
        <p>
          El responsable del tratamiento de tus datos personales es <NombreResponsable />, con
          domicilio en {RESPONSABLE.domicilio ?? <Pendiente que="domicilio del responsable" />}.
        </p>
        <p>
          Para cualquier asunto relacionado con este aviso puedes escribir a{' '}
          <a
            href={`mailto:${RESPONSABLE.correo}`}
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            {RESPONSABLE.correo}
          </a>
          .
        </p>
      </Seccion>

      <Seccion titulo="2. Qué datos tratamos">
        <p>
          ConstructorPro es una herramienta de trabajo: casi toda la información que contiene la
          capturas tú. Estas son las categorías.
        </p>
        <ul className="space-y-3">
          {CATEGORIAS_DATOS.map((c) => (
            <li key={c.titulo} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="font-medium text-neutral-900">{c.titulo}</p>
              <p className="mt-1 text-sm text-neutral-600">{c.detalle}</p>
            </li>
          ))}
        </ul>
        <p>
          No tratamos datos personales sensibles en el sentido de la ley —origen racial o étnico,
          estado de salud, creencias religiosas, preferencia sexual y similares—, no usamos tu
          ubicación (GPS), no leemos tus contactos y no mostramos publicidad.
        </p>
        <p>
          Sí puede haber <strong>datos financieros</strong> entre los archivos que adjuntas: el
          comprobante de una transferencia o de un cheque trae número de cuenta y banco. Por eso el
          acceso a los comprobantes es más estrecho que el del resto de la información; lo
          explicamos en el punto 9.
        </p>
      </Seccion>

      <Seccion titulo="3. Para qué los usamos">
        <p>Únicamente para prestarte el servicio. En concreto:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Darte acceso a tu cuenta y mantener tu sesión abierta.</li>
          <li>Guardar y mostrar tus obras, cotizaciones, nómina y movimientos de caja.</li>
          <li>Generar los documentos y reportes que descargas o compartes.</li>
          <li>
            Dar acceso a tus clientes al portal, únicamente a la información de su propia obra.
          </li>
          <li>Detectar y corregir fallas de la aplicación, y protegerla contra abuso.</li>
        </ul>
        <p>
          No vendemos tu información ni la de tus clientes, y no la usamos para fines publicitarios
          ni la compartimos con anunciantes.
        </p>
      </Seccion>

      <Seccion titulo="4. Dónde se guardan y quién más participa">
        <p>
          Tus datos se guardan en servidores de proveedores contratados para operar el servicio, no
          en una computadora nuestra. Estos son los que participan y para qué:
        </p>
        <ul className="space-y-3">
          {TERCEROS.map((t) => (
            <li key={t.nombre} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="font-medium text-neutral-900">{t.nombre}</p>
              <p className="mt-1 text-sm text-neutral-600">{t.proposito}</p>
              <p className="mt-1.5 text-sm text-neutral-500">{t.datos}</p>
            </li>
          ))}
        </ul>
        <p>
          Estos proveedores tratan la información por nuestra instrucción y para las finalidades de
          arriba. Algunos operan servidores fuera de México; al usar el servicio aceptas esa
          transferencia, que es necesaria para poder prestarlo.
        </p>
      </Seccion>

      <Seccion titulo="5. Sobre la aplicación del celular">
        <p>
          La app guarda una copia de tu información <strong>dentro del propio teléfono</strong> para
          que puedas trabajar en la obra sin señal, y la <strong>sincroniza</strong> con el servidor
          en cuanto vuelve el internet. Es decir: la información vive en los dos lados.
        </p>
        <p>
          Los permisos que pide (archivos, cámara y notificaciones) se usan solo para adjuntar
          fotos, exportar documentos y recordarte la nómina. No se usan para recolectar nada.
        </p>
        <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          Aviso importante: versiones anteriores de la app funcionaban totalmente sin servidor, y su
          política de privacidad así lo decía. Desde que existen las cuentas y la sincronización eso
          cambió, y este documento es el que describe cómo funciona hoy.
        </p>
      </Seccion>

      <Seccion titulo="6. Los datos de tus trabajadores y clientes">
        <p>
          Cuando capturas a un colaborador o a un cliente, estás tratando datos personales de otra
          persona. Frente a ella, <strong>el responsable eres tú</strong>: eres quien decide qué
          captura, para qué y por cuánto tiempo. Nosotros actuamos como encargado, es decir,
          guardamos y procesamos esa información siguiendo tus instrucciones.
        </p>
        <p>
          Eso incluye tu obligación de informarles y de tener base para tratar sus datos. Lo
          detallamos en los{' '}
          <Link
            href="/terminos"
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            Términos del servicio
          </Link>
          .
        </p>
      </Seccion>

      <Seccion titulo="7. Cuánto tiempo conservamos la información">
        <p>
          Mientras tu cuenta esté activa. Si la cancelas, conservamos la información el tiempo
          necesario para cerrar la relación y cumplir obligaciones legales, y después la eliminamos.
          Puedes exportar tus datos en cualquier momento desde la propia aplicación, antes o después
          de cancelar.
        </p>
        <p>
          Los archivos que adjuntas se eliminan junto con el registro al que pertenecen: si borras
          el comprobante de un movimiento o un archivo de una cotización, se borra del
          almacenamiento, no solo de la pantalla.
        </p>
      </Seccion>

      <Seccion titulo="8. Tus derechos (ARCO)">
        <p>
          Tienes derecho a <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong> si
          son incorrectos, <strong>cancelarlos</strong> y <strong>oponerte</strong> a su uso.
          También puedes revocar tu consentimiento.
        </p>
        <p>
          Para ejercerlos, escribe a{' '}
          <a
            href={`mailto:${RESPONSABLE.correo}`}
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            {RESPONSABLE.correo}
          </a>{' '}
          indicando tu nombre, un medio de contacto, qué derecho quieres ejercer y sobre qué datos.
          Podemos pedirte que acredites tu identidad antes de responder.
        </p>
        <p>
          Si no quedas conforme con la respuesta, puedes acudir al INAI o a la autoridad que lo
          sustituya.
        </p>
      </Seccion>

      <Seccion titulo="9. Seguridad y quién ve tus archivos">
        <p>
          El acceso a la información está separado por empresa a nivel de la base de datos, no solo
          en la pantalla: cada quien solo puede leer lo de su propia empresa, y un cliente solo lo de
          su propia obra. Las contraseñas se guardan cifradas y nunca podemos verlas.
        </p>
        <p>
          Los archivos que subes se guardan en almacenamiento <strong>privado</strong>: no tienen
          una dirección pública, no aparecen en buscadores y no se pueden abrir sin haber iniciado
          sesión con permiso para verlos. Quién ve qué depende del tipo de archivo:
        </p>
        <ul className="space-y-3">
          {ARCHIVOS.tipos.map((t) => (
            <li key={t.que} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="font-medium text-neutral-900">{t.que}</p>
              <p className="mt-1 text-sm text-neutral-600">{t.ejemplos}</p>
              <p className="mt-1.5 text-sm text-neutral-600">{t.quienVe}</p>
              <p className="mt-1.5 text-sm text-neutral-500">Hasta {t.limite}.</p>
            </li>
          ))}
        </ul>
        <p>
          Se aceptan {ARCHIVOS.formatos}. No revisamos el contenido de lo que subes y{' '}
          <strong>no analizamos los archivos en busca de virus</strong>, así que sube únicamente
          material del que tengas certeza.
        </p>
        <p>
          Ningún sistema es infalible. Si llegara a ocurrir una vulneración que afecte de forma
          significativa tus datos, te lo informaremos.
        </p>
      </Seccion>

      <Seccion titulo="10. Menores de edad">
        <p>El servicio está dirigido a uso profesional y no está destinado a menores de 18 años.</p>
      </Seccion>

      <Seccion titulo="11. Cambios a este aviso">
        <p>
          Si cambiamos este aviso, publicaremos la nueva versión en esta misma página con su fecha de
          vigencia. Cuando el cambio sea de fondo, te lo avisaremos dentro de la aplicación.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
