'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { USOS_CFDI, regimenesPara } from '@/lib/fiscal/catalogos';
import { tipoPersonaDeRfc, validarRfc } from '@/lib/fiscal/rfc';

export interface ValoresFiscales {
  rfc: string | null;
  razon_social: string | null;
  regimen: string | null;
  cp_fiscal: string | null;
  uso_cfdi?: string | null;
  correo_factura?: string | null;
}

type Accion = (formData: FormData) => Promise<{ ok: boolean; error?: string; aviso?: string }>;

/**
 * Los datos fiscales de una persona o empresa, en el orden de la constancia de
 * situación fiscal. Lo usan el emisor (Ajustes), el receptor (ficha del
 * cliente) y el propio cliente en su portal.
 *
 * El RFC se valida mientras se escribe (formato, no contra el SAT) y la lista de
 * regímenes se acota a los de persona física o moral según su largo.
 */
export function FormularioDatosFiscales({
  valores,
  accion,
  conReceptor = false,
  permitirGenerico = true,
  textoBoton = 'Guardar datos',
  extra,
  deshabilitado = false,
}: {
  valores: ValoresFiscales | null;
  accion: Accion;
  /** Pide también uso del CFDI y correo (datos del cliente). */
  conReceptor?: boolean;
  permitirGenerico?: boolean;
  textoBoton?: string;
  /** Campos adicionales (por ejemplo, la constancia en el portal). */
  extra?: React.ReactNode;
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const [rfc, setRfc] = useState(valores?.rfc ?? '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const tipo = tipoPersonaDeRfc(rfc);
  const regimenes = useMemo(() => regimenesPara(tipo), [tipo]);
  const errorRfc = rfc.trim() && rfc.replace(/[\s-]/g, '').length >= 12 ? validarRfc(rfc, { permitirGenerico }) : null;

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);
    const r = await accion(new FormData(e.currentTarget));
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar.');
      return;
    }
    setAviso(r.aviso ?? 'Guardado.');
    router.refresh();
  }

  return (
    <form onSubmit={alEnviar} className="grid gap-4 sm:grid-cols-2">
      <Field
        label="RFC"
        hint={tipo === 'moral' ? 'Empresa (persona moral), 12 caracteres.' : tipo === 'fisica' ? 'Persona física, 13 caracteres.' : '12 caracteres si es empresa, 13 si es persona.'}
        error={errorRfc && !errorRfc.ok ? errorRfc.error : undefined}
      >
        <Input
          name="rfc"
          value={rfc}
          onChange={(e) => setRfc(e.target.value.toUpperCase())}
          maxLength={15}
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase"
          disabled={deshabilitado}
        />
      </Field>
      <Field label="Código postal fiscal" hint="El de la constancia, no el de la obra.">
        <Input
          name="cp_fiscal"
          defaultValue={valores?.cp_fiscal ?? ''}
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          autoComplete="postal-code"
          className="font-mono"
          disabled={deshabilitado}
        />
      </Field>
      <Field
        label="Nombre o razón social"
        hint="Tal cual viene en la constancia de situación fiscal (sin agregar «S.A. de C.V.» si ahí no viene)."
        className="sm:col-span-2"
      >
        <Input name="razon_social" defaultValue={valores?.razon_social ?? ''} maxLength={300} disabled={deshabilitado} />
      </Field>
      <Field label="Régimen fiscal" className="sm:col-span-2">
        <Select name="regimen" defaultValue={valores?.regimen ?? ''} disabled={deshabilitado}>
          <option value="">— Elige —</option>
          {regimenes.map((r) => (
            <option key={r.clave} value={r.clave}>
              {r.clave} · {r.texto}
            </option>
          ))}
        </Select>
      </Field>
      {conReceptor && (
        <>
          <Field label="Uso del CFDI" hint="Para qué usa la factura. Si no sabe, «Gastos en general».">
            <Select name="uso_cfdi" defaultValue={valores?.uso_cfdi ?? ''} disabled={deshabilitado}>
              <option value="">— Elige —</option>
              {USOS_CFDI.map((u) => (
                <option key={u.clave} value={u.clave}>
                  {u.clave} · {u.texto}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Correo para la factura">
            <Input
              name="correo_factura"
              type="email"
              defaultValue={valores?.correo_factura ?? ''}
              maxLength={254}
              autoComplete="email"
              disabled={deshabilitado}
            />
          </Field>
        </>
      )}
      {extra}
      <div className="space-y-3 sm:col-span-2">
        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="exito" mensaje={aviso} />
        <Button type="submit" disabled={cargando || deshabilitado}>
          {cargando ? 'Guardando…' : textoBoton}
        </Button>
      </div>
    </form>
  );
}
