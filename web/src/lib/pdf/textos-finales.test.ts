import { describe, expect, test } from 'vitest';
import {
  leerTextosEmpresa,
  origenTextoFinal,
  recortar,
  resolverTextoFinal,
  textoIntegrado,
  LARGO_MAXIMO,
  type ContextoTextoFinal,
  type OrigenTexto,
  type TextosEmpresa,
  type TipoDocumento,
} from './textos-finales';
import { cargarContrato } from '../contracts/golden';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/pdf/`, que lee
/// también `test/logic/textos_finales_test.dart`.
///
/// El riesgo real no es que la función falle sola: es que alguien cambie la
/// redacción en una plataforma y no en la otra, y el mismo documento salga con
/// condiciones distintas según desde dónde se mandó. Por eso los textos
/// esperados están LITERALES en el contrato, en vez de compararse contra la
/// propia función.

/** El contexto del contrato: `null` es del dominio, `undefined` de JavaScript. */
interface CtxGolden {
  nombreEmpresa: string;
  ivaEnabled: boolean;
  ivaPct: number;
  destinatario: string | null;
}

const ctxDe = (c: CtxGolden): ContextoTextoFinal => ({
  nombreEmpresa: c.nombreEmpresa,
  ivaEnabled: c.ivaEnabled,
  ivaPct: c.ivaPct,
  destinatario: c.destinatario ?? undefined,
});

describe('contrato pdf/texto-integrado', () => {
  const contrato = cargarContrato<
    { tipo: TipoDocumento; ctx: CtxGolden },
    { texto: string }
  >('pdf/texto-integrado');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      expect(textoIntegrado(caso.entrada.tipo, ctxDe(caso.entrada.ctx)), caso.descripcion).toBe(
        caso.esperado.texto,
      );
    });
  }
});

describe('contrato pdf/resolver-texto-final', () => {
  const contrato = cargarContrato<
    {
      tipo: TipoDocumento;
      documento: string | null;
      empresa: TextosEmpresa | null;
      ctx: CtxGolden;
    },
    { texto: string | null; origen: OrigenTexto }
  >('pdf/resolver-texto-final');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      const { tipo, documento, empresa } = caso.entrada;
      const ctx = ctxDe(caso.entrada.ctx);

      // `esperado.texto === null` significa «el mismo que devuelve
      // textoIntegrado»: el literal ya vive en pdf/texto-integrado y repetirlo
      // aquí sería la copia que estos contratos vienen a quitar.
      expect(resolverTextoFinal({ tipo, documento, empresa, ctx }), caso.descripcion).toBe(
        caso.esperado.texto ?? textoIntegrado(tipo, ctx),
      );

      expect(origenTextoFinal({ tipo, documento, empresa }), caso.descripcion).toBe(
        caso.esperado.origen,
      );
    });
  }
});

/// Fuera del contrato: no es un texto concreto, es una garantía de forma.
describe('resolverTextoFinal — garantías que no son un texto', () => {
  const ctx: ContextoTextoFinal = { nombreEmpresa: 'ConstructorPro', ivaEnabled: true, ivaPct: 16 };

  test('nunca devuelve cadena vacía, aunque todo venga vacío', () => {
    // Si alguien quiere un documento SIN párrafo final, la forma de decirlo no
    // puede ser dejar un campo en blanco por descuido.
    const r = resolverTextoFinal({ tipo: 'cotizacion', documento: '', empresa: {}, ctx });
    expect(r.length).toBeGreaterThan(0);
  });
});

/// Fuera del contrato: `pdf_config.textos` es un jsonb y puede traer cualquier
/// cosa. El móvil no lo lee crudo (recibe el mapa ya normalizado por su
/// servicio), así que no hay paridad que fijar.
describe('leerTextosEmpresa', () => {
  test('deja pasar solo los tipos conocidos', () => {
    expect(leerTextosEmpresa({ cotizacion: 'A', nota: 'B', inventado: 'C' })).toEqual({
      cotizacion: 'A',
      nota: 'B',
    });
  });

  test('descarta valores que no son texto útil', () => {
    expect(leerTextosEmpresa({ cotizacion: 42, nota: '', estado_cuenta: '  ' })).toEqual({});
  });

  test('aguanta null y basura sin lanzar', () => {
    expect(leerTextosEmpresa(null)).toEqual({});
    expect(leerTextosEmpresa('texto suelto')).toEqual({});
  });
});

describe('recortar', () => {
  test('corta un pegado gigante en el tope', () => {
    // El tope en sí es paridad y vive en comunes/constantes.golden.json; lo que
    // se prueba aquí es que de verdad se aplique al recortar.
    expect(recortar('x'.repeat(LARGO_MAXIMO + 500))).toHaveLength(LARGO_MAXIMO);
  });

  test('no toca un texto normal más que para limpiar los extremos', () => {
    expect(recortar('  Vigencia de 15 días.  ')).toBe('Vigencia de 15 días.');
  });
});
