# ConstructorPro web como PWA (app instalable)

Existe para dar a los usuarios de **iPhone** una app sin cuenta de Apple Developer
(los ~$99 USD/año que habilitarían TestFlight). La app nativa Flutter en iOS sigue
siendo solo para uso propio, vía SideStore (ver `README.md`, sección 5).

---

## 1. La regla de campo que hay que respetar

> **Captura siempre desde el ícono instalado en la pantalla de inicio, y siempre
> desde el mismo navegador.**

No es una preferencia estética. En iOS el almacenamiento está **particionado por
navegador**: lo que se captura sin señal en Chrome iOS **no existe** en Safari ni en
la app instalada. Si alguien pasa lista en un navegador y luego abre otro, esas
marcas pendientes no aparecen — y no hay forma de recuperarlas desde el otro lado.

Además, una app instalada queda **exenta** de la purga de almacenamiento a 7 días de
Safari (fuera de la UE); una pestaña suelta **no**. Instalar es lo que protege la cola
de marcas pendientes.

## 2. Cómo se instala

| Plataforma | Cómo |
|---|---|
| **iPhone/iPad** | **Safari** → Compartir → "Añadir a inicio". Es el único navegador de iOS que instala una PWA real. |
| **Chrome/Edge/Firefox en iOS** | No pueden instalarla. La app avisa y pide abrir el sitio en Safari. |
| **Android** | Chrome/Edge ofrecen "Instalar" (la app muestra un botón propio). |
| **Escritorio** | Ícono de instalar en la barra de direcciones. |

En iOS **todos** los navegadores usan WebKit por obligación de Apple (regla 2.5.6 de
la App Store); Chrome iOS es Safari con otra interfaz. La excepción de motores
alternativos del DMA europeo (iOS 17.4+) **no aplica en México**.

## 3. Qué funciona sin señal, y qué no

La pantalla de campo es **`/campo`**: el pase de lista unificado (un día, todas las
obras activas, sin navegar entre ellas). Es el puerto a web de `PaseListaScreen` del
móvil, y la app instalada arranca ahí.

| Escenario | ¿Funciona? |
|---|---|
| Abrir la app instalada sin señal y pasar lista | **Sí**, en `/campo` — si ya se abrió una vez con señal (ver abajo) |
| Pasar lista de **varias obras** sin señal | **Sí.** `/campo` las lista todas; no hay que navegar |
| Marcar con la pantalla ya abierta y la señal caída | **Sí.** Se encola local y se envía al reconectar |
| Cambiar de día dentro de `/campo` sin señal | **Sí**, si ese día tiene copia guardada |
| Navegar por `/admin` sin señal | **No.** Se muestra `/offline`; las pestañas de obra se desactivan y ofrecen ir a `/campo` |
| Ver reportes, PDF, cotizaciones sin señal | **No.** Solo el pase de lista tiene cola offline |

### Por qué `/campo` vive fuera de `/admin`

El layout de `/admin` es `force-dynamic` e imprime el nombre de la empresa y del
usuario en el HTML. Cachear eso significaría servirle a un usuario los datos de la
empresa de otro que usó el mismo dispositivo.

`/campo` tiene su propio layout que **no consulta nada en el servidor**: su HTML es
idéntico para cualquier usuario, así que el service worker puede precachearlo sin
riesgo. Los datos los pide el cliente con la sesión de la persona, con RLS de por
medio, y la copia local se valida contra la empresa de la sesión antes de mostrarse.

> Si algún día se añade una consulta de servidor a `/campo`, deja de ser cacheable y
> el arranque en frío sin conexión se rompe. Es la invariante a proteger.

### La condición que queda: una primera visita con señal

El HTML de `/campo` se precachea al instalar el service worker, pero **sus bundles de
JavaScript llevan hash en el nombre** y un `sw.js` estático no puede conocerlos por
adelantado: se cachean la primera vez que se visita la pantalla. En la práctica: hay
que **abrir `/campo` una vez con señal** para que quede lista para funcionar sin ella.

Conviene hacerlo al instalar la app, antes de salir a obra.

## 4. Piezas

