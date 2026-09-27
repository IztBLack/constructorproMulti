import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';
import { listObras } from '@/lib/data/obras';
import { listColaboradores } from '@/lib/data/equipo';
import { getRepse, listObligaciones, listSirocs, listSubcontratistas, TIPOS_DOCUMENTO_SUB } from '@/lib/data/cumplimiento';
import { formatDate } from '@/lib/data/format';
import { hoyMxMs, msAFechaInput, partesTz, medianocheMx } from '@/lib/data/tz';
import {
  avisoRepse,
  avisoSiroc,
  estadoObligacion,
  inicioVentanaRenovacion,
  periodosRelevantes,
  type NivelSemaforo,
} from '@/lib/cumplimiento/avisos';
import { resumenExpediente } from '@/lib/cumplimiento/expediente';
import { LEYENDA_CUMPLIMIENTO } from '@/lib/cumplimiento/enlaces';
import { EnlaceOficial, Semaforo } from '@/components/cumplimiento/semaforo';
import { ArchivoCumplimiento } from '@/components/cumplimiento/archivo-cumplimiento';
import { BotonEntregado, FormRepse, NuevoSubcontratista } from './formularios';

export const dynamic = 'force-dynamic';

const GRAVEDAD: Record<NivelSemaforo, number> = { VENCIDO: 0, URGENTE: 1, PRONTO: 2, SIN_FECHA: 3, VIGENTE: 4 };
const NOMBRE_DOC = new Map(TIPOS_DOCUMENTO_SUB.map((t) => [t.valor, t.texto]));

function Seccion({ id, titulo, descripcion, children }: { id: string; titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <Card>
      <section aria-labelledby={id} className="space-y-4">
        <div className="space-y-1">
          <h2 id={id} className="text-base font-semibold text-neutral-900">
            {titulo}
          </h2>
          {descripcion && <p className="text-sm text-neutral-600">{descripcion}</p>}
        </div>
        {children}
      </section>
    </Card>
  );
}

/**
 * Tablero de CUMPLIMIENTO (RF5.1–RF5.6): lo que toca con el IMSS, la STPS y el
 * Infonavit, con semáforo. La app no presenta nada: recuerda, guarda la prueba
 * y pone el enlace al sitio oficial.
 */
