/// Helpers de formato compartidos por las páginas de /admin.

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

// Zona fija México: en producción el server corre en UTC; sin `timeZone` las
// fechas se mostrarían en UTC y podrían verse un día corridas.
const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(value ?? 0);
}

/// `ms` es epoch ms (bigint en BD, number en JS al leerlo de Supabase).
export function formatDate(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return dateFormatter.format(new Date(ms));
}

export function formatDateTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return dateTimeFormatter.format(new Date(ms));
}
