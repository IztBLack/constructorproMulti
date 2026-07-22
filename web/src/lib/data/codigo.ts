import { randomInt } from 'node:crypto';

/// Genera un código numérico de N dígitos con un CSPRNG (crypto.randomInt), NO
/// con Math.random() —que es predecible—.
///
/// LARGO = 6, y no es arbitrario: la app móvil (cloud_sync_screen.dart) exige un
/// código de 6 dígitos para canjearlo. La web generaba 8 por omisión, así que un
/// código creado aquí NO se podía canjear en el celular — se rechazaba por
/// longitud antes de llegar al servidor. Igualar a 6 arregla esa incompatibilidad
/// con la app que hoy está instalada, sin necesidad de recompilarla.
///
/// 6 dígitos son 900K combinaciones. El espacio pequeño lo compensa el
/// rate-limiting del canje (migración 0020): tras varios intentos fallidos, el
/// usuario queda bloqueado unos minutos, de modo que sondear el millón de códigos
/// por fuerza bruta es inviable. Además los códigos son de un solo uso y expiran
/// pronto. (Las invitaciones de PERSONAL son aparte: 8 caracteres alfanuméricos,
/// se canjean en la web, ver `invitar_usuario` en 0018.)
export function generarCodigoNumerico(digitos = 6): string {
  const min = 10 ** (digitos - 1);
  const max = 10 ** digitos;
  return randomInt(min, max).toString();
}
