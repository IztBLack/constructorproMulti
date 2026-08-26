'use server';

import { listObras } from '@/lib/data/obras';
import { listCotizaciones } from '@/lib/data/cotizaciones';
import { listColaboradores } from '@/lib/data/equipo';
import { listClientes } from '@/lib/data/clientes';
import { tituloCotizacion } from '@/lib/cotizacion/titulo';
import type { Comando } from './comandos';

/**
 * Las ENTIDADES que la paleta puede abrir por nombre: obras, cotizaciones,
 * gente y clientes.
 *
 * Es la mitad del valor de una paleta — «llévame a Alfaro» pesa más que «abre
 * la lista de obras y busca Alfaro» — y por eso no basta con indexar pantallas.
 *
 * Se pide UNA vez, al abrirla por primera vez, y se queda en memoria mientras
 * dure la página. Cargarlo con cada tecla sería una consulta por pulsación;
 * cargarlo al pintar el layout sería pagarlo en cada pantalla aunque nunca se
 * abra la paleta.
 */
export async function cargarEntidades(): Promise<Comando[]> {
  try {
    const [{ data: obras }, { data: cotizaciones }, { data: equipo }, { data: clientes }] =
      await Promise.all([listObras(), listCotizaciones(), listColaboradores(), listClientes()]);

    return [
      ...(obras ?? []).map((o) => ({
        titulo: o.nombre,
        detalle: [o.cliente, o.activa ? null : 'inactiva'].filter(Boolean).join(' · ') || undefined,
        href: `/admin/obras/${o.id}`,
        grupo: 'Obras',
        alias: [o.cliente ?? '', o.ubicacion ?? ''].join(' '),
      })),
      ...(cotizaciones ?? []).map((c) => ({
        titulo: tituloCotizacion(c),
        detalle: c.cliente ?? undefined,
        href: `/admin/cotizaciones/${c.id}`,
        grupo: 'Cotizaciones',
        alias: [c.cliente ?? '', c.nombre_proyecto ?? '', 'presupuesto'].join(' '),
      })),
      ...(equipo ?? []).map((c) => ({
        titulo: c.nombre,
        href: `/admin/equipo/${c.id}`,
        grupo: 'Gente',
        alias: 'trabajador colaborador persona',
      })),
      ...(clientes ?? []).map((c) => ({
        titulo: c.nombre,
        href: `/admin/clientes/${c.id}`,
        grupo: 'Clientes',
        alias: 'contratante',
      })),
    ];
  } catch {
    // La paleta sigue sirviendo con sus comandos fijos: quedarse sin las
    // entidades es peor que nada, pero mucho mejor que no abrirse.
    return [];
  }
}
