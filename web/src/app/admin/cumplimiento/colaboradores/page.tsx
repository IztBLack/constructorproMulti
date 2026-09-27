import { BackLink, PageHeader } from '@/components/ui';
import { listColaboradores } from '@/lib/data/equipo';
import { listDatosImss } from '@/lib/data/cumplimiento';
import { FilaDatosImss } from '../formularios';

export const dynamic = 'force-dynamic';

/**
 * NSS, CURP y RFC de los colaboradores (RF5.0). Opcionales, solo admin y
 * contador (tabla aparte con RLS, 0040). Se usan para la raya del contador;
 * la app no los manda a ningún lado.
 */
export default async function DatosImssPage() {
  const [{ data: colaboradores, error }, { data: datos, error: errDatos }] = await Promise.all([
    listColaboradores(),
    listDatosImss(),
  ]);

  const orden = [...colaboradores].sort((a, b) => Number(b.activo) - Number(a.activo));

  return (
    <div className="space-y-6">
      <BackLink href="/admin/cumplimiento">IMSS y papeles</BackLink>
      <PageHeader
        title="Datos IMSS de tu gente"
        description="NSS, CURP y RFC de cada colaborador. Todos son opcionales."
      />

      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>
          Son datos personales: solo los ven el administrador y el contador. El supervisor, la gente
          de campo y los clientes no tienen acceso, ni en la web ni en el celular.
        </p>
        <p>
          La app solo revisa que tengan el formato correcto; no los consulta con el IMSS ni con el
          SAT. Si una persona te pide borrar sus datos, usa «Borrar sus datos»: se eliminan de
          verdad.
        </p>
      </div>

      {(error || errDatos) && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los datos.
        </p>
      )}

      {orden.length === 0 ? (
        <p className="text-sm text-neutral-500">Todavía no tienes colaboradores dados de alta.</p>
      ) : (
        <ul className="space-y-3">
          {orden.map((c) => (
            <FilaDatosImss
              key={c.id}
              colaborador={{ id: c.id, nombre: c.activo ? c.nombre : `${c.nombre} (inactivo)` }}
              datos={datos.get(c.id) ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
