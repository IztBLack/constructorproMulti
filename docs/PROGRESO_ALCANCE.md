# Progreso — Alcance ampliado (ejecución de `PLAN_ALCANCE_AMPLIADO.md`)

**Rama de integración:** `claude/project-target-audience-c50407` (base `22805aa`)
**Arranque:** 2026-09-25
**Regla de oro:** nada de esto se aplica a producción (Supabase prod ni Vercel prod)
sin el visto bueno de Mario. Todo queda en ramas, con migraciones escritas y probadas
en local (PGlite).

---

## Decisiones tomadas (resumen para Mario al final)

| # | Decisión | Por qué |
|---|---|---|
| D1 | El **supervisor NO ve la utilidad** de la obra (solo admin y contador) | El margen es información del dueño. El supervisor ya ve la raya y los costos de campo; si ve el margen, se vuelve tema de negociación. Así lo manejan los ERP del ramo (el residente ve avance y costo, no la utilidad) |
| D2 | **Los módulos son gratis por ahora**: el admin los prende y apaga sin restricción | El modelo de negocio sigue sin definirse (el copy de precio de la landing es neutro). El control vive en la RPC `activar_modulos`, así que cobrar después es un cambio en un solo lugar |
| D3 | **Sin asesor fiscal:** claves SAT **sugeridas** con la leyenda "confírmala con tu contador"; nunca se timbra | Se investigó el catálogo c_ClaveProdServ. Con un facilitador, un error se corrige al capturar, porque la app no emite el CFDI |
| D4 | **Residente = supervisor limitado a sus obras asignadas** (`usuario_obra`) | Es el uso estándar en México: el residente responde por una o varias obras concretas. Se reusan las policies del supervisor más un filtro por obra, en vez de un rol con permisos inventados |
| D5 | Orden de trabajo: F0 → (F1, F1b, móvil-F0) → (F2, F3, F5) → (F4, F6, F7) | Las dependencias técnicas del plan (§5) |
| D6 | **Web primero en todos los módulos nuevos.** En el móvil solo entran el gating de módulos (F0) y las pantallas marcadas "disponible en la web" | El móvil va atrasado (Drift v13, sin tesorería 0016-0025). El plan ya lo prevé: el móvil oculta lo que no implementa |
| D7 | Apagar un módulo **oculta, no borra**. RLS no cambia por módulo | Regla del plan §2.3 |
| D8 | Incidentes de seguridad (F7): datos de salud mínimos, visibles solo para el admin | Son datos sensibles según la LFPDPPP |

(Cada agente agrega aquí las decisiones menores que tome, con su porqué.)

### Decisiones menores de F0 web (módulos + onboarding)