| Archivo | Qué hace |
|---|---|
| `src/app/campo/` | **Pantalla de campo**: pase de lista unificado, renderizado en cliente |
| `src/lib/data/pase-lista-cliente.ts` | Carga desde el navegador: obras activas, personal por día, asistencias |
| `src/lib/offline/snapshot-pase-lista.ts` | Copia local por día + guarda multi-tenant offline |
| `src/app/manifest.ts` | Manifest (nombre, íconos, `display: standalone`, `start_url: /campo`) |
| `public/sw.js` | Service worker. Cachea **solo** estáticos, íconos, `/offline` y `/campo` |
| `public/icons/` | 192, 512, maskable y apple-touch-icon, derivados del ícono de la app Flutter |
| `src/components/pwa/registrar-sw.tsx` | Registra el SW (solo en producción) y pide `storage.persist()` |
| `src/components/pwa/aviso-instalar.tsx` | Aviso de instalación, con ramas para iOS/Safari, iOS/otro navegador y Chromium |
| `src/app/offline/page.tsx` | Página de respaldo sin conexión |
| `src/lib/offline/cola-asistencia.ts` | Cola de marcas en IndexedDB + motor de envío |
| `src/lib/offline/snapshot-asistencia.ts` | Copia local de la semana para rehidratar la vista |

### Reglas que el service worker NO debe romper

- Nunca cachear cuerpos de respuesta de `/admin`, `/cliente`, `/auth` ni payloads RSC.
- Nunca cachear respuestas de Supabase.
- Navegaciones: network-first, y la respuesta **no** se guarda.

Si alguna vez hace falta cachear algo autenticado, primero hay que resolver el
aislamiento por usuario. No es un ajuste de configuración.

## 5. En qué obra aparece cada colaborador

En `/campo` cada persona aparece **una sola vez por día**, y la obra se decide así:

1. **Si ya tiene asistencia ese día** → aparece en la obra con la que quedó
   registrada, aunque después la hayan reasignado a otra.
2. **Si no tiene asistencia todavía** → aparece en su última obra asignada
   (mayor `fecha_ingreso`), igual que `ultimaObraPorColaboradorProvider` del móvil.

La regla 1 no es cosmética. Al mover a alguien de obra a media semana, su marca del
lunes conserva el `obra_id` viejo; si se le listara bajo la obra nueva, esa marca
sería invisible y el capturista la volvería a poner, creando un **segundo registro
del mismo día en otra obra**. Ese día se pagaría dos veces.

La regla 2 evita el problema opuesto: quien sigue asignado a tres obras a la vez
—normal cuando nadie cierra asignaciones viejas— aparecería tres veces y podrían
marcarle tres jornadas en un día.

> Caso no cubierto: si la asistencia quedó en una obra que después se **desactivó**,
> no hay sección donde mostrarla y la persona vuelve a su obra vigente.

## 6. Cómo se comporta la cola de asistencia

- Indexada por la **clave natural** `(obra, colaborador, fecha)`: re-marcar la misma
  celda reemplaza la entrada, nunca apila. Idempotente por diseño.
- `updated_at` se sella **al capturar, no al enviar**. La resolución de conflictos
  contra la app móvil es last-write-wins por ese campo (ver
  `docs/SYNC_PROBLEMA_Y_SOLUCION.md`); sellar al enviar haría que una marca de la
  mañana subida en la tarde le ganara a una corrección hecha en el móvil al mediodía.
- Escribe con `upsert` sobre `uq_asist`, **reusando el `id` existente** de la fila. Un
  `id` nuevo cambiaría la llave primaria y le dejaría dos filas al móvil, que
  reventarían al sincronizar — el error de producción del 2026-07-09.
- Marcas con error permanente (RLS, dato inválido) dejan de reintentarse tras 3
  intentos pero **nunca se descartan**: siguen contando y se reportan en la barra.
- Marcas de otra empresa (otro usuario inició sesión en el dispositivo) **sí** se
  descartan al enviar, por seguridad multi-tenant.

## 7. Pendiente de probar en dispositivo real

Nada de esto se pudo verificar automáticamente (hace falta un iPhone y una sesión):

- [ ] Safari iOS: Compartir → "Añadir a inicio" muestra el ícono correcto (no un screenshot).
- [ ] Al abrir la app instalada, el aviso de instalación desaparece.
- [ ] Chrome iOS muestra la variante "abre este sitio en Safari".
- [ ] Marcar la misma celda 3 veces sin señal deja **una** entrada en la cola, con la última fracción.
- [ ] Al reconectar, `updated_at` en Supabase es la hora de **captura**, no la de envío.
- [ ] Usuario A marca sin señal → cierra sesión → entra usuario B → las marcas de A no se suben.
- [ ] Tableta dormida un fin de semana: el token expirado no bloquea la cola en error permanente.
