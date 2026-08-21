'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Modal, Select, TableContainer, THead, Th, TBody, Tr, Td } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { cambiarRol, revocarAcceso } from './actions';
import type { UsuarioEmpresa } from '@/lib/data/usuarios-empresa';
import type { BadgeTone } from '@/components/ui';

const TONO_ROL: Record<string, BadgeTone> = {
  admin: 'purple',
  supervisor: 'blue',
  contador: 'amber',
  colaborador: 'neutral',
  cliente: 'green',
};

const NOMBRE_ROL: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  contador: 'Contador',
  colaborador: 'Colaborador',
  cliente: 'Cliente',
};

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
}: {
  usuarios: UsuarioEmpresa[];
  miUserId: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<UsuarioEmpresa | null>(null);
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
                    <Badge tone={TONO_ROL[u.rol] ?? 'neutral'}>
                      {NOMBRE_ROL[u.rol] ?? u.rol}
                    </Badge>
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
                      <div className="flex justify-end gap-2">
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
                <option value="colaborador">Colaborador — pase de lista y captura</option>
                <option value="contador">Contador — maneja la caja, ve todo lo demás</option>
                <option value="supervisor">Supervisor — además edita obras y cotizaciones</option>
                <option value="admin">Administrador — control total, incluidos usuarios</option>
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
              a Cimnova.
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