| # | Decisión | Por qué |
|---|---|---|
| F0-1 | Las necesidades del registro que apuntan a módulos **no disponibles NO se prenden**: se guardan en `perfil.proximamente` (y se ven como "Próximamente"/"Lo pediste" en Ajustes → Módulos) | `modulos` debe decir lo que la empresa usa de verdad. Si se prendieran, el día que salga la fase aparecería una pantalla nueva en el menú sin que el dueño la eligiera. La demanda queda igual de medible en `perfil`, que es lo que pide el plan §4.2 |
| F0-2 | `activar_modulos` recibe la lista **completa** (no "agrega/quita uno") y actúa sobre la **primera membresía por antigüedad**, igual que `getEmpresaUsuario` en la web | Un mismo llamado prende y apaga, sin carreras entre dos pestañas. Y la RPC toca la misma empresa que el usuario está viendo |
| F0-3 | **CHECK** en `empresa_config.modulos`: solo claves del catálogo, `obras` siempre, cerrado bajo dependencias | La policy de 0018 deja al admin hacer UPDATE directo a la fila; sin el CHECK la RPC no bastaba para impedir un arreglo inválido. El catálogo vive en funciones inmutables (`modulos_catalogo`, `modulos_dependencias`) y un test de vitest compara TS↔SQL |
| F0-4 | `crear_empresa`: se **borra** la firma de un argumento y la nueva lleva defaults; ahora **crea la fila de `empresa_config`**; se revoca a `anon` | Dos sobrecargas harían que PostgREST responda "could not choose the best candidate". Bug previo encontrado: toda empresa creada después de 0017 no tenía fila, así que guardar IVA/PDF/orden no escribía nada sin avisar; 0035 la repara (backfill) |
| F0-5 | **Portal:** el módulo solo oculta, en `/admin/clientes/[id]`, la tarjeta "Acceso al portal". `/cliente` no se bloquea | El rol cliente no puede leer `empresa_config` (RLS de 0017/0022), y quitarle el acceso a un cliente que ya entra es una decisión aparte (revocar usuario), no el efecto de un interruptor |
| F0-6 | Mapeo de pantallas: **caja** = importar, PDF de caja, exportar, estado de cuenta del cliente + en el detalle de obra el estado de cuenta, la nota de caja y los movimientos + en el inicio el saldo y las finanzas; **cotizaciones** = cotizaciones, catálogo y el presupuesto de la obra; **equipo** = equipo, puestos, pase de lista, asistencia y nómina de la obra, "equipo de la obra"; `/admin/obras/importar` (Excel de obra) es del núcleo | Es donde vive cada dato. El presupuesto de la obra es la otra mitad de "Cotizaciones y presupuesto" (§2.1) |
| F0-7 | La guardia va en un `layout.tsx` por segmento (`<GuardiaModulo>`); las descargas (route handlers) responden 403 con `bloquearSiApagado` | Una línea por segmento cubre todas sus páginas. No es seguridad (layout y página corren en paralelo en el App Router): lo que se puede leer lo sigue decidiendo la RLS |
| F0-8 | `/campo` **no** tiene guardia de servidor; solo se oculta su enlace | Tiene que seguir siendo estático para que el service worker lo cachee y el pase de lista abra sin señal |
| F0-9 | Si no se pueden leer los módulos (0035 sin aplicar, fila ausente, error) se muestra **todo**, como antes; `crearEmpresa` reintenta con la firma vieja si la base responde `PGRST202` | La web y la migración pueden desplegarse en cualquier orden sin dejar a nadie sin pantallas ni sin poder registrarse |
| F0-10 | "Saltar las preguntas" visible en los pasos 1–3; en el 4 el botón es "Crear mi empresa". Saltar manda `p_modulos = null` (paquete de la base) y guarda en `perfil` lo contestado hasta ahí con `saltado: true` | En el paso 4 ya no hay preguntas que saltar. Lo contestado a medias sigue siendo dato de demanda |
| F0-11 | "Siguiente paso" se descarta en `perfil.siguiente_paso_descartado` (no en localStorage), solo lo ve el admin y se oculta solo cuando el paso ya está hecho. Empresa → "Invita a tu supervisor o a tu contadora"; constructora → "Registra tus frentes de obra" | Así no parpadea al cargar y no reaparece en otro dispositivo; el admin es quien puede escribir `perfil`. El plan solo definía independiente y contratista |
| F0-12 | En el catálogo, `nav` es una **lista** con `orden` (no un solo enlace) | `equipo` pone "Pase de lista" y "Equipo"; `obras` pone "Obras" y "Clientes". El `orden` conserva la barra exactamente como estaba |
| F0-13 | Con la tarjeta "Siguiente paso" a la vista se oculta la guía genérica "Primeros pasos" del inicio | Dos guías a la vez para una empresa recién creada sobran; la tarjeta es la versión hecha a la medida |

### Decisiones menores de F1 web (extras y utilidad por obra)

