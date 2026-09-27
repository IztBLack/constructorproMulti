'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { PAQUETE_POR_DEFECTO, rutaVisible, type ClaveModulo } from '@/lib/modulos';

/**
 * Módulos prendidos, al alcance de cualquier componente de cliente bajo /admin.
 *
 * El layout de /admin (servidor) los lee una vez y los pone aquí. Así las
 * pestañas de la obra o cualquier otro componente de cliente pueden ocultar lo
 * apagado sin que cada página tenga que pasarlos de mano en mano.
 *
 * Fuera del proveedor vale el paquete de siempre: un componente que se use en
 * otro lado (o en una prueba) se comporta como antes de que hubiera módulos.
 */
const ModulosContext = createContext<readonly ClaveModulo[]>(PAQUETE_POR_DEFECTO);

/**
 * Rol del usuario en su empresa, para ocultar lo que no le toca (p. ej. la
 * pestaña "Utilidad" al supervisor, decisión D1). PRESENTACIÓN: cada página lo
 * vuelve a comprobar en el servidor. Fuera del proveedor vale '' (sin permisos
 * extra: ante la duda, menos).
 */
const RolContext = createContext<string>('');

export function ModulosProvider({
  activos,
  rol = '',
  children,
}: {
  activos: readonly ClaveModulo[];
  rol?: string;
  children: ReactNode;
}) {
  return (
    <ModulosContext.Provider value={activos}>
      <RolContext.Provider value={rol}>{children}</RolContext.Provider>
    </ModulosContext.Provider>
  );
}

export function useModulos(): readonly ClaveModulo[] {
  return useContext(ModulosContext);
}

export function useRol(): string {
  return useContext(RolContext);
}

/** ¿Se muestra un enlace a esta ruta? (Lo que no es de un módulo, siempre.) */
export function useRutaVisible(): (ruta: string) => boolean {
  const activos = useModulos();
  return (ruta) => rutaVisible(ruta, activos);
}
