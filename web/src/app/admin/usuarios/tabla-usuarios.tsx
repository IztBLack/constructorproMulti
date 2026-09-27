'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Modal, Select, TableContainer, THead, Th, TBody, Tr, Td } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { cambiarRol, guardarObrasAsignadas, revocarAcceso } from './actions';
import { DESCRIPCION_ROL, ROLES_INVITABLES, nombreRol, usaObrasAsignadas } from '@/lib/auth/roles';
import type { UsuarioEmpresa } from '@/lib/data/usuarios-empresa';
import type { BadgeTone } from '@/components/ui';

const TONO_ROL: Record<string, BadgeTone> = {
  admin: 'purple',
  supervisor: 'blue',
  residente: 'blue',
  compras: 'amber',
  almacen: 'amber',
  contador: 'amber',
  colaborador: 'neutral',
  cliente: 'green',
};

export interface ObraLite {
  id: string;
  nombre: string;
  activa: boolean;
}

/**
 * Quién tiene acceso a la empresa.
 *
 * Los clientes del portal aparecen en la lista —es información honesta: también
 * tienen acceso— pero sin acciones. Su alta y su baja viven en /admin/clientes,
 * donde están ligados a su ficha; administrarlos desde dos sitios distintos
 * acabaría dejando una ficha huérfana apuntando a un usuario que ya no existe.
 */
