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

### Decisiones menores de F0 móvil (gating de módulos en Flutter)

| # | Decisión | Por qué |
|---|---|---|
| F0m-1 | El móvil lee `empresa_config.modulos` **directo de Supabase** y lo cachea en SharedPreferences (`lib/core/modulos/`). No entra a Drift ni al sync; `schemaVersion` no cambia | Es el patrón de `ui_orden` y `pdf_config`: el móvil solo lee, y la lista cabe en una preferencia. Meterla a Drift obligaba a una migración y snapshots sin ganar nada |
| F0m-2 | Sin sesión o sin empresa vinculada → **todo prendido**. Con sesión y sin señal (o con 0035 sin aplicar) → la última lista **de esa misma empresa**. Sin fila o sin dato → todo prendido y se borra la caché. La caché guarda el `empresaId` | Regla de oro: el móvil nunca se queda vacío por falta de red o de cuenta. Guardar la empresa evita que un teléfono aplique la lista de otra cuenta que se usó antes |
| F0m-3 | La lista se relee al cambiar la sesión o la empresa y **al terminar cada sync** | Así un cambio hecho en la web llega al teléfono cuando llegan los datos, sin botón de "actualizar" |
| F0m-4 | `homeTabProvider` pasa de `int` a `enum HomeTab`. Si la pestaña guardada se apaga, se enseña Obras y lo guardado se corrige tras el frame. Cada pantalla del `IndexedStack` lleva llave por pestaña | Con pestañas que aparecen y desaparecen, un índice apunta a otra pantalla. Corregir lo guardado evita que la app salte sola a esa pestaña el día que el módulo vuelva |
| F0m-5 | Solo se ocultan pestañas del shell de módulos (**Cotizar** = `cotizaciones`, **Equipo** = `equipo`). Obras es el núcleo; **Resumen** y **Config.** se quedan y ocultan sus secciones por dentro | Nunca menos de tres pestañas (la `NavigationBar` pide dos o más) y el tablero sigue sirviendo para llegar a cada obra |
| F0m-6 | Mapeo en el móvil: **equipo** = pestaña Equipo, pase de lista, pestañas Equipo/Asistencia/Nómina de la obra, puestos, recordatorio de nómina, aviso de incompletos, reportes de nómina y asistencias; **cuadrillas** = botón Cuadrillas y la agrupación del pase de lista; **caja** = pestaña Caja, importar movimientos, flujo global, y flujo/distribución/saldo del Resumen; **cotizaciones** = pestaña Cotizar, catálogo, IVA por defecto, pipeline, tarjeta de presupuesto de la obra y reporte de presupuestos; **proyección** y **notas** = sus entradas en el menú de la obra y en accesos rápidos | Es el mismo reparto que F0-6 de la web, llevado a donde vive cada cosa en el móvil |
| F0m-7 | Una obra sin `equipo` ni `caja` se abre igual, sin pestañas y con el aviso "Esta obra no tiene secciones prendidas" (cómo prenderlas en la web) | La obra es el núcleo; un `TabBar` vacío no es válido y un callejón sin salida confunde |
| F0m-8 | En el móvil **no hay interruptores de módulos, ni para el admin**. Configuración → "Partes de la app" dice quién los elige: admin → "desde la web, en Ajustes → Módulos"; otros roles → "los elige el administrador"; sin cuenta → "se ven todas" | D6 (web primero). En la web el cambio pasa por la RPC con dependencias y la confirmación "tus datos se conservan"; duplicarlo en el móvil es otra superficie que mantener |
| F0m-9 | "Disponibles en la web" lista **todo módulo prendido que el móvil no implementa**, sin mirar el `disponible` de la web. El portal no se lista (`aplicaEnMovil: false`). Claves que esta versión no conoce se ignoran. Solo texto, sin enlaces | La web solo deja prender lo disponible (F0-1), así que lo prendido ya existe allá; si se mirara `disponible`, cada fase nueva exigiría actualizar el APK para anunciarla. El portal lo usa el cliente, nunca fue del celular. Sin pantalla a dónde mandar, un enlace sería un enlace roto |
| F0m-10 | Con `cuadrillas` apagado, el pase de lista no agrupa: todos van a la lista sin cuadrilla, ordenada por `colaboradores.orden`. `cuadrilla_miembro` no se toca | Apagar oculta, no borra. Al prenderlo vuelve la agrupación con su orden |
| F0m-11 | `test/core/modulos_test.dart` lee `0035_modulos_empresa.sql` y `web/src/lib/modulos.ts` y falla si difieren claves, dependencias, nombres, descripciones o el paquete por defecto | El dueño debe leer lo mismo en el celular que en la web; el catálogo no puede quedarse atrás sin que nadie se entere |

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
| F0 móvil | ✅ | a03bde8, 10cc080 | Lee `empresa_config.modulos` sin tocar Drift (sin cambio de `schemaVersion`). `flutter analyze` sin hallazgos nuevos; `flutter test` 315/315 (incluido contraste). Mientras 0035 no se aplique en prod, el móvil enseña todo (F0m-2). Pendiente: verificación en la tableta; el tutorial sigue describiendo todos los módulos; la Zona de peligro de Config. no se filtra por módulo |
| F1 | ⏳ | | |
| F1b | ⏳ | | |
| F2 | ⏳ | | |
| F3 | ⏳ | | |
| F5 | ⏳ | | |
| F4 | ⏳ | | |
| F6 | ⏳ | | |
| F7 | ⏳ | | |
