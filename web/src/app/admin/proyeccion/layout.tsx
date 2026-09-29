import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** Si el módulo `proyeccion` está apagado, esta sección muestra el aviso en vez de su contenido. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <GuardiaModulo clave="proyeccion">{children}</GuardiaModulo>;
}
