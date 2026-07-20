import PaseLista from './pase-lista';

/**
 * Pase de lista unificado de campo: un día, todas las obras activas, sin navegar
 * entre ellas. Porta a la web el flujo de `PaseListaScreen` del móvil
 * (`lib/presentation/asistencia/pase_lista_screen.dart`).
 *
 * Esta página es **estática a propósito**. No lleva `force-dynamic` ni consulta
 * nada en el servidor: todo el contenido lo pinta el cliente leyendo IndexedDB
 * y/o Supabase con la sesión de la persona.
 *
 * El motivo es de seguridad, no de rendimiento: para que el service worker pueda
 * cachear esta pantalla —y así poder pasar lista sin señal aunque la app se haya
 * cerrado— su HTML no puede contener datos de ninguna empresa. Si algún día se
 * añade aquí una consulta de servidor, deja de ser cacheable y el arranque en
 * frío sin conexión se rompe.
 */
export default function CampoPage() {
  return <PaseLista />;
}