export default async function CumplimientoPage() {
  const hoy = hoyMxMs();
  const [{ data: obras }, { data: sirocs }, repse, { data: obligaciones }, { data: subs }, { data: colaboradores }] =
    await Promise.all([listObras(), listSirocs(), getRepse(), listObligaciones(), listSubcontratistas(), listColaboradores()]);

  // ── SIROC por obra ─────────────────────────────────────────────────────
  const sirocPorObra = new Map(sirocs.map((s) => [s.obra_id, s]));
  const filasSiroc = obras
    .map((o) => ({ obra: o, siroc: sirocPorObra.get(o.id) ?? null }))
    // Las obras cerradas solo aparecen si su SIROC quedó con algo pendiente.
    .filter(({ obra, siroc }) => obra.activa || (siroc && !['TERMINADA', 'NO_APLICA'].includes(siroc.estado)))
    .map((f) => ({ ...f, aviso: avisoSiroc(f.siroc, f.obra.fecha_inicio, hoy) }))
    .sort((a, b) => GRAVEDAD[a.aviso.nivel] - GRAVEDAD[b.aviso.nivel] || a.obra.nombre.localeCompare(b.obra.nombre, 'es'));

  // ── REPSE propio ───────────────────────────────────────────────────────
  const aRepse = avisoRepse(repse?.vigencia_hasta ?? null, hoy);

  // ── ICSOE / SISUB ──────────────────────────────────────────────────────
  const { anterior, proximo } = periodosRelevantes(hoy);
  const entregas = (['ICSOE', 'SISUB'] as const).flatMap((tipo) =>
    [anterior, proximo].map((p) => {
      const fila = obligaciones.find((o) => o.tipo === tipo && o.periodo === p.clave) ?? null;
      return { tipo, periodo: p, fila, estado: estadoObligacion(p.fechaLimite, fila?.entregado_at, hoy) };
    }),
  );

  // ── Subcontratistas ────────────────────────────────────────────────────
  const expedientes = subs
    .map((s) => ({ sub: s, resumen: resumenExpediente(s.documentos, hoy) }))
    .sort((a, b) => GRAVEDAD[a.resumen.nivel] - GRAVEDAD[b.resumen.nivel] || a.sub.nombre.localeCompare(b.sub.nombre, 'es'));

  // Raya: por defecto el mes en curso hasta hoy.
  const p = partesTz(hoy);
  const inicioMes = msAFechaInput(medianocheMx(p.year, p.month, 1));

  return (
    <div className="space-y-6">
      <PageHeader
        title="IMSS y papeles"
        description="Lo que toca con el IMSS, la STPS y el Infonavit, con su fecha y su comprobante."
      />

      <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{LEYENDA_CUMPLIMIENTO}</p>

      <Seccion
        id="siroc"
        titulo="Registro de obras (SIROC)"
        descripcion="Cada obra se registra ante el IMSS dentro de los 5 días hábiles siguientes a su inicio. Los datos se anotan en el detalle de cada obra."
      >
        {filasSiroc.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay obras activas.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {filasSiroc.map(({ obra, siroc, aviso }) => (
              <li key={obra.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-900">
                    <Semaforo nivel={aviso.nivel} />
                    {obra.nombre}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {aviso.titulo}. {aviso.detalle}
                    {siroc?.numero_registro ? ` · Registro ${siroc.numero_registro}` : ''}
                  </p>
                </div>
                <Link
                  href={`/admin/obras/${obra.id}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline underline-offset-2"
                >
                  Abrir la obra<span className="sr-only"> {obra.nombre}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <EnlaceOficial clave="siroc" />
      </Seccion>

      <Seccion
        id="repse"
        titulo="Tu registro REPSE"
        descripcion="Solo si prestas servicios u obras especializadas a otras empresas. Dura 3 años y la renovación se pide en los 3 meses antes de que venza."
      >
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Semaforo nivel={aRepse.nivel} />
          <span className="text-neutral-700">
            {repse?.vigencia_hasta
              ? `${aRepse.texto} (${formatDate(repse.vigencia_hasta)}).`
              : 'Anota el folio y la vigencia de tu aviso de registro.'}
            {aRepse.renovarYa && repse?.vigencia_hasta
              ? ` Ya puedes pedir la renovación (desde el ${formatDate(inicioVentanaRenovacion(repse.vigencia_hasta))}).`
              : ''}
          </span>
        </p>
        <FormRepse repse={repse} />
        <EnlaceOficial clave="padronRepse" />
      </Seccion>

      <Seccion
        id="entregas"
        titulo="Entregas cada cuatro meses (ICSOE y SISUB)"
        descripcion="Si tienes REPSE, informas tus contratos al IMSS (ICSOE) y al Infonavit (SISUB) a más tardar el 17 de enero, mayo y septiembre. Si el 17 es inhábil, se recorre al siguiente día hábil."
      >
        <ul className="divide-y divide-neutral-100">
          {entregas.map(({ tipo, periodo, fila, estado }) => (
            <li key={`${tipo}-${periodo.clave}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-900">
                  <Semaforo nivel={estado.nivel} />
                  {tipo} · {periodo.etiqueta}
                </p>
                <p className="text-sm text-neutral-600">
                  Fecha límite {formatDate(periodo.fechaLimite)} · {estado.texto}
                  {fila?.entregado_at ? ` el ${formatDate(fila.entregado_at)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <BotonEntregado tipo={tipo} periodo={periodo.clave} entregado={Boolean(fila?.entregado_at)} />
                {fila?.entregado_at && (
                  <ArchivoCumplimiento ambito="obligacion" registroId={fila.id} path={fila.comprobante_path} etiqueta="acuse" puedeEditar />
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <EnlaceOficial clave="icsoe" />
          <EnlaceOficial clave="sisub" />
        </div>
      </Seccion>

      <Seccion
        id="subcontratistas"
        titulo="Expediente de subcontratistas"
        descripcion="Si tu subcontratista no tiene REPSE vigente, quien le paga puede perder la deducción y quedar como responsable solidario. Guarda aquí sus papeles y su vencimiento."
      >
        <NuevoSubcontratista colaboradores={colaboradores.map((c) => ({ id: c.id, nombre: c.nombre }))} />
        {expedientes.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no das de alta subcontratistas.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {expedientes.map(({ sub, resumen }) => (
              <li key={sub.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-900">
                    <Semaforo nivel={resumen.nivel} />
                    {sub.nombre}
                    {sub.especialidad && <span className="font-normal text-neutral-500">· {sub.especialidad}</span>}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {resumen.faltan.length > 0
                      ? `Falta: ${resumen.faltan.map((t) => NOMBRE_DOC.get(t) ?? t).join(', ')}.`
                      : 'Expediente completo.'}
                    {Object.entries(resumen.porTipo)
                      .filter(([, s]) => s && s.nivel !== 'VIGENTE')
                      .map(([t, s]) => ` ${NOMBRE_DOC.get(t as never) ?? t}: ${s!.texto.toLowerCase()}.`)
                      .join('')}
                  </p>
                </div>
                <Link
                  href={`/admin/cumplimiento/subcontratistas/${sub.id}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline underline-offset-2"
                >
                  Ver expediente<span className="sr-only"> de {sub.nombre}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <EnlaceOficial clave="padronRepse" />
          <EnlaceOficial clave="validarOpinionSat" />
        </div>
      </Seccion>

      <Seccion
        id="contador"
        titulo="Para tu contador"
        descripcion="La app no calcula cuotas del IMSS, ISR ni Infonavit. Te da la raya tal como la llevas y los datos de tu gente, para que tu contador haga el cálculo en su sistema."
      >
        <form method="get" action="/admin/cumplimiento/raya" className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700">Desde</span>
            <input type="date" name="desde" required defaultValue={inicioMes} className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700">Hasta</span>
            <input type="date" name="hasta" required defaultValue={msAFechaInput(hoy)} className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900" />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Descargar raya en Excel
          </button>
        </form>
        <Link
          href="/admin/cumplimiento/colaboradores"
          className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline underline-offset-2"
        >
          NSS, CURP y RFC de tus colaboradores
        </Link>
      </Seccion>
    </div>
  );
}