| # | Decisión | Por qué |
|---|---|---|
| F1-1 | La categoría de costo es una columna **nueva**, `movimientos.categoria_costo` (lista cerrada + CHECK, nullable), no la `categoria` de siempre | `categoria` ya existe desde 0002 y es texto libre que escriben el móvil y la web ("NOMINA", "Anticipo"…). Convertirla en lista cerrada rompería esos datos. Lo no clasificado sale como "Sin clasificar"; una salida `NOMINA` sin clasificar cuenta como mano de obra, y la raya que se pasa a caja desde la web ya nace como `MANO_OBRA` |
| F1-2 | El margen objetivo **por obra** va en tabla aparte `obra_margen_objetivo` (lee admin y contador, escribe admin), **no** en `obras.margen_objetivo` | La RLS filtra filas, no columnas (la lección de 0027 con los sueldos): el cliente del portal y el colaborador leen su fila de `obras` y habrían visto cuánto quiere ganarle el dueño a la obra. El default de la empresa sí va en `empresa_config.margen_objetivo` (15), que el cliente no lee |
| F1-3 | La **foto se toma al ENVIAR** (no al aprobar, como en 0011) y queda congelada por **triggers**: estados que solo avanzan, renglones/foto/total/texto final intocables, un enviado no se borra. Corregir = cancelar + "Hacer uno nuevo a partir de este" (copia de la foto, folio nuevo) | Un extra es evidencia para un pleito: cada folio que vio el cliente tiene que seguir diciendo lo mismo. Los triggers aplican también a la llave de servicio y a las RPC, no solo a la RLS. El dinero del estado de cuenta sale de `total_enviado`, nunca de re-sumar renglones |
| F1-4 | El cliente lee la fila del extra (con su foto `snapshot_json`) pero **no** los renglones vivos | Lo que tiene que ver es lo que se le mandó; abrirle `orden_cambio_renglon` sería una segunda puerta sin necesidad |
| F1-5 | Extras **sin IVA** | Se suman al "costo total" de la obra, que es `obra_presupuesto` y tampoco lleva IVA. Mezclar importes con y sin IVA descuadraría el estado de cuenta. Lo fiscal es F1b |
| F1-6 | **Doble conteo**: raya sin caja = max(0, raya calculada − salidas `NOMINA`); socios sin caja = max(0, pagado en notas − salidas `SUBCONTRATO`), donde pagado en notas = total de las LIQUIDADAS + lo abonado a las ABIERTAS. El saldo de las abiertas es "comprometido" y solo entra a la proyección | Las notas (0031) no generan movimientos ni tienen liga con la salida con la que se pagó al socio, y la nómina pasada a caja es un pedazo de la calculada. Se compara en agregado y no semana por semana porque web y móvil escriben el concepto "Nómina …" con formatos de fecha distintos: un emparejado por texto se rompería sin avisar. Quien lleva caja completa y clasifica no ve doble; quien solo lleva notas ve su costo igual |
| F1-7 | La raya de la utilidad usa la fórmula de la pestaña Nómina (`calcularNomina`) sobre **todo el que tiene asistencia o destajo en la obra**, incluidos dados de baja, con el sueldo actual | Para costo, si hay asistencia ese día se trabajó ahí. La pestaña Nómina solo lista a los asignados esa semana; aquí eso dejaría fuera costo real. El sueldo actual es el mismo criterio que ya usa la pestaña |
| F1-8 | Proyección a término: avance de la obra (0–100) si es > 0; si no, **avance financiero** = cobrado / contratado; sin ninguno, no se proyecta ("Sin avance para proyectar"). Piso: costo real + comprometido con socios | "Presupuesto ejercido" se interpretó como avance financiero porque la app solo tiene presupuesto de VENTA, no de costo. Al arrancar una obra el margen real siempre sale altísimo: pintarlo de verde sería mentir |
| F1-9 | Semáforo: verde ≥ objetivo; amarillo hasta 5 puntos abajo (y sin pérdida); rojo lo demás. El color siempre va con texto | Un margen de 14 % contra 15 % de objetivo no es una alarma; uno de 8 % sí. Texto junto al color por accesibilidad |
| F1-10 | **D1 en el servidor**: `getRentabilidadObra`/`getComparativoRentabilidad` revisan `puedeVerUtilidad` (lista blanca admin/contador, `lib/auth/utilidad.ts`) **antes** de leer y calcular; la barra (`nav.roles`), la pestaña (`useRol`) y las páginas lo repiten | El supervisor ya lee caja, raya y presupuesto por RLS desde antes, así que ninguna policy puede esconder "la resta": la barrera es no calcularla ni mandarla nunca a su navegador. El único dato propio de la utilidad en la base (margen por obra) sí está cerrado por RLS |
| F1-11 | El portal muestra los extras enviados aunque el módulo `cambios` esté apagado | Mismo criterio que F0-5: el cliente no puede leer `empresa_config`, y un extra aprobado es dinero que debe; ocultarlo descuadraría su estado de cuenta |
| F1-12 | Enviar y cancelar: **solo admin** (RPC). Cancelar solo BORRADOR o ENVIADA (lo contestado ya es historia). El supervisor crea, edita y borra (lógico) borradores | Pedido del plan ("admin envía"). Un aprobado cancelado cambiaría lo que el cliente debe sin su intervención |
| F1-13 | Folio consecutivo **por obra**, lo asigna un trigger (con candado por obra); los folios de borradores borrados no se reusan | Así nombra la gente los extras ("el extra 3 de la casa de Juan"). No reusar evita que dos documentos distintos compartan número |
| F1-14 | Despliegue en cualquier orden: si la base aún no tiene `categoria_costo` (PGRST204) el movimiento se guarda sin clasificar; si no se pueden leer los extras, cuentan 0 en el estado de cuenta | Mismo criterio que F0-9: nadie pierde un movimiento ni ve un estado de cuenta roto porque la web salió antes que la migración |
| F1-15 | Texto final: tipo nuevo `extra` en los tres niveles (documento → empresa → integrado). Se congela al enviar, así que su tarjeta solo se ofrece en borrador | Reusa la infraestructura de 0032/0033 sin columna de empresa nueva (`pdf_textos` es un objeto libre) |
| F1-16 | Foto: bucket privado `extras` (10 MB, solo imágenes). Oficina lee; admin/supervisor suben y borran; el cliente lee **solo** la `foto_uri` de sus extras visibles. Al cambiar la foto se borra la anterior | Patrón 0024/0028. El cliente necesita ver la foto para decidir; nada más del bucket |
| F1-17 | `/admin/rentabilidad` muestra por defecto solo obras activas (con enlace a todas) y ordena rojo → amarillo → verde → sin datos, peor margen arriba. El total es el margen de la cartera, no el promedio de márgenes | Lo primero que hay que ver es lo que necesita atención; un promedio de márgenes pesaría igual una obra de 50 mil que una de 5 millones |

