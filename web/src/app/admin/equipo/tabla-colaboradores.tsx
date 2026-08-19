'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Colaborador, Puesto } from '@/lib/data/types';
import type { OrdenModo } from '@/lib/data/orden-modos';
import { Badge, Button, DataTable, EmptyState, type DataColumn } from '@/components/ui';
import OrdenModoToggle from '@/components/orden-modo-toggle';
import { useArrastreOrden } from '@/components/use-arrastre-orden';
import { ordenarPorModo } from '@/lib/data/ordenar';
import { formatCurrency } from '@/lib/data/format';
import { alternarActivoColaborador } from './actions';

const TIPO_PAGO_LABEL: Record<string, string> = {
  DIA: 'Por día',
  DESTAJO: 'Por destajo',
};

const RUTA = '/admin/equipo';

export default function TablaColaboradores({
  colaboradores,
  puestos,
  modo,
  obrasPorColab,
}: {
  colaboradores: Colaborador[];
  puestos: Puesto[];
  modo: OrdenModo;
  /** colaborador_id → obras vigentes. Alimenta el filtro por obra. */
  obrasPorColab: Record<string, { id: string; nombre: string }[]>;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  /**
   * Obra por la que se filtra (null = todas). Filtra en DURO: deja solo a los
   * asignados, como un filtro por género. Se prefirió sobre "priorizar y luego
   * el resto" porque una lista mezclada no deja ver dónde termina la obra.
   */
  const [obraId, setObraId] = useState<string | null>(null);
  /**
   * Con un filtro de obra puesto, muestra ADEMÁS al resto del equipo en una
   * segunda sección. Apagado por defecto: el filtro debe seguir respondiendo
   * "quién está en esta obra" de un vistazo; esto es para el momento en que
   * hace falta jalar a alguien de fuera sin perder el filtro.
   */
  const [verResto, setVerResto] = useState(false);

  // Chips disponibles: obras que HOY tienen a alguien asignado, con su conteo.
  const obrasChips = (() => {
    const conteo = new Map<string, { nombre: string; n: number }>();
    for (const c of colaboradores) {
      for (const o of obrasPorColab[c.id] ?? []) {
        const prev = conteo.get(o.id);
        conteo.set(o.id, { nombre: o.nombre, n: (prev?.n ?? 0) + 1 });
      }
    }
    return [...conteo.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  })();

  const enObra = (c: Colaborador) =>
    (obrasPorColab[c.id] ?? []).some((o) => o.id === obraId);

  const visibles = obraId ? colaboradores.filter(enObra) : colaboradores;
  // El resto solo existe cuando hay filtro; se ordena con el mismo criterio.
  const resto = obraId ? colaboradores.filter((c) => !enObra(c)) : [];

  const filas = ordenarPorModo(visibles, modo, {
    nombre: (c) => c.nombre,
    creado: (c) => c.created_at,
    modificado: (c) => c.updated_at,
  });

  const { activo: modoArrastre, guardando, propsFila } = useArrastreOrden({
    items: filas,
    idDe: (c) => c.id,
    tabla: 'colaboradores',
    modo,
    revalidate: RUTA,
  });
  // Reordenar un subconjunto mezclaría las posiciones del resto: con filtro de
  // obra activo se muestra la lista pero no se puede arrastrar.
  const arrastrable = modoArrastre && obraId === null;

  const puestoNombre = (puestoId: string | null) =>
    puestos.find((p) => p.id === puestoId)?.nombre ?? '—';

  const salarioPuesto = (puestoId: string | null) =>
    puestos.find((p) => p.id === puestoId)?.salario_dia_default ?? null;

  async function onToggleActivo(id: string, activo: boolean) {
    const accion = activo ? 'desactivar' : 'activar';
    const nombre = colaboradores.find((c) => c.id === id)?.nombre ?? 'este colaborador';
    if (!confirm(`¿Deseas ${accion} a ${nombre}?`)) return;
    setLoadingId(id);
    await alternarActivoColaborador(id, !activo);
    setLoadingId(null);
    router.refresh();
  }

  if (colaboradores.length === 0) {
    return (
      <EmptyState
        title="Aún no hay colaboradores registrados."
        description="Agrega el primero con el botón Nuevo colaborador."
      />
    );
  }

  // Columnas definidas dentro del componente porque las celdas usan estado
  // (loadingId) y helpers de este scope (puestoNombre, onToggleActivo). No se
  // pasa `href` de fila: el nombre es un <Link> propio y así el botón de acción
  // sigue siendo clicable (un enlace estirado lo taparía).
  const columnas: DataColumn<Colaborador>[] = [
    {
      key: 'nombre',
      header: 'Nombre',
      primary: true,
      cell: (c) => (
        <Link href={`/admin/equipo/${c.id}`} className="hover:underline">
          {c.nombre}
        </Link>
      ),
    },
    { key: 'puesto', header: 'Puesto', cell: (c) => puestoNombre(c.puesto_id) },
    {
      key: 'tipo',
      header: 'Tipo de pago',
      cell: (c) => TIPO_PAGO_LABEL[c.tipo_pago] ?? c.tipo_pago,
    },
    {
      key: 'salario',
      header: 'Salario/día',
      align: 'right',
      cell: (c) => {
        const salario = c.salario_personalizado ?? salarioPuesto(c.puesto_id);
        return (
          <span className="tabular-nums">
            {salario !== null ? formatCurrency(salario) : '—'}
          </span>
        );
      },
    },
    { key: 'telefono', header: 'Teléfono', cell: (c) => c.telefono || '—' },
    {
      key: 'estado',
      header: 'Estado',
      cell: (c) => (
        <Badge tone={c.activo ? 'green' : 'neutral'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      cell: (c) => {
        const isLoading = loadingId === c.id;
        return (
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={() => onToggleActivo(c.id, c.activo)}
          >
            {isLoading
              ? c.activo
                ? 'Desactivando…'
                : 'Activando…'
              : c.activo
                ? 'Desactivar'
                : 'Activar'}
          </Button>
        );
      },
    },
  ];

  const asaCol: DataColumn<Colaborador> = {
    key: 'asa',
    header: '',
    cell: () => (
      <span
        aria-hidden
        title="Arrastra la fila para reordenar"
        className="cursor-grab select-none text-lg leading-none text-neutral-400 active:cursor-grabbing"
      >
        ⠿
      </span>
    ),
  };

  const cols = arrastrable ? [asaCol, ...columnas] : columnas;

  const filasResto = ordenarPorModo(resto, modo, {
    nombre: (c) => c.nombre,
    creado: (c) => c.created_at,
    modificado: (c) => c.updated_at,
  });

  return (
    <div className="space-y-3">
      {obrasChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-500">Obra:</span>
          <button
            type="button"
            aria-pressed={obraId === null}
            onClick={() => setObraId(null)}
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
              obraId === null
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Todas
          </button>
          {obrasChips.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={obraId === o.id}
              title={`Solo el equipo de ${o.nombre}`}
              // Volver a tocar el chip activo regresa a "Todas".
              onClick={() => setObraId(obraId === o.id ? null : o.id)}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
                obraId === o.id
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {o.nombre} ({o.n})
            </button>
          ))}
        </div>
      )}

      {obraId !== null && filas.length === 0 && (
        <EmptyState
          title="Nadie asignado a esta obra."
          description="Quita el filtro para ver a todo el equipo y asignar gente."
        />
      )}

      <div className="flex items-center justify-end gap-2">
        {arrastrable && (
          <span className="text-xs text-neutral-500">
            {guardando ? 'Guardando orden…' : 'Arrastra las filas para reordenar'}
          </span>
        )}
        <OrdenModoToggle listKey="colaboradores" modo={modo} revalidate={RUTA} />
      </div>
      {filas.length > 0 && (
      <DataTable
        columns={cols}
        rows={filas}
        rowKey={(c) => c.id}
        rowProps={arrastrable ? (_, i) => propsFila(i) : undefined}
      />
      )}

      {obraId !== null && filasResto.length > 0 && (
        <div className="space-y-3 pt-2">
          <button
            type="button"
            aria-expanded={verResto}
            onClick={() => setVerResto((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            <span aria-hidden>{verResto ? '▴' : '▾'}</span>
            {verResto
              ? 'Ocultar los demás colaboradores'
              : `Ver los demás colaboradores (${filasResto.length})`}
          </button>

          {verResto && (
            <>
              <p className="text-xs text-neutral-500">
                No asignados a esta obra. Ábrelos para asignarlos desde su ficha.
              </p>
              <div className="opacity-90">
                <DataTable columns={columnas} rows={filasResto} rowKey={(c) => c.id} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
