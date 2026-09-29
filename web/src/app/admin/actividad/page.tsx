import { redirect } from 'next/navigation';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listUsuariosEmpresa } from '@/lib/data/usuarios-empresa';
import {
  ACCION_TEXTO,
  TABLAS_ACTIVIDAD,
  listActividad,
  type Actividad,
} from '@/lib/data/actividad';
import { formatDateTime } from '@/lib/data/format';
import { fechaInputAMs, siguienteMedianocheMx } from '@/lib/data/tz';
import { nombreRol } from '@/lib/auth/roles';
import {
  BackLink,
  Badge,
  EmptyState,
  LinkButton,
  PageHeader,
  TBody,
  THead,
  TableContainer,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Registro de actividad' };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TONO: Record<Actividad['accion'], BadgeTone> = {
  CREAR: 'green',
  EDITAR: 'blue',
  BORRAR: 'amber',
  RESTAURAR: 'neutral',
  ELIMINAR: 'red',
};

function uno(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/**
 * Registro de actividad (RF6.4): quién cambió qué en el dinero y en los
 * permisos. Solo el administrador.
 *
 * El `redirect` es cortesía; la barrera es la RLS de `actividad` (0042), que
 * solo deja leer al admin, y un trigger que impide editarla o borrarla.
 */
export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let rol: string;
  try {
    ({ rol } = await getEmpresaUsuario());
  } catch {
    redirect('/admin');
  }
  if (rol !== 'admin') redirect('/admin');

  const sp = await searchParams;
  const usuario = UUID.test(uno(sp.usuario)) ? uno(sp.usuario) : '';
  const tabla = TABLAS_ACTIVIDAD[uno(sp.tabla)] ? uno(sp.tabla) : '';
  const desdeInput = FECHA.test(uno(sp.desde)) ? uno(sp.desde) : '';
  const hastaInput = FECHA.test(uno(sp.hasta)) ? uno(sp.hasta) : '';
  const antes = Number(uno(sp.antes));

  const [{ data: filas, error, hayMas }, { data: usuarios }] = await Promise.all([
    listActividad({
      userId: usuario || undefined,
      tabla: tabla || undefined,
      desde: desdeInput ? fechaInputAMs(desdeInput) : undefined,
      hasta: hastaInput ? siguienteMedianocheMx(fechaInputAMs(hastaInput)) : undefined,
      antesDe: Number.isFinite(antes) && antes > 0 ? antes : undefined,
    }),
    listUsuariosEmpresa(),
  ]);

  const filtrosQs = new URLSearchParams(
    Object.entries({ usuario, tabla, desde: desdeInput, hasta: hastaInput }).filter(([, v]) => v),
  );
  const siguiente = hayMas && filas.length > 0
    ? `/admin/actividad?${new URLSearchParams([...filtrosQs, ['antes', String(filas[filas.length - 1].id)]])}`
    : null;

  const control =
    'min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900';

  return (
    <div className="space-y-6">
      <BackLink href="/admin/ajustes">Ajustes</BackLink>
      <PageHeader
        title="Registro de actividad"
        description="Quién agregó, cambió o borró algo de dinero o de permisos: caja, cobros, cotizaciones, extras, estimaciones, compras, pagos, usuarios y módulos. Nadie lo puede editar ni borrar, ni tú."
      />

      <form
        method="get"
        className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-neutral-700">Quién</span>
          <select name="usuario" defaultValue={usuario} className={control}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.nombre ?? u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-neutral-700">Qué</span>
          <select name="tabla" defaultValue={tabla} className={control}>
            <option value="">Todo</option>
            {Object.entries(TABLAS_ACTIVIDAD).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-neutral-700">Desde</span>
          <input type="date" name="desde" defaultValue={desdeInput} className={control} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-neutral-700">Hasta</span>
          <input type="date" name="hasta" defaultValue={hastaInput} className={control} />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="min-h-11 flex-1 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            Filtrar
          </button>
          {filtrosQs.size > 0 && (
            <LinkButton href="/admin/actividad" variant="secondary">
              Quitar filtros
            </LinkButton>
          )}
        </div>
      </form>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el registro: {error}
        </p>
      ) : filas.length === 0 ? (
        <EmptyState
          title="Nada registrado con estos filtros"
          description="Aquí aparece cada cambio de dinero o de permisos desde que se activó el registro."
        />
      ) : (
        <TableContainer>
          <THead>
            <Th>Cuándo</Th>
            <Th>Quién</Th>
            <Th>Qué hizo</Th>
            <Th>Detalle</Th>
          </THead>
          <TBody>
            {filas.map((a) => (
              <Tr key={a.id}>
                <Td className="whitespace-nowrap tabular-nums text-neutral-700">{formatDateTime(a.created_at)}</Td>
                <Td>
                  <span className="font-medium text-neutral-900">
                    {a.usuario_nombre || (a.user_id ? 'Sin nombre' : 'El sistema')}
                  </span>
                  {a.usuario_rol && <div className="text-xs text-neutral-600">{nombreRol(a.usuario_rol)}</div>}
                </Td>
                <Td>
                  <Badge tone={TONO[a.accion]}>{ACCION_TEXTO[a.accion]}</Badge>{' '}
                  <span className="text-neutral-900">{TABLAS_ACTIVIDAD[a.tabla] ?? a.tabla}</span>
                </Td>
                <Td className="text-sm text-neutral-700">
                  {a.resumen && <div className="break-words">{a.resumen}</div>}
                  {a.accion === 'EDITAR' && a.cambios && a.cambios.length > 0 && (
                    <div className="text-xs text-neutral-600">Cambió: {a.cambios.join(', ')}</div>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableContainer>
      )}

      {siguiente && (
        <div className="flex justify-center">
          <LinkButton href={siguiente} variant="secondary">
            Ver más antiguos
          </LinkButton>
        </div>
      )}
    </div>
  );
}
