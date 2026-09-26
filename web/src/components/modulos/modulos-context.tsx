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

export function ModulosProvider({
  activos,
  children,
}: {
  activos: readonly ClaveModulo[];
  children: ReactNode;
}) {
  return <ModulosContext.Provider value={activos}>{children}</ModulosContext.Provider>;
}

export function useModulos(): readonly ClaveModulo[] {
  return useContext(ModulosContext);
}

/** ¿Se muestra un enlace a esta ruta? (Lo que no es de un módulo, siempre.) */
export function useRutaVisible(): (ruta: string) => boolean {
  const activos = useModulos();
  return (ruta) => rutaVisible(ruta, activos);
}
