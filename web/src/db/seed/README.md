# Datos demo: seis meses de una constructora

`demo-seis-meses.ts` arma **un script SQL** que llena una empresa que **ya existe**
con seis meses ficticios de trabajo (2026-03-27 → 2026-09-27) de una constructora
mediana de Nuevo León, **"Edificaciones Valle del Norte"**, con los 20 módulos
prendidos. Sirve para enseñar la app, hacer capturas de pantalla y revisar cada
pantalla con datos que se parecen a los de verdad.

Todo es inventado: personas, empresas, RFC, CURP, NSS y folios fiscales tienen
**formato válido** pero salen de un generador (un RFC o NSS podría coincidir por
azar con uno real; no corresponde a nadie). Correos con dominios `example.*`.

## Cómo se genera y se carga

```bash
cd web
node scripts/demo-seis-meses.mjs \
  --user-id <uuid del admin> --empresa-id <uuid de la empresa> \
  --out src/db/seed/out/demo.sql
#   [--hoy 2026-09-27] [--semilla valle-del-norte] [--sin-transaccion]
```

- El script **no llama a ninguna API ni abre ninguna base**: solo escribe el
  archivo. `src/db/seed/out/` está en `.gitignore` (lleva ids reales).
- Node 22.18+/23.6+ importa el `.ts` directo (quita los tipos solo). Por eso el
  generador solo usa sintaxis de TypeScript "borrable" (nada de enums ni
  *parameter properties*) y no importa nada de la web; la prueba corre el
  script de verdad para que eso no se rompa.
- Imprime la obra marca, el avance y el margen que busca cada obra, y cuántas
  filas crea por tabla (para comparar después de cargar).

Para cargarlo: ejecutar **el archivo completo de una vez** con un rol que pueda
hacer `set role authenticated` (el `postgres` de Supabase puede: es lo que usa el
selector de rol del SQL Editor). Trae su propio `begin; … commit;` (quítalo con
`--sin-transaccion` si quien lo corre ya abre la transacción). Si algo falla, no
queda nada a medias.

Requisitos: las migraciones **0001 → 0045** aplicadas y que `--user-id` sea
**admin** de `--empresa-id` (si no, el script se detiene con
`DEMO: el usuario … no es admin de la empresa …`).

### ¿Qué pasa si se corre dos veces?

Nada. El script es un solo bloque `do`: lo primero que hace es buscar la **obra
marca** (id determinista derivado de la empresa) y, si existe —aunque esté
borrada—, avisa `Demo ya sembrado…` y termina. No hay "borrar y volver a
sembrar": los triggers de evidencia inmutable (extras y estimaciones enviadas,
órdenes emitidas, recepciones, bitácora cerrada, incidentes, EPP, garantías,
actividad) lo impiden **a propósito**, y el script **no los desactiva**. La única
forma de quitar el demo es eliminar la empresa completa (la cascada sí está
permitida para eso).

## Cómo se arma (y por qué)

- **Determinista.** Mismos parámetros → mismo SQL byte por byte. Los ids son
  UUID derivados con SHA-1 de `(empresa, etiqueta)`; faltas, cantidades y horas
  salen de un PRNG con semilla. La prueba y el archivo de producción son el mismo
  texto.
- **Actúa como el dueño.** `set local role authenticated` + los claims del JWT
  (`request.jwt.claims` y `request.jwt.claim.sub`, las dos formas que lee
  `auth.uid()` en Supabase y en el shim), igual que PostgREST. Todo pasa por la
  **RLS** y por las **RPC reales**: `enviar_orden_cambio`, `enviar_estimacion`,
  `registrar_respuesta_estimacion` (la vía "por oficina"),
  `marcar_estimacion_cobrada`, `emitir_orden_compra`, `pagar_orden_compra`
  (crea la salida de caja MATERIAL) y `cancelar_orden_compra`. Si una RPC
  responde `ok: false`, el script se detiene con el error.
- **"Como sistema"** (`reset role`, sin JWT; marcado con `-- COMO SISTEMA:` en el
  SQL) solo para lo que en la vida real haría **otra persona que no tiene cuenta
  en la demo**:
  - el cliente que **aprueba o rechaza un extra** (no hay RPC por oficina para
    extras; se llenan los mismos campos que `responder_orden_cambio`);
  - el cliente que **confirmó sus datos fiscales** desde el portal (con el JWT de
    la oficina el trigger de 0037 borra la confirmación, como debe);
  - las **solicitudes de visto bueno** del rol *compras* (`aprobacion` no tiene
    policies de escritura, solo RPC que exigen a quien pide);
  - asegurar la fila de `empresa_config`.
