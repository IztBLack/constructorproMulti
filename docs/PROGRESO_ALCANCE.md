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
### Decisiones menores de F4 web (bitácora + programa, migración 0041)
| F4-1 | El cierre de 24 h se cuenta desde `registrada_en`, que **sella un trigger con el reloj del servidor** al insertar y nadie puede mover; no desde `created_at` | `created_at` lo manda el cliente (convención de sync): mandarlo en el futuro alargaría la ventana. Una entrada capturada sin señal se cierra 24 h después de SUBIRSE, que es cuando el servidor pudo darla por buena. Lo mismo `autor_id`/`autor_nombre`: los pone el trigger, no el formulario |
| F4-2 | **El colaborador no ve ni escribe la bitácora** (solo admin/supervisor escriben; contador lee; cliente lee lo publicado) | Se evaluó "escribe en la obra donde trabaja hoy" vía `obra_colaborador`, pero esa tabla liga obras con **fichas de la raya**, no con usuarios: no hay puente usuario↔colaborador. Inventarlo sería adelantar F6 (0042 `usuario_obra`). Cuando exista, basta una policy aditiva de INSERT para el residente/colaborador de esa obra |
| F4-3 | Pasadas 24 h solo se puede cambiar `visible_cliente` (publicar/retirar del portal); texto, tipo, fecha, clima, personal, obra y borrado lógico los rechaza el trigger. Fotos: ni se agregan ni se quitan; en Storage el archivo de una entrada cerrada no se puede borrar | Publicar no altera lo que dice la entrada; lo demás sí. Si el archivo se pudiera borrar, la fila quedaría apuntando a nada y la evidencia se perdería igual |
| F4-4 | El supervisor edita **solo las entradas que él registró**; el admin, cualquiera (mientras estén abiertas). Las aclaraciones son **inmutables** (sin policy de UPDATE/DELETE) | Evita que un supervisor reescriba lo que anotó otro. Una aclaración equivocada se corrige con otra, como en una bitácora de papel |
| F4-5 | `personal_presente` = conteo + **foto fija** de nombres (`text[]`), sugerida desde el pase de lista del día y editable | Si mañana se corrige la asistencia o se renombra a alguien, la evidencia no debe cambiar sola. Se puede anotar solo el conteo cuando no hay pase de lista |
| F4-6 | El cliente ve también las **aclaraciones** de lo publicado, y la policy del bucket le abre un archivo **solo si su RLS le deja ver la fila de `bitacora_foto`** | Una entrada publicada sin su corrección contaría una versión ya enmendada. Reusar la RLS de la tabla en la policy de Storage evita duplicar la regla "publicada + obra suya + su empresa" |
| F4-7 | Fotos: máximo **10** vivas por entrada (trigger), bucket `bitacora` privado de 10 MB solo JPG/PNG/WEBP, ruta `empresa/obra/entrada/archivo` exigida por las policies de la tabla y del bucket (la subida solo se firma para una entrada **abierta** de esa empresa y obra) | Mismo patrón de 0024. Atar la carpeta a una entrada abierta evita basura en carpetas inventadas y "completar" a escondidas una entrada cerrada |
| F4-8 | Compresión en el navegador (`lib/imagen/comprimir.ts`, 1600 px JPEG 0.8) **nueva**: no había utilidad para comprobantes. Si el navegador no puede (p. ej. HEIC en Chrome de escritorio) o sale más pesada, se sube la original | En obra la señal es mala. Nunca se deja de subir evidencia por no poder comprimirla |
| F4-9 | El `id` de la entrada lo genera el navegador; un reintento que choca con la llave (23505) se da por bueno. Si fallan fotos, la entrada queda guardada y se avisa cuáles faltaron (se agregan desde la tarjeta) | Doble clic o señal intermitente no duplican entradas ni pierden el texto |
| F4-10 | **Sin cola offline en la web (RF4.2 → móvil, D6).** La captura de bitácora NO entra a la cola de `/campo` | La cola de `/campo` guarda filas pequeñas con llave natural; la bitácora necesita guardar fotos (blobs) en IndexedDB, que Safari borra a los 7 días sin uso si la PWA no está instalada, y ahí se perdería justo la evidencia. El diseño ya lo permite después: la entrada y sus fotos se sincronizan por separado y el cierre de 24 h corre desde que llega al servidor. Mitigación hoy: F4-9 |
| F4-11 | PDF de bitácora por periodo (últimos 30 días por defecto) en dos versiones: **completa** (interna) y **para el cliente** (solo lo publicado, sin el nombre de quien registró). Máx. 6 miniaturas por entrada con URL firmada | Es lo que se manda por WhatsApp cuando hay un reclamo; la versión del cliente no puede filtrar notas internas |
| F4-12 | Programa: referencia a la **partida** del presupuesto de la obra (`obra_presupuesto`, validada misma empresa **y misma obra** en la RLS), a una **sección** por nombre (0012 la guarda como texto) o concepto libre; `concepto` siempre guarda el texto a mostrar. "Traer partidas del presupuesto" las agrega con una semana cada una | Así el programa se lee igual aunque renombren o borren la partida, y F3 podrá ligar `avance_partida` por `presupuesto_id` |
| F4-13 | "Atrasada" = pasó su fecha de fin (por día de México) sin marcarse **terminada** (manual). `avanceProgramado()` ya calcula el % que debería llevar a la fecha. **TODO F3:** comparar con el % real de `avance_partida` (0039) para avisar antes de que venza (RF4.7) | F3 se escribe en paralelo; 0041 no puede depender de sus tablas |
| F4-14 | El programa **no** se muestra al cliente todavía; bitácora y programa no ponen enlace en la barra principal: viven como pestañas de la obra (rutas `/admin/obras/*/bitacora` y `/*/programa`, con guardia de módulo en su `layout.tsx` y 403 en la descarga del PDF) | Son por obra, igual que Notas. Mostrar fechas comprometidas al cliente es decisión del dueño |
| F4-15 | En el portal, la bitácora publicada se muestra aunque el admin apague el módulo `bitacora` | Mismo límite que F0-5: el rol cliente no puede leer `empresa_config.modulos`. Para retirar algo del portal está el interruptor por entrada |
### Decisiones menores de F1b web (datos para facturar)
| F1b-1 | Los datos fiscales van en **tablas aparte** (`empresa_fiscal`, `cliente_fiscal`), no como columnas de `empresa_config`/`clientes` como pedía el encargo | RLS filtra filas, no columnas, y los GRANT por columna valen para `authenticated`, que es el mismo rol de BD para todos. `empresa_config` la leen supervisor y colaborador (0017) y `clientes` el supervisor (0006): con columnas, RR1b.1 ("solo admin y contador") era imposible |
| F1b-2 | Estado fiscal por cobro en **`cobro_fiscal`** (tabla), con `pago_id` **o** `movimiento_id` (exactamente uno, CHECK) | Un "cobro" vive en dos lugares: pagos de cotización y entradas de caja de la obra (lo que ve el portal). Columnas en `pagos`/`movimientos` las verían supervisor, colaborador y cliente, y esas tablas se sincronizan con el móvil. La policy valida que el padre sea de la misma empresa y que el movimiento sea ENTRADA |
| F1b-3 | Dedup por folio: índice único `(empresa, upper(uuid))` solo para **PUE**; las PPD repiten folio (una factura, varios abonos) y cada abono guarda su `complemento_uuid` | Una factura de una sola exhibición ampara un cobro; una en parcialidades ampara varios. Los abonos sin complemento son la hoja 2 del paquete |
| F1b-4 | El cliente del portal **no tiene policy** sobre `cliente_fiscal`: lee con `mis_datos_fiscales()` y escribe con `confirmar_mis_datos_fiscales(...)` (SECURITY DEFINER, validan campo por campo). Sube la constancia solo a `<empresa>/constancias/<su cliente_id>/` (policy de storage comparada como texto) | Así no puede tocar `empresa_id`, la confirmación ni rutas ajenas. La RPC dice además si su contratista usa el módulo (el cliente no puede leer `empresa_config`): a quien no factura no se le pide nada |
| F1b-5 | Si la oficina cambia los datos del cliente, se **borra la confirmación** del cliente | Ya no son "los que confirmó él"; la hoja deja de mostrar el aviso verde |
| F1b-6 | RPC `guardar_claves_sat(tabla, id, clave, unidad)` para admin y contador; no mueve `updated_at` | El contador solo lee partidas/catálogo/presupuesto (0022); así captura claves sin poder cambiar precios. Sin `updated_at` nuevo no le gana a una edición pendiente del móvil (las claves no viajan al móvil) |
| F1b-7 | Claves "se capturan una vez": catálogo → partida al cotizar (si la clave interna coincide) → presupuesto al convertir en obra; guardarla en una partida la sube al catálogo si allá está vacía. Todo condicionado a que la columna exista | RD1b.3, y la web sigue funcionando si 0037 no está aplicada (como F0-9) |
| F1b-8 | Hoja por cobro: si el cobro paga todo el documento van sus conceptos (escalados a la base sin IVA); si es el **primer cobro y dice "anticipo"**, un concepto 84111506/ACT "Anticipo del bien o servicio"; si no, un concepto con la clave de mayor importe. Si el cobro es abono a una PPD del mismo documento, la hoja es de **complemento de pago** (P, CP01, parcialidad y saldos) | Es lo que pide la guía de llenado del Anexo 20 (anticipos) y la regla de complementos. Detección de PPD: abonos posteriores sin factura propia hasta cubrir el total |
| F1b-9 | Método sugerido: PUE si al facturar ya se cobró todo lo que dice la factura; si no, PPD con forma 99. IVA: lo que dice la cotización (incluido; "aparte" si se cotizó sin IVA); editable por cobro, con opción "exento" y nota | La app no decide: sugiere y lo marca "sugerida" |
| F1b-10 | Retenciones: solo se sugiere **1.25% ISR** para RESICO persona física → persona moral; lo demás (honorarios, 6% IVA) queda en 0 con nota | Sin asesor fiscal (D3), solo se automatiza lo casi seguro |
| F1b-11 | Lector de CFDI propio (tokenizador ~200 líneas) con namespaces resueltos de verdad; rechaza DOCTYPE, 3.3 y XML sin timbre | En el runtime de Server Actions no hay `DOMParser`; una librería XML completa sobra para un formato fijo. Sin DOCTYPE no hay XXE |
| F1b-12 | Al subir XML: se exige que el emisor sea el RFC de la empresa; un receptor distinto o un total que no cuadra solo **avisan**. El XML viaja en el Server Action (≤900 KB) y el PDF directo a Storage con URL firmada | Rechazar una factura ajena evita ligar basura; avisar (no bloquear) respeta ajustes reales. El PDF puede pasar el límite de ~1 MB del Server Action |
| F1b-13 | ZIP con **jszip** declarada como dependencia directa (misma versión que ya traía exceljs) | Ya estaba en `node_modules`; `fflate` sería una dependencia nueva para lo mismo |
| F1b-14 | Paquete por **mes calendario** (hora de México); "otros cobros" de cada documento se toman de todas las fechas; tope de 300 archivos en el ZIP | El contador trabaja por mes; una parcialidad de septiembre depende de la PPD de agosto; el tope evita que la función se caiga |
| F1b-15 | "Gastos por obra" = salidas de caja sin raya; "Raya" = salidas con categoría NOMINA/raya/destajo; IVA de gastos estimado "si todos tuvieran factura al 16%", y la hoja lo dice | La app no sabe qué gasto tiene factura (hasta F2); la columna "¿Tiene factura?" queda para marcarla en Excel |
| F1b-16 | En Ajustes el contador ve "Datos para facturar" (caso aparte en `seccionesDe`, fuera de la escalera) | El contador no es "más" que el supervisor; es la tesorera. RR1b.1 le da acceso |
| F1b-17 | Nav "Facturación" (orden 35, entre Cotizaciones y Clientes). La ve cualquier rol con el módulo prendido; supervisor/colaborador encuentran el aviso "solo admin y contador" | Mismo criterio que Proyección (la barra no conoce el rol; la puerta está en la página y en la RLS) |
| F1b-18 | El aviso de privacidad (`lib/legal/datos.ts`) lista los datos fiscales y el nuevo bucket | RR1b.1: el RFC de persona física es dato personal |
**Claves SAT verificadas (2026-09-26)** — `web/src/lib/fiscal/catalogos.ts`, siempre con "Sugerencia; confírmala con tu contador":
- De la sugerencia oficial del SAT *Servicios de construcción y profesionales de arquitectura* (omawww.sat.gob.mx/…/Sugerencia_PyS/Cosntruc_y_arquitec.pdf, unidad E48): 72111000, 72111001, 72111100, 72121000, 72121100, 80111618.
- Confirmadas vigentes en c_ClaveProdServ del Anexo 20 v4.0 (consulta por clave en gncys.com/anexo20 y veinte.mx): 72101500 apoyo para la construcción, 72151900 albañilería y mampostería, 72151100 plomería, 72151500 sistemas eléctricos, 72151300 pintura, 72152300 carpintería, 72153204 impermeabilización, 72152600 techado y láminas, 72141510 demolición, 72141511 excavación.
- Anticipo: 84111506 / ACT / "Anticipo del bien o servicio" (guía de llenado, apéndice de anticipos). No se incluyó "construcción no residencial" como clave aparte: se cubre con 72121000/72121100 (industrial, comercial).

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
| F1 | 🔄 | | agente en curso |
| F1b | ✅ | 2200833, d3cc925, 430c522, 48d74c6 | Web. 0037 escrita y probada en PGlite (23 tests), **sin aplicar a ningún Supabase**. RF1b.7 no se hizo (a propósito). Pendiente: verificación visual en navegador, ver un XML real de un PAC, móvil (D6), y que un contador valide notas y claves (D3) |
| F2 | ⏳ | | |
| F3 | ⏳ | | |
| F5 | 🔄 | | agente en curso (adelantada) |
| F4 | ✅ parcial | 27b64ea, 88bdfa9, 77328b6, 343f8ba, c8920b0, a1a358d | Web: bitácora (timeline, fotos, aclaraciones, cierre 24 h, PDF por periodo, portal del cliente) y programa (tabla, barras CSS, atrasos). 0041 escrita y probada en PGlite (31 tests), **sin aplicar a ningún Supabase**. Pendiente: "programado vs real" con `avance_partida` de F3 (F4-13), captura sin conexión → móvil (F4-10), colaborador/residente escribe en su obra → F6 (F4-2), verificación visual en navegador (no se levantó contra producción), paginación de la bitácora larga en el portal |
| F6 | ⏳ | | |
| F7 | ⏳ | | |
