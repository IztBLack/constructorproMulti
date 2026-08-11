import { listObras } from '@/lib/data/obras';
import { getUiOrden } from '@/lib/data/empresa-config';
import { leerModo } from '@/lib/data/orden-modos';
import ObrasClient from './obras-client';

export const dynamic = 'force-dynamic';

export default async function ObrasPage() {
  const [{ data: obras, error }, ui] = await Promise.all([listObras(), getUiOrden()]);
  // leerModo acepta todos los modos válidos (criterio + su inverso). Un ternario
  // a mano descartaba los demás y los devolvía siempre a 'nombre'.
  const modo = leerModo(ui['obras']);

  return <ObrasClient obras={obras} error={error} modo={modo} />;
}
