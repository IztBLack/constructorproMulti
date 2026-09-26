import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** Puestos y salarios son parte de `equipo`: si está apagado, se muestra el aviso. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <GuardiaModulo clave="equipo">{children}</GuardiaModulo>;
}
