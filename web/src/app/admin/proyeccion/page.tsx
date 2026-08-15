import { PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { navegarSemana, semanaDe } from '@/lib/data/nomina';
import { indiceDiaSemana, puedeVerProyeccion } from '@/lib/data/proyeccion-nomina';
import { cargarDatosProyeccion } from '@/lib/data/proyeccion-nomina-server';
// `hoyMxMs` y no `Date.now()`: en Vercel el servidor corre en UTC, y calcular
// «hoy» con el reloj del proceso adelanta el día durante la tarde-noche de
// México — la proyección arrancaría a alguien un día después del que toca.
import { hoyMxMs } from '@/lib/data/tz';
import { TablaProyeccion } from './tabla-proyeccion';

export const dynamic = 'force-dynamic';

interface PageProps {
  /** `?semana=<epoch ms del lunes>`; sin ella, la semana en curso. */
  searchParams: Promise<{ semana?: string }>;
}

export default async function ProyeccionPage({ searchParams }: PageProps) {
  const { rol } = await getEmpresaUsuario();

  // Esto es presentación, no seguridad: las policies de Supabase son la barrera
  // real. Pero la pantalla enseña el salario de cada persona junto a su nombre,
  // así que aquí sí se corta antes de leer nada.
  if (!puedeVerProyeccion(rol)) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Proyección de nómina"
          description="Solo los socios y los supervisores pueden ver esta pantalla."
        />
      </div>
    );
  }

  const { semana } = await searchParams;
  const anclaMs = semana ? Number(semana) : NaN;
  const rango = Number.isFinite(anclaMs)
    ? navegarSemana(anclaMs, 0)
    : semanaDe(new Date());

  const datos = await cargarDatosProyeccion(rango.inicioMs, rango.finMs);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proyección de nómina"
        description="Arma la raya esperada de la semana. Es un escenario: no escribe en el pase de lista."
      />
      {datos.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar los datos: {datos.error}
        </p>
      ) : (
        <TablaProyeccion
          lunesMs={rango.inicioMs}
          hoyIndice={indiceDiaSemana(rango.inicioMs, hoyMxMs())}
          hoyMs={hoyMxMs()}
          colaboradores={datos.colaboradores}
          puestos={datos.puestos}
          asistencias={datos.asistencias}
          destajos={datos.destajos}
          obraPorColaborador={datos.obraPorColaborador}
          cuadrillaPorColaborador={datos.cuadrillaPorColaborador}
          nombreObra={datos.nombreObra}
          nombreCuadrilla={datos.nombreCuadrilla}
        />
      )}
    </div>
  );
}