export function TablaUsuarios({
  usuarios,
  miUserId,
  obras,
  asignadas,
}: {
  usuarios: UsuarioEmpresa[];
  miUserId: string;
  /** Obras de la empresa, para asignar a residentes y colaboradores (0042). */
  obras: ObraLite[];
  /** user_id → obras asignadas vivas. */
  asignadas: Record<string, string[]>;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<UsuarioEmpresa | null>(null);
  const [asignando, setAsignando] = useState<UsuarioEmpresa | null>(null);
  const [revocando, setRevocando] = useState<UsuarioEmpresa | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(
    accion: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    formData: FormData,
    alTerminar: () => void,
  ) {
    setCargando(true);
    setError(null);
    const resultado = await accion(formData);
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'No se pudo completar la acción.');
      return;
    }
    alTerminar();
    router.refresh();
  }

  return (
    <>
      <TableContainer>
        <THead>
          <Th>Persona</Th>
          <Th>Rol</Th>
          <Th className="text-right">Acciones</Th>
        </THead>
          <TBody>
            {usuarios.map((u) => {
              const soyYo = u.user_id === miUserId;
              const esCliente = u.rol === 'cliente';

              return (
                <Tr key={u.user_id}>
                  <Td>
                    <span className="font-medium text-neutral-900">
                      {u.nombre ?? u.email}
                    </span>
                    {soyYo && (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        Tú
                      </span>
                    )}
                    {u.nombre && <div className="text-xs text-neutral-500">{u.email}</div>}
                  </Td>
                  <Td>
                    <Badge tone={TONO_ROL[u.rol] ?? 'neutral'}>{nombreRol(u.rol)}</Badge>
                    {usaObrasAsignadas(u.rol) && (
                      <div className="mt-1 text-xs text-neutral-600">
                        {resumenObras(asignadas[u.user_id] ?? [], obras, u.rol)}
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    {esCliente ? (
                      <span className="text-xs text-neutral-500">Se administra en Clientes</span>
                    ) : soyYo ? (
                      // Prohibido por la RPC, no solo aquí: se explica en vez de
                      // ofrecer un botón que va a fallar.
                      <span className="text-xs text-neutral-500">
                        Otro admin puede cambiarte el rol
                      </span>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {usaObrasAsignadas(u.rol) && (
                          <Button size="sm" variant="secondary" onClick={() => setAsignando(u)}>
                            Obras
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => setEditando(u)}>
                          Cambiar rol
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRevocando(u)}>
                          Quitar acceso
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              );
            })}
        </TBody>
      </TableContainer>

      {/* ── Cambiar rol ── */}
      <Modal
        open={editando !== null}
        onClose={() => !cargando && (setEditando(null), setError(null))}
        title={`Rol de ${editando?.nombre ?? editando?.email ?? ''}`}
        size="sm"
      >
        {editando && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set('user_id', editando.user_id);
              enviar(cambiarRol, fd, () => setEditando(null));
            }}
            className="space-y-4"
          >
            <Field label="Rol">
              <Select name="rol" defaultValue={editando.rol} disabled={cargando}>
                {[...ROLES_INVITABLES, 'admin' as const].map((r) => (
                  <option key={r} value={r}>
                    {nombreRol(r)} — {DESCRIPCION_ROL[r]}
                  </option>
                ))}
              </Select>
            </Field>

            <EstadoFormulario tono="error" mensaje={error} />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={cargando}>
                {cargando ? 'Guardando…' : 'Guardar rol'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={cargando}
                onClick={() => (setEditando(null), setError(null))}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Obras asignadas (residente / colaborador) ── */}
      <Modal
        open={asignando !== null}
        onClose={() => !cargando && (setAsignando(null), setError(null))}
        title={`Obras de ${asignando?.nombre ?? asignando?.email ?? ''}`}
        size="sm"
      >
        {asignando && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set('user_id', asignando.user_id);
              enviar(guardarObrasAsignadas, fd, () => setAsignando(null));
            }}
            className="space-y-4"
          >
            <p className="text-sm text-neutral-700">
              {asignando.rol === 'residente'
                ? 'El residente solo ve y trabaja en las obras que marques aquí. Sin obras, no ve ninguna.'
                : 'El colaborador puede anotar en la bitácora de las obras que marques. Lo demás no cambia.'}
            </p>
            {obras.length === 0 ? (
              <p className="text-sm text-neutral-600">Todavía no hay obras.</p>
            ) : (
              <fieldset className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                <legend className="sr-only">Obras</legend>
                {obras.map((o) => (
                  <label
                    key={o.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-neutral-900 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      name="obra_id"
                      value={o.id}
                      defaultChecked={(asignadas[asignando.user_id] ?? []).includes(o.id)}
                      disabled={cargando}
                      className="h-5 w-5 rounded border-neutral-400"
                    />
                    <span>
                      {o.nombre}
                      {!o.activa && <span className="ml-1 text-neutral-600">(terminada)</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <EstadoFormulario tono="error" mensaje={error} />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={cargando}>
                {cargando ? 'Guardando…' : 'Guardar obras'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={cargando}
                onClick={() => (setAsignando(null), setError(null))}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Quitar acceso ── */}
      <Modal
        open={revocando !== null}
        onClose={() => !cargando && (setRevocando(null), setError(null))}
        title="Quitar acceso"
        size="sm"
      >
        {revocando && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set('user_id', revocando.user_id);
              enviar(revocarAcceso, fd, () => setRevocando(null));
            }}
            className="space-y-4"
          >
            <p className="text-sm text-neutral-700">
              <strong>{revocando.nombre ?? revocando.email}</strong> dejará de entrar
              a ConstructorPro.
            </p>
            {/* La duda real de quien pulsa esto es "¿se borra lo que capturó?".
                Contestarla aquí evita que no se atrevan a usar el botón. */}
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              Lo que capturó —asistencias, destajos, movimientos— se queda tal cual.
              Solo pierde el acceso. Su cuenta no se borra: puedes volver a
              invitarlo cuando quieras.
            </p>

            <EstadoFormulario tono="error" mensaje={error} />

            <div className="flex items-center gap-3">
              <Button type="submit" variant="danger" disabled={cargando}>
                {cargando ? 'Quitando…' : 'Quitar acceso'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={cargando}
                onClick={() => (setRevocando(null), setError(null))}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/** "Casa Juárez, Bodega Norte" o "Sin obras asignadas". */
function resumenObras(ids: string[], obras: ObraLite[], rol: string): string {
  const nombres = ids.map((id) => obras.find((o) => o.id === id)?.nombre).filter(Boolean) as string[];
  if (nombres.length === 0) {
    return rol === 'residente' ? 'Sin obras asignadas: no ve ninguna' : 'Sin obras asignadas';
  }
  if (nombres.length <= 3) return nombres.join(', ');
  return `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más`;
}
