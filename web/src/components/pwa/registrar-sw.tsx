'use client';

import { useEffect } from 'react';

/**
 * Registra `/sw.js` una sola vez, solo en producción.
 *
 * En desarrollo no se registra a propósito: un SW activo entre recargas de
 * `next dev` genera confusión (assets servidos desde caché) y no aporta nada.
 */
export function RegistrarSW() {
  useEffect(() => {
    // Almacenamiento persistente: sin esto, el navegador puede evacuar
    // IndexedDB cuando le falte espacio o tras un periodo de inactividad, y ahí
    // vive la cola de asistencia capturada sin señal. Se pide siempre (también
    // en desarrollo) porque protege datos del usuario, no assets.
    // No se puede garantizar: Safari lo concede según su propia heurística, y
    // una app instalada en la pantalla de inicio tiene mejores probabilidades
    // que una pestaña suelta. Por eso el aviso de instalación importa.
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persisted().then((yaEs) => {
        if (!yaEs) void navigator.storage.persist().catch(() => {});
      }).catch(() => {});
    }

    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // `updateViaCache: 'none'` obliga al navegador a revalidar sw.js contra la
    // red, para que una versión nueva del SW se recoja sin esperar al TTL HTTP.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Un fallo al registrar no debe romper la app: la web funciona igual sin SW.
    });
  }, []);

  return null;
}
