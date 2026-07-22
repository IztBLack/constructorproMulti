'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal, Select } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { invitarUsuario } from './actions';

/**
 * Invitar a alguien a la empresa.
 *
 * No se manda correo: se genera un CÓDIGO que el admin dicta por teléfono o
 * manda por WhatsApp. La razón es de campo, no técnica — hay gente en obra sin
 * correo propio, con el del hijo, o con uno que jamás abre. Un mecanismo que
 * falla para media plantilla no puede ser el principal. (La alternativa,
 * invitar por correo, además exigiría meter la llave `service_role` en el
 * servidor, lo que cambiaría el radio de daño de cualquier bug del proyecto.)
 *
 * Tras generar el código, la pantalla explica el paso que a todo el mundo se le
 * escapa: la persona tiene que REGISTRARSE primero y luego elegir "Me
 * invitaron". Sin esa instrucción, el admin manda el código a secas y el
 * invitado no sabe dónde meterlo.
 */
export function InvitarUsuario({ urlBase }: { urlBase: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function cerrar() {
    if (cargando) return;
    setAbierto(false);
    setError(null);
    setCodigo(null);
    setCopiado(false);
    if (codigo) router.refresh();
  }

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const resultado = await invitarUsuario(new FormData(e.currentTarget));
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'No se pudo generar la invitación.');
      return;
    }
    setCodigo(resultado.code ?? null);
  }

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el código está a la vista para copiarlo a mano.
    }
  }

  return (
    <>
      <Button onClick={() => setAbierto(true)}>Invitar persona</Button>

      <Modal open={abierto} onClose={cerrar} title="Invitar a la empresa" size="sm">
        {codigo ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Código listo. Vence en <strong>72 horas</strong> y solo sirve una vez.
            </p>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="font-mono text-4xl font-bold tracking-[0.3em] text-neutral-900">
                {codigo.length === 6 ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : codigo}
              </p>
            </div>

            <Button type="button" variant="secondary" onClick={copiar} className="w-full">
              {copiado ? 'Copiado' : 'Copiar código'}
            </Button>

            {/* El mismo código sirve en las dos vías; se explican ambas porque el
                admin no siempre sabe por dónde entrará la persona. */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              <p className="font-medium">Dile que escriba este código:</p>
              <ul className="mt-1 space-y-1">
                <li>
                  <span className="font-medium">En el celular (campo):</span> abre la app →
                  &ldquo;Vincular empresa&rdquo; → escribe el código.
                </li>
                <li>
                  <span className="font-medium">En la computadora (oficina):</span> entra a{' '}
                  {urlBase} → Crear cuenta → &ldquo;Me invitaron&rdquo;.
                </li>
              </ul>
            </div>

            <Button type="button" onClick={cerrar} className="w-full">
              Listo
            </Button>
          </div>
        ) : (
          <form onSubmit={alEnviar} className="space-y-4">
            <Field label="Nombre de la persona" hint="Para reconocer la invitación en la lista.">
              <Input name="nombre" required autoFocus maxLength={60} disabled={cargando} />
            </Field>

            <Field
              label="Rol"
              hint="Para hacer a alguien administrador, invítalo primero y ascién­delo después."
            >
              <Select name="rol" defaultValue="colaborador" disabled={cargando}>
                <option value="colaborador">Colaborador — pase de lista y captura</option>
                <option value="contador">Contador — maneja la caja, ve todo lo demás</option>
                <option value="supervisor">Supervisor — además edita obras y cotizaciones</option>
              </Select>
            </Field>

            <EstadoFormulario tono="error" mensaje={error} />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={cargando}>
                {cargando ? 'Generando…' : 'Generar código'}
              </Button>
              <Button type="button" variant="secondary" onClick={cerrar} disabled={cargando}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
