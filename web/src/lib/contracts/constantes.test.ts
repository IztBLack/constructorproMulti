import { describe, expect, test } from 'vitest';
import { LARGO_MAXIMO } from '../pdf/textos-finales';
import { PASO_ORDEN } from '../data/notas-obra-calculo';
import { cargarContrato } from './golden';

/// Constantes que las dos plataformas declaran por separado y que tienen que
/// valer lo mismo. No son fórmulas, pero si se separan el efecto es el mismo:
/// dos comportamientos distintos para el mismo dato.
///
/// El contrato es `contracts/comunes/constantes.golden.json`, que lee también
/// `test/logic/constantes_paridad_test.dart`.

const VALORES: Record<string, number> = {
  LARGO_MAXIMO_TEXTO_FINAL: LARGO_MAXIMO,
  PASO_ORDEN_RENGLON: PASO_ORDEN,
};

describe('contrato comunes/constantes', () => {
  const contrato = cargarContrato<{ constante: string }, { valor: number }>('comunes/constantes');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      expect(
        Object.hasOwn(VALORES, caso.entrada.constante),
        `El contrato declara ${caso.entrada.constante} y la web no la expone.`,
      ).toBe(true);
      expect(VALORES[caso.entrada.constante], caso.descripcion).toBe(caso.esperado.valor);
    });
  }
});
