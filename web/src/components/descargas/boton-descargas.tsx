'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui';
import { DESCARGAS, enlaceApkAndroid, enlaceAppIos } from '@/lib/descargas';
import { IconAndroid, IconApple } from './iconos';

/**
 * Acceso minimalista a la descarga de la app móvil desde el portal.
 *
 * Es un ícono pequeño en la barra superior (junto a Ajustes / Tema / Salir), no
 * un elemento de la navegación principal: descargar la app es algo que se hace
 * una vez, no una sección de trabajo diaria. Al pulsarlo abre un modal compacto
 * con Android e iOS. Así el usuario ya logueado NO tiene que cerrar sesión ni ir
 * a la landing para conseguir el APK.
 *
 * Todo el estado de disponibilidad sale de `@/lib/descargas` (fuente única), la
 * misma que usa la landing pública.
 */
export function BotonDescargas({ className = '' }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);

  const urlAndroid = enlaceApkAndroid();
  const urlIos = enlaceAppIos();

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Descargar la app móvil"
        title="Descargar la app móvil"
        className={
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ' +
          'text-neutral-500 outline-none transition-colors cursor-pointer ' +
          'hover:bg-neutral-100 hover:text-neutral-900 ' +
          'focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ' +
          className
        }
      >
        {/* Teléfono con flecha de descarga (trazo, estilo del design system) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M12 7v6" />
          <path d="m9.5 10.5 2.5 2.5 2.5-2.5" />
          <path d="M11 18h2" />
        </svg>
      </button>

      <Modal open={abierto} onClose={() => setAbierto(false)} title="Descargar la app móvil" size="sm">
        <p className="text-sm leading-relaxed text-neutral-600">
          Llévala a la obra para pasar lista y anotar movimientos, aunque no haya internet.
        </p>

        <div className="mt-4 space-y-3">
          {/* ── Android ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <IconAndroid className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900">Android</p>
              <p className="text-xs text-neutral-500">
                {urlAndroid
                  ? // "Última versión" en vez de un número: el enlace apunta al
                    // release más reciente, así que un número escrito aquí a mano
                    // podría contradecir a lo que realmente se descarga.
                    ['Última versión', DESCARGAS.android.tamanoAprox]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Celular o tablet'}
              </p>
            </div>
            {urlAndroid ? (
              <a
                href={urlAndroid}
                // `download` sugiere al navegador guardar el archivo con nombre.
                download
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white outline-none transition hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                Descargar
              </a>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                Próximamente
              </span>
            )}
          </div>

          {/* ── iOS ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <IconApple className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900">iPhone (iOS)</p>
              <p className="text-xs text-neutral-500">Apple</p>
            </div>
            {urlIos ? (
              <a
                href={urlIos}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white outline-none transition hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                Abrir
              </a>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                Próximamente
              </span>
            )}
          </div>
        </div>

        {urlAndroid && (
          <p className="mt-4 text-xs leading-relaxed text-neutral-500">
            En Android, al ser una app fuera de la Play Store, el teléfono puede pedirte permitir
            &ldquo;instalar apps de esta fuente&rdquo; la primera vez. Es normal.
          </p>
        )}
      </Modal>
    </>
  );
}
