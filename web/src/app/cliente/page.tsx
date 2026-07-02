import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ClientePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // TODO: conectar cuando exista cliente_acceso
  // Cuando exista la tabla `cliente_acceso`, aquí se resolverá qué cotizaciones
  // y obras puede ver este usuario (filtradas por RLS) y se removerán los
  // bloques de demostración / EmptyState de abajo.

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden="true">
              🏗️
            </span>
            <span className="text-base font-semibold text-neutral-900">ConstructorPro</span>
            <Badge tone="blue" className="ml-1 hidden sm:inline-flex">
              Portal de cliente
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="secondary" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-8">
        <PageHeader
          title="Tu portal"
          description="Aquí podrás revisar tus cotizaciones y el avance de tus obras."
          eyebrow={`Sesión iniciada como ${user.email}`}
        />

        {/* Mis cotizaciones */}
        <section aria-labelledby="mis-cotizaciones">
          <Card padding="lg">
            <CardHeader>
              <div>
                <CardTitle as="h2" id="mis-cotizaciones">
                  Mis cotizaciones
                </CardTitle>
                <p className="mt-1 text-sm text-neutral-400">
                  Cotizaciones que tu contratista ha compartido contigo.
                </p>
              </div>
            </CardHeader>

            <EmptyState
              icon="📄"
              title="Aún no hay cotizaciones compartidas contigo"
              description="Cuando tu contratista comparta una cotización desde el panel de oficina, aparecerá aquí con su estado y total."
            />
          </Card>
        </section>

        {/* Avance de mis obras */}
        <section aria-labelledby="avance-obras">
          <Card padding="lg">
            <CardHeader>
              <div>
                <CardTitle as="h2" id="avance-obras">
                  Avance de mis obras
                </CardTitle>
                <p className="mt-1 text-sm text-neutral-400">
                  Seguimiento del progreso de las obras vinculadas a tu cuenta.
                </p>
              </div>
            </CardHeader>

            <EmptyState
              icon="🏗️"
              title="Aún no tienes obras vinculadas"
              description="En cuanto tu contratista te vincule a una obra, podrás ver aquí su avance y novedades."
            />
          </Card>
        </section>

        <p className="text-center text-xs text-neutral-400">
          Este portal está en construcción. Algunas secciones se activarán próximamente.
        </p>
      </main>
    </div>
  );
}