- **Calibrado.** El costo de cada obra se arma para que la utilidad proyectada
  (la misma cuenta de `lib/rentabilidad`) caiga donde dice el guion:
  `costo = contratado × avance físico × (1 − margen buscado)`. La raya sale del
  pase de lista; los subcontratos y notas son fijos; los indirectos son un % del
  costo; lo que queda se reparte en órdenes de compra (82 %) y material de
  mostrador pagado directo en caja.

## Qué hay en cada módulo

| Módulo | Qué deja |
|---|---|
| Empresa | Nombre "Edificaciones Valle del Norte", IVA 16 %, PDF (contacto, color, pie, firmas, texto final de cotización), margen objetivo 15 %, emisor fiscal (persona moral, 601), los 20 módulos prendidos y `perfil.demo` |
| Obras | **A** Los Encinos Etapa 2 — 6 casas para una desarrolladora (≈78 % físico, margen **12.4 % → amarillo** contra su objetivo de 15 %). **B** Remodelación casa Garza Leal, de una cotización aceptada (≈88 %, **19 % verde**). **C** Local comercial Sendero para una farmacia (≈51 %, **−2.4 % rojo**, estructura atrasada). **D** Bodega Mitras nave 4, **terminada** el 24 de julio (100 %, **20.6 % verde**) |
| Cotizaciones | 6: dos convertidas en obra (B y C), una aceptada con 2 pagos (impermeabilización), una rechazada, una enviada y la **(E) en borrador** (ampliación de consultorio). Catálogo con 18 conceptos propios con clave SAT sugerida, y los 10 de base con precios 2026 |
| Equipo | 11 puestos (maestro $950, oficial $680, albañil $620, ayudante $430, fierrero, carpintero, electricista, plomero, yesero, azulejero, velador), 30 colaboradores (uno dado de baja en julio), 4 cuadrillas con jefe (una de acero y cimbra pagada a destajo), ≈3,650 asistencias L–S con ≈6 % de faltas y sábado de medio día, ≈150 destajos |
| Caja | Anticipos, estimaciones cobradas, pagos de cotización; raya semanal como SALIDA `NOMINA`/`MANO_OBRA` (la última semana del local se deja sin pasar, para ver la "raya sin caja"), material por compras y de mostrador, subcontratos, indirectos (retroexcavadora, fletes, gasolina, luz, andamios, sanitario, laboratorio, licencia) |
| Extras | 3 aprobados (uno en A, que luego se estima), 1 rechazado con motivo, 1 enviado esperando respuesta, 1 en borrador |
| Estimaciones | A: quincenales (anticipo 30 % amortizado, fondo de garantía 5 %, retención 0.5 %, IVA 16 %): 9 cobradas, 1 **rechazada** por medición y reenviada, 1 **autorizada por cobrar**, 1 **enviada**, 1 **borrador**. D: 4 mensuales cobradas, la última es finiquito |
| Compras | 9 proveedores, 46 materiales, 35 requisiciones (una rechazada con motivo, una por aprobar, una parcial), 33 órdenes: recibidas y pagadas, una **recibida por pagar** (vence a crédito), una **parcial**, una con anticipo sin entregar, una **cancelada**, una en borrador **esperando visto bueno**; entregas (una en dos partes), consumos, un **traspaso** de block de D a C y un **ajuste** por merma; datos de factura del proveedor en la mayoría |
| Visto bueno | Regla: compras desde $50,000 (con IVA) las aprueba el admin; 2 solicitudes aprobadas y 1 pendiente que el dueño puede decidir |
| Notas de obra | Herrería en B (abierta, con abonos), estructura metálica en D (liquidada), limpieza en A (sin pagos) y tablaroca en C **convertida en subcontrato** |
| Subcontratos | Instalaciones del fraccionamiento (persona moral con REPSE, 3 pagos con 5 % de retención) y tablaroca del local (desde la nota: pago previo sin movimiento + un pago con salida) |
| Cumplimiento | REPSE propio vigente, SIROC de las 4 obras (registrada ×2, **pendiente con plazo vencido** en C, terminada con aviso en D), ICSOE y SISUB de mayo y septiembre entregadas, expediente del subcontratista con la **opinión 32-D por vencer**, datos IMSS de 14 colaboradores |
| Bitácora | 41 entradas (avance, incidencia, visita, instrucción, clima), la mayoría visibles al cliente, con personal del pase de lista; 4 aclaraciones. **Sin fotos** |
| Programa | Una barra por partida (54); la **estructura del local** es la única vencida sin terminar |
| Seguridad | Revisión NOM-031 semanal por obra (74) con los puntos de la plantilla de la web, 111 entregas de EPP, un **casi accidente** (A) y un **accidente leve** con 3 días de incapacidad y aviso al IMSS (C); la lesión va en `incidente_salud` con lo mínimo |
| Herramienta | 26 equipos (uno en reparación, uno de baja), 21 préstamos: devueltos, activos, uno **vencido** y la camioneta asignada sin fecha |
| Garantías | Garantía de 12 meses de la bodega; un reporte **resuelto** (canalón) y uno **en revisión** (grieta en firme) |
| Fiscal | Datos fiscales de 4 clientes (2 confirmados), cobros **facturados** (UUID ficticio), **por facturar** y que **no requieren** factura |
| Portal | Los clientes son **solo registros, sin cuenta**: nadie entra al portal |

