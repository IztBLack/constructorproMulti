import type { CuadrillaResumen } from '@/lib/data/cuadrillas';
import { Badge, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';

const ESPECIALIDAD_LABEL: Record<string, string> = {
  ALBANILERIA: 'Albañilería',
  ACERO: 'Acero / fierro',
  CIMBRA: 'Cimbra / carpintería',
  INSTALACIONES: 'Instalaciones',
  ACABADOS: 'Acabados',
  MIXTA: 'Mixta',
};

export default function TablaCuadrillas({ cuadrillas }: { cuadrillas: CuadrillaResumen[] }) {
  if (cuadrillas.length === 0) {
    return (
      <EmptyState
        title="Aún no hay cuadrillas registradas."
        description="Las cuadrillas se crean desde la app móvil (pestaña Equipo → Cuadrillas)."
      />
    );
  }

  return (
    <TableContainer>
      <THead>
        <Th>Nombre</Th>
        <Th>Especialidad</Th>
        <Th>Cabo</Th>
        <Th>Miembros</Th>
        <Th>Obras asignadas</Th>
        <Th>Estado</Th>
      </THead>
      <TBody>
        {cuadrillas.map((c) => (
          <Tr key={c.id}>
            <Td className="font-medium text-neutral-900">{c.nombre}</Td>
            <Td>{ESPECIALIDAD_LABEL[c.especialidad] ?? c.especialidad}</Td>
            <Td>{c.cabo_nombre ?? '—'}</Td>
            <Td>
              {c.miembros.length === 0 ? (
                '—'
              ) : (
                <span>
                  <span className="tabular-nums font-medium">{c.miembros.length}</span>
                  <span className="text-neutral-500"> · {c.miembros.join(', ')}</span>
                </span>
              )}
            </Td>
            <Td>{c.obras.length === 0 ? '—' : c.obras.join(', ')}</Td>
            <Td>
              <Badge tone={c.activa ? 'green' : 'neutral'}>
                {c.activa ? 'Activa' : 'Inactiva'}
              </Badge>
            </Td>
          </Tr>
        ))}
      </TBody>
    </TableContainer>
  );
}
