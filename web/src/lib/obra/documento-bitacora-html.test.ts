import { describe, expect, test } from 'vitest';
import type { PdfConfig } from '@/lib/data/empresa-config';
import { medianocheMx } from '@/lib/data/tz';
import type { EntradaBitacora } from '@/lib/bitacora/bitacora';
import { construirBitacoraHtml, FOTOS_POR_ENTRADA_PDF } from './documento-bitacora-html';

const pdf: PdfConfig = {
  empresaContacto: '',
  colorHex: '#0F172A',
  pieDePagina: '',
  watermark: '',
  mayusculas: false,
  modoCompacto: false,
  firmaIzquierda: '',
  firmaDerecha: '',
  textos: {},
};

const d25 = medianocheMx(2026, 8, 25);

function entrada(extra: Partial<EntradaBitacora>): EntradaBitacora {
  return {
    id: 'e',
    obra_id: 'o',
    fecha: d25,
    tipo: 'AVANCE',
    texto: 'Se coló la losa',
    clima: '',
    personal_presente: null,
    personal_nombres: [],
    visible_cliente: false,
    autor_id: 'u',
    autor_nombre: 'Mario',
    registrada_en: d25 + 3_600_000,
    fotos: [],
    aclaraciones: [],
    ...extra,
  };
}

const base = { obra: { nombre: 'Casas Bienestar', ubicacion: 'MZ 2' }, desde: d25, hasta: d25, nombreEmpresa: 'Constructora', pdf };

describe('PDF de bitácora', () => {
  test('la versión para el cliente deja fuera lo interno y el nombre de quien registró', () => {
    const entradas = [
      entrada({ id: 'a', texto: 'Público', visible_cliente: true }),
      entrada({ id: 'b', texto: 'Pleito con el maestro', visible_cliente: false }),
    ];
    const cliente = construirBitacoraHtml({ ...base, entradas, paraCliente: true });
    expect(cliente).toContain('Público');
    expect(cliente).not.toContain('Pleito con el maestro');
    expect(cliente).not.toContain('Mario');

    const interna = construirBitacoraHtml({ ...base, entradas });
    expect(interna).toContain('Pleito con el maestro');
    expect(interna).toContain('Mario');
  });

  test('escapa el texto capturado', () => {
    const html = construirBitacoraHtml({ ...base, entradas: [entrada({ texto: '<script>x</script>' })] });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('limita las miniaturas y cuenta las demás; imprime aclaraciones', () => {
    const fotos = Array.from({ length: FOTOS_POR_ENTRADA_PDF + 2 }, (_, i) => ({
      id: `f${i}`,
      path: `p${i}`,
      orden: i,
      url: `https://x.test/f${i}.jpg`,
    }));
    const html = construirBitacoraHtml({
      ...base,
      entradas: [
        entrada({
          fotos,
          aclaraciones: [{ id: 'c', texto: 'Fueron 3 m³', autor_nombre: 'Ana', registrada_en: d25 }],
        }),
      ],
    });
    expect(html.match(/<img /g)?.length).toBe(FOTOS_POR_ENTRADA_PDF);
    expect(html).toContain('+ 2 fotos más');
    expect(html).toContain('Fueron 3 m³');
  });

  test('periodo vacío lo dice', () => {
    expect(construirBitacoraHtml({ ...base, entradas: [] })).toContain('No hay entradas');
  });
});