## Límites (lo que el demo no puede enseñar)

- **Sin archivos**: ni fotos de bitácora, extras o garantías, ni remisiones,
  XML/PDF de facturas, constancias, comprobantes de caja, firmas de EPP ni
  comprobantes de SIROC/REPSE. Las columnas de rutas quedan vacías.
- **Sin más usuarios.** No se crean cuentas de Auth: todo lo "capturó" el dueño
  (autor de la bitácora, quién pidió las requisiciones, quién recibió material,
  quién registró incidentes). Residente, compras y almacén no aparecen; el
  visto bueno dice "Lupita Méndez (compras)" como texto.
- **Lo que la base sella con la hora del servidor queda con la fecha de carga**:
  `registrada_en` de bitácora, aclaraciones, revisiones de seguridad e
  incidentes; `reportado_en`/`cerrado_en` de garantías; `enviado_at`,
  `respondido_at` y `cobrado_at` de extras y estimaciones; `emitida_at` y
  `cancelada_at` de órdenes de compra; `decidido_at` de requisiciones; y todo el
  **registro de actividad**. Las fechas de negocio (`fecha`, periodos, entregas,
  pagos, `created_at`/`updated_at`) sí están repartidas en los seis meses. Por lo
  mismo, las entradas de bitácora se pueden editar durante las primeras 24 h
  después de cargar y luego se cierran.
- **Sobrescribe** en la empresa destino: nombre, IVA, configuración del PDF,
  módulos, margen objetivo y datos del emisor fiscal.
- El guion está escrito para terminar el **2026-09-27**; `--hoy` solo acepta esa
  fecha o una posterior (no mueve la historia).

## Cómo se ve en cada pantalla

- **Inicio**: saldo y finanzas de 4 obras; tres activas.
- **Obras → A (Los Encinos)**: presupuesto de 15 partidas, contrato con
  anticipo, 13 estimaciones en todos los estados, avance por partida semanal,
  extra de barda aprobado y estimado, subcontrato de instalaciones, nota de caja,
  material con existencias y una orden por pagar, bitácora y seguridad
  semanales, **Utilidad en amarillo**.
- **Obras → B (Garza Leal)**: viene de la cotización convertida; extras en todos
  los estados (aprobados, rechazado con motivo, enviado); pagos del cliente en
  caja; nota de herrería con saldo; **Utilidad en verde**.
- **Obras → C (Sendero)**: programa con la estructura atrasada, SIROC vencido,
  accidente con incapacidad, raya de la última semana sin pasar a caja, orden
  parcial y otra con anticipo, traspaso de block, extra en borrador,
  subcontrato de tablaroca desde la nota; **Utilidad en rojo**.
- **Obras → D (Mitras)**: terminada; estimaciones mensuales con finiquito,
  estructura liquidada por nota, garantía con dos reportes.
- **Utilidad**: comparativo con las cuatro obras (rojo, amarillo, verde, verde).
- **Compras**, **Subcontratos**, **IMSS y papeles**, **Herramienta**,
  **Garantías**, **Facturación**, **Ajustes → Visto bueno** (una solicitud
  pendiente), **Pase de lista** y **Cuadrillas**: todos con datos.

## Prueba

```bash
npx vitest run src/db/seed    # ~30 s: PGlite con las 45 migraciones
```

`demo-seis-meses.test.ts` crea usuario y empresa con los helpers del harness,
corre el SQL y comprueba: los conteos por módulo **leídos como el admin (RLS)**
coinciden con lo que el guion dice que creó; los estados de cada historia; cada
estimación **recalculada al centavo** con `lib/estimaciones/calculo.ts`; la raya
en caja = la raya calculada por semana con `calcularNomina`; pagos a
proveedores = salidas de material; la **utilidad de cada obra** con
`lib/rentabilidad` entre −3 % y 22 % (y a medio punto de lo buscado), con al
menos una obra en amarillo o rojo; que el SQL es determinista; que **correrlo dos
veces no cambia nada**; que rechaza ids que no son UUID y un usuario que no es
admin; que la plantilla NOM-031 copiada es la de la web; y que el script de
línea de comandos escribe exactamente el mismo SQL.

Para mover una historia: `margenBuscado` y `pctIndirectos` en `OBRAS`, el plan
real de cada partida (`p(…, plan, real)`) y los pesos de `ORDENES`. Si la raya no
deja lugar al material, el generador se detiene con "Guion descuadrado".
