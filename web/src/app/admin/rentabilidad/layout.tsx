import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** Si el módulo `rentabilidad` está apagado, el comparativo muestra el aviso. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <GuardiaModulo clave="rentabilidad">{children}</GuardiaModulo>;
}
