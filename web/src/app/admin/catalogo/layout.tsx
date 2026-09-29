import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** El catálogo de conceptos es parte de `cotizaciones`: si está apagado, se muestra el aviso. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <GuardiaModulo clave="cotizaciones">{children}</GuardiaModulo>;
}
