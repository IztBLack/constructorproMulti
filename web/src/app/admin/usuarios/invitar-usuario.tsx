'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal, Select } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { createClient } from '@/lib/supabase/client';
import { Turnstile, captchaConfigurado } from '@/components/auth/turnstile';
import { invitarUsuario, invitarSocio } from './actions';

/**
 * Invitar a alguien a la empresa. Dos canales según el rol:
 *
 * · Colaborador / contador / supervisor → CÓDIGO de 6 dígitos que el admin dicta
 *   por teléfono o WhatsApp. Es de campo, no técnico: hay gente en obra sin correo
 *   propio, y un mecanismo que falla para media plantilla no puede ser el principal.
 *   La persona tiene que REGISTRARSE primero y luego elegir "Me invitaron".
 *
 * · Socio (administrador) → CORREO, estilo Teams: se captura su correo y se le
 *   manda un enlace; al abrirlo entra ya como administrador. Se usa el magic link
 *   público de Supabase Auth (no la llave `service_role`): la invitación se guarda
 *   ligada al correo y `/auth/callback` la concilia al aterrizar. Un socio SÍ suele
 *   tener correo, así que el canal encaja con quién es.
 */
export function InvitarUsuario({ urlBase }: { urlBase: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rol, setRol] = useState('colaborador');
  const [codigo, setCodigo] = useState<string | null>(null);
  const [invitadoEmail, setInvitadoEmail] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);

  const esSocio = rol === 'admin';

  function cerrar() {
    if (cargando) return;
    const habiaResultado = Boolean(codigo || invitadoEmail);
    setAbierto(false);
    setError(null);
    setRol('colaborador');
    setCodigo(null);
    setInvitadoEmail(null);
    setCopiado(false);
    setCaptcha(null);
    if (habiaResultado) router.refresh();
  }

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const fd = new FormData(e.currentTarget);

    if (esSocio) {
      const email = String(fd.get('email') ?? '').trim();

      // 1. Registrar la invitación pendiente (la RPC valida que quien invita sea admin).
      const resultado = await invitarSocio(fd);
      if (!resultado.ok) {
        setCargando(false);
        setError(resultado.error ?? 'No se pudo crear la invitación.');
        return;
      }

      // 2. Disparar el magic link al correo del socio. Al abrirlo, /auth/callback
      //    concilia la invitación por correo y lo deja como admin.
      const supabase = createClient();
      const { error: errorEnvio } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?destino=/admin&socio=1`,
          captchaToken: captcha ?? undefined,
        },
      });

      setCargando(false);
      if (errorEnvio) {
        setError(
          'La invitación se registró, pero no se pudo enviar el correo: ' + errorEnvio.message,
        );
        setCaptcha(null);
        if (typeof window !== 'undefined') window.turnstile?.reset();
        return;
      }
      setInvitadoEmail(email);
      return;
    }

    const resultado = await invitarUsuario(fd);
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
        {invitadoEmail ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <p className="font-medium">Invitación enviada a {invitadoEmail}.</p>
              <p className="mt-1">
                Cuando abra el enlace del correo entrará como <strong>administrador</strong>. El
                enlace vence en <strong>72 horas</strong>. Pídele que revise también la carpeta de
                correo no deseado.
              </p>
            </div>

            <Button type="button" onClick={cerrar} className="w-full">
              Listo
            </Button>
          </div>
        ) : codigo ? (
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
              hint={
                esSocio
                  ? 'Un socio recibe la invitación por correo y entra como administrador.'
                  : 'El código se lo dictas por teléfono o WhatsApp.'
              }
            >
              <Select
                name="rol"
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                disabled={cargando}
              >
                <option value="colaborador">Colaborador — pase de lista y captura</option>
                <option value="contador">Contador — maneja la caja, ve todo lo demás</option>
                <option value="supervisor">Supervisor — además edita obras y cotizaciones</option>
                <option value="admin">Socio — administrador, se invita por correo</option>
              </Select>
            </Field>

            {esSocio && (
              <Field label="Correo del socio" hint="Ahí le llega el enlace de invitación.">
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="socio@correo.com"
                  disabled={cargando}
                />
              </Field>
            )}

            {esSocio && captchaConfigurado && <Turnstile onToken={setCaptcha} />}

            <EstadoFormulario tono="error" mensaje={error} />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={cargando}>
                {cargando
                  ? esSocio
                    ? 'Enviando…'
                    : 'Generando…'
                  : esSocio
                    ? 'Enviar invitación'
                    : 'Generar código'}
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
