import { listObras } from '@/lib/data/obras';
import ObrasClient from './obras-client';

export const dynamic = 'force-dynamic';

export default async function ObrasPage() {
  const { data: obras, error } = await listObras();

  return <ObrasClient obras={obras} error={error} />;
}
