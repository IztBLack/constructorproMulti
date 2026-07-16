import { randomInt } from 'node:crypto';

/// Genera un código numérico de N dígitos con un CSPRNG (crypto.randomInt), NO
/// con Math.random() —que es predecible—. 8 dígitos = 90M combinaciones y
/// secuencia impredecible. Los códigos de vinculación son de un solo uso y
/// expiran en 10 min; aun así conviene un espacio grande + aleatoriedad segura
/// para dificultar la fuerza bruta. (El rate-limiting del canje es la mitigación
/// complementaria, a nivel RPC/infra.)
export function generarCodigoNumerico(digitos = 8): string {
  const min = 10 ** (digitos - 1);
  const max = 10 ** digitos;
  return randomInt(min, max).toString();
}
