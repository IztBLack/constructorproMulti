'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui';
import { useTema } from '@/components/tema/use-tema';
import type { Tema } from '@/components/tema/tema';

const OPCIONES: { valor: Tema; etiqueta: string; ayuda: string }[] = [
  { valor: 'auto', etiqueta: 'Automático', ayuda: 'Sigue el tema de tu dispositivo' },
  { valor: 'claro', etiqueta: 'Claro', ayuda: 'Siempre claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro', ayuda: 'Siempre oscuro' },
];

/**
 * Preferencias del dispositivo.
 *
 * Aquí vive la opción "Automático", que el botón de sol/luna de la barra no
 * ofrece: ese botón siempre deja una elección explícita, así que esta pantalla
 * es la ÚNICA manera de volver a que el tema siga al sistema operativo.
 *
 * El aviso de que la preferencia es del dispositivo y no de la cuenta no es un
 * adorno: sin él, alguien que comparte la computadora de la oficina no entiende
 * por qué su tema "no lo sigue" cuando entra desde su casa.
 */
export function SeccionPreferencias() {
  const { tema, efectivo, cambiarTema } = useTema();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Apariencia</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Claro, oscuro, o que siga al tema de tu sistema.
          </p>
        </div>
      </CardHeader>

      <fieldset className="space-y-2">
        <legend className="sr-only">Tema de la aplicación</legend>

        {OPCIONES.map((opcion) => {
          const activa = tema === opcion.valor;
          return (
            <label
              key={opcion.valor}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                activa
                  ? 'border-neutral-900 bg-neutral-50'
                  : 'border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <input
                type="radio"
                name="tema"
                value={opcion.valor}
                checked={activa}
                onChange={() => cambiarTema(opcion.valor)}
                className="h-4 w-4 accent-neutral-900"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-neutral-900">
                  {opcion.etiqueta}
                </span>
                <span className="block text-xs text-neutral-600">{opcion.ayuda}</span>
              </span>
              {opcion.valor === 'auto' && activa && (
                <span className="text-xs text-neutral-600">
                  ahora: {efectivo === 'oscuro' ? 'oscuro' : 'claro'}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
    </Card>
  );
}
