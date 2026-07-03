import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import ImportarObraForm from './importar-form';

export const dynamic = 'force-dynamic';

export default function ImportarObraPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/obras" className="text-sm text-neutral-500 hover:underline">
          ← Obras
        </Link>
      </div>

      <PageHeader
        title="Importar obra desde Excel"
        description="Sube un archivo .xlsx con el formato de la plantilla para crear la obra, su presupuesto y los movimientos automaticamente."
      />

      <ImportarObraForm />
    </div>
  );
}
