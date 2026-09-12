import { describe, expect, test } from 'vitest';
import type { PdfConfig } from '@/lib/data/empresa-config';
import type { Obra } from '@/lib/data/types';
import type { NotaConRenglones, RenglonNota, TipoRenglon } from '@/lib/data/notas-obra-calculo';
import { construirNotaObraHtml } from './documento-nota-html';

/// Lo que se prueba aquí es QUÉ ENSEÑA el documento, no cómo se ve: las dos
/// reglas de 0034 (el apartado «Para» cuando la nota va sin nombre y el
/// porcentaje de las deducciones) solo existen en el HTML, y romperlas no falla
/// ningún cálculo — el PDF simplemente sale diciendo de más o de menos.

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

// El builder solo mira `nombre` y `ubicacion`; el resto de la obra no entra al
// documento y llenarlo aquí solo escondería eso.
const obra = { nombre: 'Casas Bienestar', ubicacion: 'MZ 2 LT 1' } as Obra;

let n = 0;
function renglon(tipo: TipoRenglon, etiqueta: string, extra: Partial<RenglonNota> = {}): RenglonNota {
  n += 1;
  return {
    id: `r${n}`,
    nota_id: 'nota1',
    tipo,
    etiqueta,
    monto: null,
    monto_base: null,
    porcentaje: null,
    mostrar_porcentaje: false,
    texto: '',
    fecha: null,
    orden: n * 100,
    ...extra,
  };
}

function nota(extra: Partial<NotaConRenglones> = {}): NotaConRenglones {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    obra_id: 'obra1',
    destinatario: '',
    colaborador_id: null,
    titulo: '',
    fecha: 1_754_000_000_000,
    estado: 'ABIERTA',
    mostrar_para: true,
    total_override: null,
    saldo_override: null,
    notas: '',
    orden: 100,
    texto_final: null,
    renglones: [],
    ...extra,
  };
}

/** El encabezado del apartado, tal cual lo escribe el builder. */
const BLOQUE_PARA = '<p class="etiqueta">Para</p>';

function html(n: NotaConRenglones): string {
  return construirNotaObraHtml({ obra, nota: n, nombreEmpresa: 'ConstructorPro', pdf });
}

describe('el apartado «Para»', () => {
  test('con destinatario se imprime el nombre', () => {
    expect(html(nota({ destinatario: 'ORLANDO RAMOZ' }))).toContain('ORLANDO RAMOZ');
  });

  test('sin destinatario deja el renglón en blanco para llenarlo a mano', () => {
    const doc = html(nota({ destinatario: '' }));
    expect(doc).toContain(BLOQUE_PARA);
    expect(doc).toContain(`${BLOQUE_PARA}<p class="dato">—</p>`);
  });

  test('sin destinatario y con el apartado apagado, «Para» no aparece', () => {
    expect(html(nota({ destinatario: '', mostrar_para: false }))).not.toContain(BLOQUE_PARA);
  });

  test('el apartado apagado no puede esconder un nombre que sí existe', () => {
    expect(html(nota({ destinatario: 'ORLANDO RAMOZ', mostrar_para: false }))).toContain(
      'ORLANDO RAMOZ',
    );
  });

  test('el asterisco de la pantalla nunca se imprime', () => {
    expect(html(nota({ destinatario: '' }))).not.toContain('>*<');
  });
});

describe('el porcentaje de las deducciones', () => {
  const retencion = (mostrar: boolean) =>
    nota({
      renglones: [
        renglon('DEDUCCION', 'RETENCIÓN', {
          monto_base: 62_000,
          porcentaje: 4,
          mostrar_porcentaje: mostrar,
        }),
      ],
    });

  test('por default la deducción solo enseña su valor', () => {
    const doc = html(retencion(false));
    expect(doc).toContain('RETENCIÓN');
    expect(doc).not.toContain('4% =');
  });

  test('encendida, enseña la cuenta completa', () => {
    expect(html(retencion(true))).toContain('4% =');
  });

  test('un PAGO enseña su cuenta sin que nadie la prenda: explica el neto', () => {
    const doc = html(
      nota({
        renglones: [renglon('PAGO', 'PROYECCIÓN', { monto_base: 62_000, porcentaje: 4 })],
      }),
    );
    expect(doc).toContain('4% =');
  });
});
