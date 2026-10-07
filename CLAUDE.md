# ConstructorPro — instrucciones del proyecto

Monorepo: app Flutter (raíz, `lib/`, `test/`) + web Next.js (`web/`) sobre la misma base Supabase. La web y el móvil son el mismo producto: mismos datos, mismos nombres, mismo diseño.

## Diseño de pantallas del móvil
Antes de crear o modificar cualquier pantalla en `lib/presentation/`, lee y sigue **`docs/DISENO_MOVIL.md`** (principios, tokens, componentes `GrupoLista` / `FilaLista` / `MosaicoIcono`, anatomía de pantalla, copy y accesibilidad). Usa su lista de verificación (§8) al terminar. Si una pantalla vieja no la cumple, corrígela al tocarla.

- Colores solo por `context.colores`, texto por `Theme.of(context).textTheme`; el test de contraste falla el build si algo no cumple AA.
- `web/design-system/constructorpro/MASTER.md` está **obsoleto** (describe otra app): no lo uses como referencia.

## Pendientes de UX
El plan vigente está en `docs/AUDITORIA_UX_MOVIL_2026-10-07.md` (fases A–C).
