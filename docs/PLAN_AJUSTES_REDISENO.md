# Rediseño de Ajustes (antes "Configuración") — plan

**Abierto:** 2026-10-07. **Origen:** Mario aprobó el mockup
(https://claude.ai/artifact/HtuvLfGbjC13xGPAhyPLcn, tableros "Rediseño · claro/oscuro") y pidió implementarlo
y dejar la línea de diseño documentada para todo el móvil → `docs/DISENO_MOVIL.md`.

## 1. Qué cambia para quien usa la app

| Hoy | Después |
|---|---|
| Título "Configuración", pestaña "Config." | "Ajustes", como la web (U7 de la auditoría) |
| La cuenta y la nube a media pantalla ("Sincronización en la nube") | Tarjeta de **cuenta arriba**: nombre, empresa, rol y estado de la nube ("Todo está en la nube · última subida hoy 15:02") |
| Para saber el IVA o cuántos puestos hay, hay que entrar | El **valor se ve en la fila** (16 %, 9, 28) |
| Sin buscador | **Buscar un ajuste** filtra todas las filas |
| "Partes de la app" + "Disponibles en la web" como texto largo | Una fila **"Partes de la app"** con fichas de lo prendido; el detalle en su propia pantalla |
| **Cinco filas rojas** al final ("Zona de peligro") | **Una sola fila**, "Borrar datos del teléfono", que abre una pantalla con las cinco acciones (mismas confirmaciones de palabra) |
| "Exportar respaldo (JSON)", "Compartir reporte de errores" | "Guardar un respaldo", "Reportar un problema" |
| "Cargar datos de prueba" siempre visible | Solo **sin cuenta conectada** (en una cuenta real no tiene sentido) |

Nada cambia de fondo: cada acción hace exactamente lo mismo que hoy.

## 2. Fuera de alcance (anotado para después)
- **Barra inferior por categorías** (Inicio · Obras · Gente · Dinero · Ajustes): es U6 de la auditoría, Fase C. Aquí solo cambia la etiqueta "Config." → "Ajustes".
- **Fuente Geist** (U16): hay que bajar los archivos (licencia OFL) al proyecto; pendiente del visto bueno de Mario.
- **Versión de la app en el pie** ("versión 1.5.1 (21)"): pide la dependencia `package_info_plus`; se deja para cuando se agregue.
- "Primeros pasos según módulos" (U8 paso 2): la fila abre el tutorial actual y se llama "Tutorial de uso" hasta que exista.

## 3. Incrementos
1. **Guía de diseño** `docs/DISENO_MOVIL.md` + puntero en `CLAUDE.md` y aviso de obsoleto en `web/design-system/constructorpro/MASTER.md`.
2. **Componentes compartidos** en `lib/presentation/common/` (son la línea para TODA la app, no solo Ajustes):
   - `MosaicoIcono`: ícono en cuadro redondeado de color suave, por tono (`BadgeTone`).
   - `FilaLista`: mosaico + título + subtítulo + valor a la derecha + chevron; tono de peligro; 64 dp mínimo; semántica de botón.
   - `GrupoLista`: título del grupo + tarjeta con las filas y divisores sangrados.
3. **Pantalla Ajustes** (`config_screen.dart` reescrita): encabezado grande + buscador, tarjeta de cuenta, grupos (Tu empresa · Preferencias de este teléfono · Módulos · Datos y respaldo · Ayuda · Borrar datos). Subpantallas nuevas: `ModulosScreen` (partes de la app) y `BorrarDatosScreen`.
4. **Pestaña** "Config." → "Ajustes" (+ su prueba).
5. **Pruebas** de widget: grupos visibles, valores, buscador, la fila de peligro abre su pantalla; contraste de los mosaicos en ambos temas.
6. **Revisión ECC** (`flutter-reviewer`) y suite completa.
