import type { Metadata } from 'next';
import Link from 'next/link';
import { PaginaLegal, Seccion } from '@/components/legal/pagina-legal';
import { NombreResponsable, Pendiente } from '@/components/legal/pendiente';
import { ARCHIVOS, RESPONSABLE, metadataBorrador } from '@/lib/legal/datos';

export const metadata: Metadata = {
  title: 'Términos del servicio',
  description:
    'Condiciones de uso de ConstructorPro: alcance del servicio, responsabilidades de cada parte y límites.',
  ...metadataBorrador(),
};

/**
 * Términos del servicio.
 *
 * Este documento es el que de verdad blinda. Cuatro cláusulas cargan casi todo
 * el peso y conviene no diluirlas al editar el texto:
 *
 *  · §4  No es asesoría fiscal, contable ni laboral. La app CALCULA nómina; no
 *        emite CFDI ni presenta nada ante el IMSS o el SAT. Sin esto, el usuario
 *        que reciba una multa puede sostener que confió en la herramienta.
 *  · §5  Encargado del tratamiento. Los datos de los trabajadores son de su
 *        patrón, no nuestros. Fija quién responde frente a ellos.
 *  · §6  Archivos adjuntos. La app recibe planos y comprobantes de cheque y
 *        transferencia, o sea documentos con datos bancarios de terceros. Fija
 *        que quien los sube responde por tener derecho a subirlos, y avisa que
 *        no se analizan (ni por contenido ni por virus).
 *  · §9  Límite de responsabilidad, con la salvedad de dolo y negligencia grave,
 *        que en México no se puede excluir por contrato.
 *
 * §8 (precio) queda deliberadamente neutro: el modelo de negocio no está
 * decidido — misma razón por la que el copy de los CTA de la landing tampoco
 * dice "gratis" ni "prueba". No inventar condiciones comerciales aquí.
 *
 * OJO al insertar secciones: la numeración está escrita a mano en cada
 * `<Seccion titulo="…">` y hay referencias cruzadas dentro del texto ("conforme
 * al punto 5"). Si se agrega una en medio, hay que renumerar y revisar esas
 * referencias — y las de `/privacidad`, que apunta al punto 9 de este documento.
 */
