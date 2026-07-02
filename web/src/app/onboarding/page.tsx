import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingForm from './_form';

export default async function OnboardingPage() {
  const supabase = await createClient();

  // Verificar sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Si ya tiene empresa, ir al panel.
  const { data: membresia } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membresia) {
    redirect('/admin');
  }

  return <OnboardingForm />;
}