---

## Convenciones para todos los agentes

- **ECC:** los checklists están en `~/.claude/ecc/skills/` (`database-migrations`,
  `security-review`, `nextjs-turbopack`, `react-patterns`, `frontend-a11y`). Léelos
  antes de escribir.
- **Next.js 16:** lee `web/AGENTS.md`. Esta versión tiene cambios que rompen: consulta
  `web/node_modules/next/dist/docs/` antes de usar APIs de las que no estés seguro.
- **Migraciones SQL:** aditivas e idempotentes (`if not exists`, `drop policy if exists`).
  Columnas de sync en cada tabla (`created_at`, `updated_at`, `server_updated_at`,
  `deleted_at` en bigint ms), `empresa_id` + policies con `public.auth_tiene_rol(...)`.
  Las policies de escritura validan que el **padre** sea de la misma empresa (lección de
  0019). Encabezado explicativo como en `0031_notas_obra.sql`.
- **Numeración reservada** (no la cambies):

  | Mig | Fase |
  |---|---|
  | 0035 | F0 módulos por empresa + perfil + RPC `activar_modulos` + `crear_empresa` v2 |
  | 0036 | F1 órdenes de cambio + categoría de costo en movimientos + objetivo de margen |
  | 0037 | F1b datos fiscales (emisor, receptor, claves SAT, estado fiscal por cobro) |
  | 0038 | F2 compras y material |
  | 0039 | F3 avance y estimaciones |
  | 0040 | F5 cumplimiento + subcontratos |
  | 0041 | F4 bitácora + programa |
  | 0042 | F6 residente/compras/almacén + `usuario_obra` + bitácora de actividad |
  | 0043 | F7 seguridad, postventa, herramienta |

- **Registro de módulos:** `web/src/lib/modulos.ts` es la **única** fuente. Cada fase
  cambia `disponible: true` en su módulo y registra su entrada de nav. No crees listas
  paralelas.
- **Copy:** español de México, lenguaje de obra, sin tecnicismos. Contraste AA. Botones
  de mínimo 44px.
- **Verificación obligatoria antes de entregar** (desde `web/`): `npx tsc --noEmit`,
  `npx eslint <archivos tocados>`, `npx vitest run`, y la prueba de migraciones en
  PGlite (`web/src/db/`, ver `web/src/db/pglite/README.md`) cuando exista. Lógica de dinero = tests unitarios.
- **Git:** commits en español con el formato del repo (`feat(modulo): …`), terminando con
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push, sin tocar prod.

---

## Estado

| Fase | Estado | Rama/commit | Notas |
|---|---|---|---|
| Harness PGlite | ✅ | f36a70e | 34 migraciones sin reemplazos, 26 tests RLS, ~12 s |
| F0 web | ✅ | 2bf8235, 21e4709, 47a6d48 | 0035 escrita y probada en PGlite (19 tests), **sin aplicar a ningún Supabase**. Pendiente: verificación visual en navegador (no se levantó la web contra el Supabase de producción), sugerencias de módulo por uso (§4.3, dependen de `compras`), ocultar en el portal/PDF del cliente lo de módulos apagados (ver F0-5) |
| F0 móvil | ⏳ | | |
| F1 web | ✅ | f77041c, ee76ceb, cd24dec, 4f2736f, cd4f01a | 0036 escrita y probada en PGlite (31 tests), **sin aplicar a ningún Supabase**. Pendiente: verificación visual en navegador (no se levantó la web contra producción), el móvil (D6), tests de paridad web↔móvil de la utilidad (RT6) cuando el móvil la implemente, sumar los extras en el PDF/Excel de caja interno (`documento-caja-html.ts`, `estado-cuenta-excel.ts`), que siguen mostrando COSTO TOTAL = solo presupuesto, y aplicar 0036 + bucket `extras` con el visto bueno de Mario |
| F1b | ⏳ | | |
| F2 | ⏳ | | |
| F3 | ⏳ | | |
| F5 | ⏳ | | |
| F4 | ⏳ | | |
| F6 | ⏳ | | |
| F7 | ⏳ | | |