export default function TerminosPage() {
  return (
    <PaginaLegal
      titulo="Términos del servicio"
      entradilla="Las reglas del uso de ConstructorPro: qué te damos, qué te toca a ti y hasta dónde llega la responsabilidad de cada quien."
    >
      <Seccion titulo="1. Quiénes somos y qué aceptas">
        <p>
          ConstructorPro es un servicio prestado por <NombreResponsable /> (en adelante,
          “nosotros”). Al crear una cuenta o usar el servicio aceptas estos términos y el{' '}
          <Link
            href="/privacidad"
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            aviso de privacidad
          </Link>
          . Si no estás de acuerdo, no uses el servicio.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué es el servicio">
        <p>
          Una herramienta para llevar el control administrativo de obras de construcción:
          cotizaciones, presupuestos, asistencia, cálculo de nómina, flujo de caja, reportes y un
          portal para que tus clientes consulten su obra. Se usa desde el navegador y desde la
          aplicación móvil.
        </p>
        <p>
          Es una herramienta de registro y cálculo. No ejecuta pagos, no dispersa dinero, no emite
          comprobantes fiscales y no realiza trámites ante ninguna autoridad.
        </p>
      </Seccion>

      <Seccion titulo="3. Tu cuenta">
        <p>
          Eres responsable de la información que capturas y de mantener tu contraseña en secreto.
          Todo lo que ocurra desde tu cuenta se considera hecho por ti. Si crees que alguien más
          entró, avísanos de inmediato.
        </p>
        <p>
          Cuando das acceso a otras personas —tu equipo de oficina, un contador o un cliente— eres
          tú quien decide qué ve cada quien.
        </p>
      </Seccion>

      <Seccion titulo="4. No somos tus asesores fiscales, contables ni laborales">
        <p>
          Esta es la parte más importante de este documento, así que va sin rodeos:{' '}
          <strong>
            ConstructorPro no presta asesoría fiscal, contable, laboral ni jurídica.
          </strong>
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            El cálculo de nómina es una <strong>ayuda de cálculo</strong> basada en los datos y las
            reglas que tú capturas. No sustituye el recibo de nómina (CFDI) ni el cumplimiento de tus
            obligaciones ante el IMSS, el INFONAVIT o el SAT.
          </li>
          <li>
            Las cotizaciones, presupuestos y estados de cuenta que genera la aplicación son{' '}
            <strong>documentos informativos</strong>. No son facturas, no son comprobantes fiscales
            y por sí solos no constituyen un contrato con tu cliente.
          </li>
          <li>
            Los resultados dependen por completo de lo que hayas capturado. Revisa cualquier cifra
            antes de pagarla, cobrarla o declararla.
          </li>
        </ul>
        <p>
          Para el cumplimiento fiscal y laboral, consulta a un contador o a un abogado. La decisión
          de pagar, cobrar o declarar con base en lo que muestra la aplicación es tuya.
        </p>
      </Seccion>

      <Seccion titulo="5. Los datos de tus trabajadores y clientes">
        <p>
          Cuando capturas a un colaborador o a un cliente estás tratando datos personales de otra
          persona. Frente a ella, <strong>el responsable eres tú</strong>. Nosotros actuamos como{' '}
          <strong>encargado</strong>: guardamos y procesamos esa información únicamente por tu
          instrucción y para prestarte el servicio.
        </p>
        <p>En consecuencia, te corresponde a ti:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Informar a esas personas sobre el tratamiento de sus datos.</li>
          <li>Tener una base legítima para capturarlos y conservarlos.</li>
          <li>Atender las solicitudes de acceso, rectificación, cancelación u oposición que te hagan.</li>
        </ul>
        <p>Y a nosotros nos corresponde:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Tratar esa información solo para operar el servicio, nunca para fines propios.</li>
          <li>Guardar confidencialidad y aplicar medidas de seguridad razonables.</li>
          <li>
            Usar únicamente los proveedores que aparecen listados en el aviso de privacidad, con las
            mismas obligaciones.
          </li>
          <li>Devolverte o eliminar la información cuando termine la relación.</li>
        </ul>
      </Seccion>

      <Seccion titulo="6. Los archivos que subes">
        <p>
          La aplicación te deja adjuntar {ARCHIVOS.formatos} a tus cotizaciones y a tus movimientos
          de caja: planos, fichas técnicas y comprobantes de pago. Sobre eso aplican estas reglas.
        </p>
        <p>
          <strong>Respondes por lo que subes.</strong> Al adjuntar un archivo declaras que tienes
          derecho a tenerlo y a guardarlo aquí. Esto importa especialmente cuando el documento
          contiene datos de otra persona —una identificación, un estado de cuenta, un cheque a
          nombre de un tercero—: esos datos siguen siendo responsabilidad tuya conforme al punto 5.
        </p>
        <p>
          <strong>No revisamos ni analizamos el contenido.</strong> No abrimos tus archivos, no los
          usamos para nada distinto a mostrártelos dentro de la aplicación y{' '}
          <strong>no los examinamos en busca de virus</strong>. Sube solo material del que tengas
          certeza.
        </p>
        <p>
          <strong>Hay límites técnicos.</strong> Cada tipo de archivo tiene un tamaño máximo y una
          lista de formatos permitidos; lo que quede fuera simplemente no se sube. Los límites
          vigentes están descritos en el{' '}
          <Link
            href="/privacidad"
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            aviso de privacidad
          </Link>
          , junto con el detalle de quién puede ver cada tipo de archivo.
        </p>
        <p>
          <strong>Se borran contigo.</strong> Al eliminar el registro al que pertenece un archivo,
          el archivo se elimina del almacenamiento. Al cancelar tu cuenta, se eliminan con el resto
          de tu información, después de darte oportunidad de exportarla.
        </p>
        <p>
          No podemos garantizar que un archivo dañado, incompleto o mal escaneado sea legible
          después. Si un documento es importante para ti, conserva tu propio original: la aplicación
          es donde lo tienes a la mano, no tu única copia.
        </p>
      </Seccion>

      <Seccion titulo="7. Tu información es tuya">
        <p>
          La información que capturas te pertenece. No la vendemos, no la usamos para fines
          publicitarios y no la compartimos con otros usuarios del servicio.
        </p>
        <p>
          Puedes exportarla en cualquier momento desde la propia aplicación, con o sin nuestra
          intervención, incluso si decides dejar de usar el servicio. Te recomendamos hacerlo con
          regularidad y guardar tu copia: es tu respaldo, y es el que te deja seguir trabajando pase
          lo que pase de nuestro lado.
        </p>
      </Seccion>

      <Seccion titulo="8. Disponibilidad, cambios y costo">
        <p>
          Procuramos que el servicio esté disponible de forma continua, pero puede haber
          interrupciones por mantenimiento, fallas de nuestros proveedores o causas fuera de nuestro
          control. No garantizamos disponibilidad ininterrumpida.
        </p>
        <p>
          La aplicación móvil está pensada para seguir funcionando sin señal y sincronizar después.
          Aun así, ninguna sincronización es infalible: conserva tus propios respaldos.
        </p>
        <p>
          Podemos agregar, cambiar o retirar funciones. Si una condición comercial cambia —incluido
          el costo del servicio— te lo avisaremos con anticipación razonable y podrás dejar de
          usarlo y llevarte tu información.
        </p>
      </Seccion>

      <Seccion titulo="9. Límite de responsabilidad">
        <p>
          El servicio se presta “tal como está”. Trabajamos para que los cálculos sean correctos y
          la información esté disponible, pero no garantizamos que esté libre de errores ni que sea
          apto para un fin específico distinto al descrito aquí.
        </p>
        <p>
          En la medida que la ley lo permita, no respondemos por pérdida de ganancias, pérdida de
          oportunidades, daños indirectos o consecuenciales, ni por decisiones de negocio tomadas con
          base en la información de la aplicación. Nuestra responsabilidad total, por cualquier
          concepto, no excederá lo que nos hayas pagado por el servicio en los doce meses previos al
          hecho que la origine.
        </p>
        <p>
          Nada de lo anterior limita la responsabilidad por dolo, mala fe o negligencia grave, que
          conforme a la ley no puede excluirse.
        </p>
      </Seccion>

      <Seccion titulo="10. Uso aceptable">
        <p>No puedes usar el servicio para:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Actividades ilícitas o para almacenar información obtenida de forma indebida.</li>
          <li>Intentar acceder a datos de otras empresas o de otros clientes.</li>
          <li>Sobrecargarlo, analizarlo en busca de vulnerabilidades sin autorización, o revenderlo.</li>
          <li>
            Adjuntar archivos con contenido ilícito, con programas maliciosos, o con documentos de
            terceros que no tengas derecho a guardar.
          </li>
          <li>
            Usar el almacenamiento de archivos como respaldo general: es para el material de tus
            obras, no un disco en la nube.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="11. Suspensión y terminación">
        <p>
          Puedes dejar de usar el servicio y cancelar tu cuenta cuando quieras. Nosotros podemos
          suspenderla si detectamos un uso que incumpla estos términos o que ponga en riesgo a otras
          personas, avisándote salvo que la urgencia lo impida.
        </p>
        <p>
          En cualquier caso te daremos oportunidad razonable de exportar tu información antes de
          eliminarla.
        </p>
      </Seccion>

      <Seccion titulo="12. Cambios a estos términos">
        <p>
          Podemos actualizarlos. Publicaremos la nueva versión en esta página con su fecha de
          vigencia y, cuando el cambio sea de fondo, te lo avisaremos dentro de la aplicación. Si
          sigues usando el servicio después, se entiende que los aceptas.
        </p>
      </Seccion>

      <Seccion titulo="13. Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier
          controversia, las partes se someten a los tribunales competentes de{' '}
          {RESPONSABLE.domicilio ?? <Pendiente que="domicilio del responsable" />}, renunciando a
          cualquier otro fuero.
        </p>
        <p>
          Dudas sobre estos términos:{' '}
          <a
            href={`mailto:${RESPONSABLE.correo}`}
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            {RESPONSABLE.correo}
          </a>
          .
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
