# Plan — Alcance ampliado: de contratista a constructora (módulos a la medida)

**Fecha:** 2026-09-25
**Estado:** propuesta, pendiente de decisiones del dueño (ver §7)
**Punto de partida:** `main` en `8622a8b` (34 migraciones, 28 tablas)

---

## 0. Idea rectora

ConstructorPro nació para **un** perfil: el contratista que opera como empresa sin serlo
en papel (dueño + contadora + supervisores + cuadrillas a raya + clientes). Ese perfil sigue
siendo el corazón. Para ampliar el alcance **no conviene hacer una app más grande para
todos, sino una app que se arma según quién la usa**:

- El maestro de obra independiente que trabaja solo no debe ver compras, estimaciones ni
  REPSE. Si los ve, piensa que "esto no es para mí" y se va.
- La constructora con residentes y arquitectos necesita justo eso, y sin eso nunca la
  toma en serio.

La pieza que habilita todo lo demás es un **sistema de módulos por empresa**: se eligen al
registrarse según las necesidades y se pueden activar después. Por eso es la Fase 0.

**Regla que manda:** apagar un módulo **oculta**, nunca **borra**. Los datos siguen en la
base; si el módulo se vuelve a activar, todo sigue ahí. Ningún módulo se apaga solo.

---

## 1. Investigación: qué se descuida en el ámbito y qué se puede mejorar

### 1.1 El contexto mexicano

- **La construcción es de los sectores más informales del país.** La ENOE ubica a
  construcción entre los cinco sectores con mayor informalidad, con ~81% de ocupados
  informales. Data México reporta 86% de trabajadores informales, con salario promedio de
  $8.9k frente a $11.9k de los formales.
  → **Ser informal es lo normal, no un caso raro.** El producto no puede *exigir* RFC,
  IMSS ni facturación, pero sí puede *acompañar* al que quiere formalizarse. Esto
  confirma que "formal o informal" es una pregunta del onboarding, no un filtro.
- **Las obligaciones que más se descuidan (y más caro salen):**
  - **SIROC (IMSS):** el registro de cada obra ante el IMSS se hace dentro de los 5 días
    hábiles siguientes al inicio, con reporte de incidencias. Las multas van de ~$2k a
    ~$38k por obra, y el IMSS puede fincar cuotas de forma **retroactiva**, años después.
  - **REPSE (subcontratación especializada):** si el subcontratista no tiene REPSE
    vigente, **el cliente pierde la deducción de ISR y el acreditamiento de IVA** de lo
    que le pagó, y se vuelve responsable solidario. Además hay que entregar información de
    los contratos al IMSS y al Infonavit cada cuatro meses (ICSOE/SISUB).
    → Esto le importa al contratista que **trabaja para una desarrolladora**, como en
    Casas Bienestar: su cliente le va a pedir el expediente.
  - **Bitácora de obra:** en obra pública federal la bitácora electrónica (BESOP) es
    obligatoria y ahí se autorizan estimaciones y ajustes. En obra privada nadie la lleva,
    y cuando hay un pleito con el cliente no existe evidencia.

### 1.2 Dónde se pierde el dinero (global, aplica igual aquí)

- **Cambios y extras mal documentados y un presupuesto mal hecho** son las dos causas
  principales de los sobrecostos. En un estudio, los cambios de diseño explican el 56.5%
  de los sobrecostos y los errores de planeación el 34.5%. Los *change orders* suelen
  representar entre el 7 y el 15% del costo total de una obra.
- **Flujo de caja:** cuando falta dinero, cae la utilidad (47%), la obra se retrasa (33%) y
  el contratista termina pidiendo préstamos (30%).
- **Comunicación campo↔oficina:** el 48% del retrabajo se atribuye a mala comunicación
  (26%) y a datos de obra malos o inaccesibles (22%). La causa principal es la *falta de
  una plataforma común* (estudio FMI/PlanGrid).

### 1.3 Diagnóstico: qué se descuida, qué tenemos y qué falta

| Lo que se descuida | Qué pasa en la práctica | Hoy en ConstructorPro | Oportunidad |
|---|---|---|---|
| **Extras y cambios** | Se acuerdan de palabra y al final "no se cobraron" o hay pleito | Re-aprobación de cotización (0011) y notas de trato (0031) | **Órdenes de cambio** aprobadas por el cliente en el portal, sumadas al presupuesto |
| **Material** | Se compra sin control, sobra o se lo roban, y no se sabe cuánto costó por obra | Solo como movimiento de caja genérico | **Compras y material**: requisición → compra → entrega → consumo por obra |
| **Cobro por avance** | Se cobra "lo que se pueda" y el anticipo no se amortiza bien | Pagos del cliente + estado de cuenta | **Avance y estimaciones**: % por partida, estimación, amortización del anticipo, retenciones |
| **Rentabilidad real** | Se sabe al final (o nunca) si la obra dejó dinero | Presupuesto vs gasto global | **Utilidad por obra y por partida**, con alerta temprana |
| **Evidencia de obra** | Fotos regadas en WhatsApp; sin bitácora | — | **Bitácora con fotos** fechada, firmada, visible para el cliente |
| **Programa** | "Ya casi", sin fechas | — | **Programa simple** por partida (sin Gantt pesado al principio) |
| **IMSS / SIROC / REPSE** | Multas retroactivas; el cliente pierde deducciones | — | **Cumplimiento**: expediente por obra y por subcontratista, con vencimientos |
| **Subcontratistas** | Tratos de palabra, sin contrato ni retención | Notas de obra (0031) con % de deducción | **Contratos de subcontrato** que nacen de la nota |
| **Seguridad en obra** | Sin registro de EPP ni de incidentes | — | **Seguridad**: checklist, incidentes (alimenta el SIROC) |
| **Garantías / postventa** | Se olvidan; el cliente reclama meses después | — | **Postventa**: reportes del cliente vía portal |
| **Herramienta y maquinaria** | Se pierde, no se sabe en qué obra está | — | **Inventario de herramienta** por obra/responsable |

**Conclusión:** las ventajas actuales del producto (funciona sin internet, raya semanal,
cuadrillas, tratos de palabra, portal del cliente) son justo lo que los ERP grandes no
hacen bien. Lo que falta para "subir" a constructora es **control de costo (material,
cambios, avance)** y **cumplimiento**. Diseño, BIM y licitaciones quedan fuera.

---

## 2. Arquitectura habilitadora: módulos por empresa

### 2.1 Catálogo de módulos

| Clave | Módulo | Existe | Siempre activo |
|---|---|:--:|:--:|
| `obras` | Obras y clientes | ✅ | **sí (núcleo)** |
| `cotizaciones` | Cotizaciones y presupuesto | ✅ | |
| `equipo` | Equipo, asistencia y raya | ✅ | |
| `cuadrillas` | Cuadrillas y destajo | ✅ | |
| `caja` | Caja / tesorería (movimientos, comprobantes, importar estado de cuenta) | ✅ | |
| `proyeccion` | Proyección de nómina | ✅ | |
| `notas` | Notas de trato con socios | ✅ | |
| `portal` | Portal del cliente | ✅ | |
| `cambios` | Extras y órdenes de cambio | 🆕 F1 | |
| `rentabilidad` | Utilidad por obra | 🆕 F1 | |
| `fiscal` | Datos para facturar (hoja y paquete para el contador) | 🆕 F1b | |
| `compras` | Compras y material | 🆕 F2 | |
| `estimaciones` | Avance y estimaciones | 🆕 F3 | |
| `bitacora` | Bitácora con fotos | 🆕 F4 | |
| `programa` | Programa de obra | 🆕 F4 | |
| `cumplimiento` | IMSS / SIROC / REPSE | 🆕 F5 | |
| `subcontratos` | Contratos de subcontrato | 🆕 F5 | |
| `seguridad` | Seguridad en obra | 🆕 F7 | |
| `postventa` | Garantías y postventa | 🆕 F7 | |
| `herramienta` | Herramienta y maquinaria | 🆕 F7 | |

Las dependencias se resuelven solas al activar: `cuadrillas`→`equipo`,
`proyeccion`→`equipo`, `estimaciones`→`cotizaciones`, `rentabilidad`→`cotizaciones`,
`cambios`→`cotizaciones`, `subcontratos`→`notas`.

### 2.2 Datos

Migración `0035_modulos_empresa.sql` (aditiva):

```sql
alter table public.empresa_config
  add column if not exists modulos text[] not null default array[
    'obras','cotizaciones','equipo','cuadrillas','caja','proyeccion','notas','portal'
  ],
  add column if not exists perfil jsonb;  -- respuestas del cuestionario (ver §4)
```

- **Las empresas existentes quedan con todo lo actual encendido.** Nadie pierde nada el día
  del despliegue; ese default existe por eso.
- Van en `empresa_config` (y no en una tabla aparte) porque esa fila ya se sincroniza y ya
  tiene su policy de solo-admin (0017/0018): no hay que abrir una puerta nueva.
- Una RPC `activar_modulos(text[])` (SECURITY DEFINER, solo admin) resuelve las dependencias
  y valida contra el catálogo. Escribir el arreglo a mano quedaría sin validar.

### 2.3 Dónde se aplica el módulo

| Capa | Qué hace | Por qué |
|---|---|---|
| Navegación web / pestañas móvil | Oculta lo apagado | Es lo que ve el usuario |
| Rutas `/admin/*` (layout del servidor) | Redirige a "Activa este módulo" | Evita el enlace directo a una pantalla vacía |
| RLS | **No cambia** | El módulo es una preferencia de producto, no una frontera de seguridad. Mezclar ambas cosas complicaría cada policy y rompería la regla "apagar = ocultar". Si más adelante hay planes de pago, el control va en la RPC que activa módulos |
| PDF / portal cliente | No muestra secciones de módulos apagados | Coherencia frente al cliente |

**Móvil:** el móvil va atrasado (Drift v13, sin capa de tesorería 0016-0025). La lista de
módulos se sincroniza como parte de `empresa_config`, y el móvil **oculta lo que todavía no
implementa**, aunque esté activo, con una nota "disponible en la web". Así los módulos
nuevos pueden salir primero en la web sin romper el móvil.

---

## 3. Lista de requisitos

Formato: **RF** = requisito funcional, **RD** = datos, **RR** = roles/permisos,
**RP** = plataforma. Todo lo nuevo es web-primero y el móvil viene después, igual que hoy.

### F0 — Habilitadores

**Landing general**
- RF0.1 La landing habla a los tres perfiles (independiente, contratista con cuadrillas,
  constructora), formales o no, **sin prometer módulos que aún no existen**. *(Hecho en
  esta rama.)*

**Módulos**
- RD0.1 `empresa_config.modulos` + `perfil` (0035), con default = módulos actuales.
- RF0.2 Ajustes → **Módulos** (solo admin): lista con descripción en lenguaje sencillo,
  interruptor y aviso de dependencias.
- RF0.3 Al apagar un módulo: confirmación que dice "tus datos se conservan".
- RF0.4 La navegación web y el shell móvil leen `modulos`.
- RF0.5 Pantalla vacía con "Este módulo está apagado · Activarlo" (el admin lo ve con
  botón; los demás roles ven "pídeselo al administrador").
- RR0.1 Solo admin cambia módulos. Supervisor, contador y colaborador solo los leen.
- RP0.1 Móvil: sincroniza `modulos` y oculta pestañas y secciones.

**Onboarding de necesidades** (detalle en §4)
- RF0.6 Después de "nombre de la empresa", un cuestionario corto (3 pantallas, se puede
  saltar).
- RF0.7 Un resumen "Te activamos esto" con interruptores, antes de entrar.
- RF0.8 Si se salta el cuestionario, se activa el paquete recomendado del perfil
  "contratista con cuadrillas" (el actual).
- RD0.2 `crear_empresa` gana `p_modulos text[]` y `p_perfil jsonb` (opcionales, así no se
  rompe el cliente viejo).
- RF0.9 El camino "Me invitaron" no cambia: el invitado hereda los módulos de la empresa.

### F1 — Extras y rentabilidad (costo bajo, impacto alto)

**Extras y órdenes de cambio** (`cambios`)
- RF1.1 Desde una obra: "Nuevo extra" con concepto, cantidad, precio y motivo, y opción de
  foto.
- RF1.2 Estados: borrador → enviado al cliente → aprobado/rechazado. Se reusa el patrón
  de snapshot y re-aprobación de 0011.
- RF1.3 El cliente aprueba o rechaza desde el portal, y queda fecha y quién lo hizo.
- RF1.4 Un extra aprobado suma al presupuesto y al estado de cuenta del cliente como línea
  aparte ("Extras").
- RF1.5 PDF del extra para mandarlo por WhatsApp.
- RD1.1 `orden_cambio` + `orden_cambio_renglon` (con columnas de sync).

**Utilidad por obra** (`rentabilidad`)
- RF1.6 Por obra: contratado (presupuesto + extras) vs costo real (raya + destajo +
  movimientos de salida + notas liquidadas) = utilidad y margen %.
- RF1.7 Semáforo: margen proyectado por debajo del objetivo (configurable, por ejemplo 15%).
- RF1.8 Comparativo entre obras (tabla).
- RD1.2 Categoría de costo en `movimientos` (mano de obra / material / subcontrato /
  indirecto / otro). Aditivo y nullable.
- RR1.1 Admin y contador. El supervisor no ve la utilidad (decisión del dueño, §7).

### F1b — Datos para facturar (`fiscal`): la app como facilitador, no como facturador

**Principio:** ConstructorPro **no factura ni se conecta al SAT**. Organiza los datos que ya
tiene para que quien facture (el usuario en el portal del SAT, su sistema de facturación o
su contador) **copie en vez de buscar**. Sirve igual a quien factura por su cuenta, con un
proveedor o a través del contador, y a quien no factura no le estorba (el módulo va
apagado).

**Datos (todo opcional; solo se piden con el módulo activo)**
- RD1b.1 Emisor, en `empresa_config`: RFC, razón social tal cual aparece en la constancia,
  régimen fiscal y código postal fiscal.
- RD1b.2 Receptor, en `clientes`: RFC, razón social exacta, régimen, código postal, uso
  del CFDI habitual, correo para la factura y PDF de su constancia de situación fiscal.
- RD1b.3 Por concepto del catálogo y del presupuesto: clave de producto o servicio SAT y
  clave de unidad. Se captura **una vez** y se reusa en cada cotización.
- RD1b.4 Por cobro (pago del cliente, anticipo, estimación, extra): estado fiscal
  `por_facturar | facturado | no_requiere`, folio fiscal (UUID), XML/PDF adjuntos.

**Captura sin fricción**
- RF1b.1 El cliente llena o confirma **sus propios datos fiscales en el portal** (y sube su
  constancia). Es la fuente más común de facturas rechazadas por datos mal copiados.
- RF1b.2 Validación del formato de RFC (12 o 13 caracteres) y del código postal, **sin
  consultar al SAT**.
- RF1b.3 Sugerencias de claves SAT para conceptos de construcción (servicios de obra,
  unidad de servicio/actividad, metro cuadrado, pieza), con la leyenda "sugerencia;
  confírmala con tu contador". El usuario siempre puede cambiarla.

**Lo que entrega**
- RF1b.4 **Hoja para facturar** (PDF + botones de copiar en la web) por cada cobro
  pendiente: emisor, receptor, conceptos con sus claves, subtotal, IVA, retenciones, total,
  forma de pago (efectivo/transferencia), método sugerido (una exhibición o parcialidades),
  uso del CFDI y notas del caso ("anticipo", "parcialidad 2 de 5, se relaciona con el folio
  X"). **Los campos van en el mismo orden en que los pide el facturador del SAT**, para
  capturar de corrido.
- RF1b.5 **Paquete para el contador** (Excel por periodo, un botón). Hojas:
  1. Por facturar: cobros sin folio fiscal, con todos los datos de RF1b.4.
  2. Complementos de pago pendientes: abonos recibidos sobre facturas en parcialidades.
  3. Facturado: folios, montos y estado de cobro.
  4. Gastos por obra, con o sin factura (útil para deducciones).
  5. Raya del periodo (lo que ya exporta RF5.6).
  6. Resumen de IVA cobrado vs IVA pagado, **marcado "estimado, no es declaración"**.
  Incluye los XML y PDF adjuntos en un ZIP.
- RF1b.6 Cerrar el ciclo: después de facturar, el usuario pega el folio fiscal o sube el
  XML (la app lo lee y llena montos y folio). El cobro pasa a "facturado" y queda ligado
  para sus complementos de pago.
- RF1b.7 (Después, según demanda) Exportar en el formato de carga masiva de algún sistema
  de facturación concreto. Cada proveedor usa un formato distinto: se hace uno por uno,
  cuando un usuario real lo pida.

**Roles y privacidad**
- RR1b.1 Los datos fiscales los ven y editan solo el admin y el contador; el cliente solo
  los suyos. El RFC de una persona física es dato personal: va en el aviso de privacidad.
- RR1b.2 Nunca se pide ni se guarda la e.firma, el CSD ni la contraseña del SAT.

### F2 — Compras y material (`compras`)

- RF2.1 Catálogo de materiales (unidad, último precio, proveedor), separado del catálogo
  de conceptos.
- RF2.2 Requisición desde campo (supervisor, también sin conexión): material, cantidad,
  obra, para cuándo.
- RF2.3 Orden de compra: proveedor, precios, IVA, condiciones. PDF.
- RF2.4 Recepción en obra con cantidad recibida, foto de la remisión y faltantes.
- RF2.5 Una compra pagada genera el movimiento de caja (sin captura doble) con categoría
  "material".
- RF2.6 Proveedores: datos, saldo por pagar y días de crédito.
- RF2.7 (Después) Existencias por obra y traspasos entre obras.
- RD2.1 `materiales`, `proveedores`, `requisiciones`(+renglón), `ordenes_compra`(+renglón),
  `recepciones`.
- RR2.1 Supervisor: requisita y recibe. Admin: aprueba y compra. Contador: paga. Rol
  nuevo opcional **compras** (F6).

### F3 — Avance y estimaciones (`estimaciones`)

- RF3.1 Avance físico por partida del presupuesto (cantidad ejecutada o %), capturado en
  campo.
- RF3.2 Estimación = periodo + cantidades ejecutadas × precio unitario del presupuesto.
- RF3.3 Amortización automática del anticipo (el % del anticipo se descuenta de cada
  estimación).
- RF3.4 Retenciones configurables por obra (fondo de garantía %, 5 al millar en obra
  pública, otras).
- RF3.5 Estados: borrador → enviada → autorizada → cobrada. Se vincula con los pagos del
  cliente.
- RF3.6 PDF de estimación con números generadores (cantidades por partida).
- RF3.7 Avance físico vs avance financiero en el detalle de la obra (lo que el cliente ve
  en el portal).
- RD3.1 `avance_partida`, `estimaciones`(+renglón), `obra_retencion`, anticipo en `obras`.
- RR3.1 Supervisor captura el avance. Admin crea y envía la estimación. El cliente
  autoriza en el portal.

### F4 — Bitácora y programa

**Bitácora** (`bitacora`)
- RF4.1 Entrada por día y obra: texto, fotos (hasta N), clima, personal presente (sale
  del pase de lista) y tipo (avance / incidencia / instrucción / visita).
- RF4.2 Funciona sin conexión: las fotos se suben al volver la señal. Se reusa el patrón
  de comprobantes (0024).
- RF4.3 Una entrada no se edita después de 24 h; solo se agrega una aclaración. Así sirve
  como evidencia.
- RF4.4 El cliente ve en el portal las entradas marcadas como visibles.
- RF4.5 PDF de bitácora por periodo.
- RD4.1 `bitacora_entrada`, `bitacora_foto` + bucket.

**Programa de obra** (`programa`)
- RF4.6 Fecha de inicio y fin por partida o sección. Vista de barras sencilla.
- RF4.7 Programado vs real (con el avance de F3). Alerta de partidas atrasadas.
- RF4.8 Sin dependencias ni ruta crítica en la v1.

### F5 — Cumplimiento y subcontratos

**Cumplimiento** (`cumplimiento`)

**Principio:** igual que con el SAT, **la app no se conecta al IMSS, a la STPS ni a ningún
sistema de gobierno** (no hay API abierta, y SIROC, IDSE y REPSE funcionan con la e.firma
del patrón). Es la libreta y la alarma: recuerda lo que toca, guarda la prueba de que se
hizo y avisa antes de que se venza. El trámite lo hace el usuario o su contador en el portal
oficial. Junto a cada documento va el enlace a la consulta pública oficial (padrón REPSE,
validación de la opinión de cumplimiento), pero quien verifica es la persona.

- RF5.0 NSS, CURP y RFC de los colaboradores: campos opcionales, visibles solo para el
  admin y el contador (RLS), y documentos en un bucket privado con enlaces temporales. Los
  incidentes de trabajo son datos de salud (sensibles): van con tratamiento aparte si
  entra F7.
- RF5.1 Por obra: número de registro SIROC, fecha de inicio y un recordatorio de "tienes
  5 días hábiles".
- RF5.2 Por empresa: REPSE (folio y vigencia), con alertas de vencimiento.
- RF5.3 Checklist de entregables periódicos (ICSOE/SISUB cuatrimestral) con fechas.
- RF5.4 Expediente por subcontratista: REPSE, constancia fiscal, opinión de cumplimiento,
  cada documento con su vencimiento.
- RF5.5 El sistema **no calcula cuotas IMSS ni ISR**: registra, recuerda y guarda
  documentos. El cálculo lo hace el contador en su sistema (ver §7).
- RF5.6 Exportar la lista de raya en el formato que pida el contador (CSV/Excel).

**Subcontratos** (`subcontratos`)
- RF5.7 "Convertir nota en contrato": los renglones de la nota pasan a ser el alcance, más
  el monto, las retenciones y la forma de pago.
- RF5.8 PDF de contrato con cláusulas base editables. Se reusan los textos finales de PDF
  (0032/0033).
- RF5.9 Pagos al subcontratista con la retención aplicada. Se liga a la caja.

### F6 — Organización grande

- RR6.1 Roles nuevos: **residente** (supervisor de una o varias obras específicas),
  **compras** y **almacén**. Se crean con policies aditivas, igual que el contador en 0022.
- RF6.2 Acceso por obra: un residente solo ve sus obras.
- RF6.3 Aprobaciones configurables (por ejemplo, una compra mayor a $X requiere al admin).
- RF6.4 Registro de actividad (quién cambió qué).
- RF6.5 (Evaluar) Varias razones sociales o sucursales dentro de una cuenta.

### F7 — Operación extendida

- RF7.1 **Seguridad**: checklist diario, entrega de EPP por colaborador e incidentes (se
  liga al SIROC).
- RF7.2 **Postventa**: el cliente levanta un reporte de garantía desde el portal, con
  estados y fotos.
- RF7.3 **Herramienta**: inventario, asignación a obra y a responsable, historial.

### Requisitos transversales (aplican a todas las fases)

- RT1 Todo lo que se captura en campo funciona sin conexión (el principio del producto).
- RT2 Cada tabla nueva lleva columnas de sync + aislamiento por empresa (0019) + policies
  aditivas.
- RT3 Cada módulo lleva su PDF, con la paleta y los textos finales configurables.
- RT4 Lenguaje de obra, no de ERP ("lo que se hizo esta semana", no "registro de avance
  físico").
- RT5 Contraste AA (el test de contraste ya falla el build en Flutter).
- RT6 Tests de paridad web↔móvil para cualquier cálculo de dinero (estimación, amortización,
  retención, utilidad).
- RT7 Nunca guardar con upsert parcial en tablas de configuración.

---

## 4. Onboarding de necesidades

### 4.1 Flujo

```
/login?modo=registro  (correo + contraseña; sin cambios)
        │
/onboarding  ── "Me invitaron" ──► canjear código (sin cambios)
        │
   "Estoy creando mi empresa"
        │
 Paso 1  Nombre de la empresa o de cómo te conocen
        │
 Paso 2  ¿Cómo trabajas hoy?                  (una opción)
        │
 Paso 3  ¿Qué quieres resolver primero?       (varias opciones)
        │
 Paso 4  Te activamos esto  [interruptores]  → "Puedes activar más en Ajustes"
        │
      /admin  (con una guía de "primera obra" según el perfil)
```

Todo es opcional excepto el nombre. El botón "Saltar" siempre está visible y usa el
paquete recomendado.

### 4.2 Preguntas

**Paso 2 — ¿Cómo trabajas hoy?** (define el tamaño)

| Opción | Perfil | Paquete base |
|---|---|---|
| Trabajo solo o con 1–3 ayudantes | `independiente` | obras, cotizaciones, equipo, caja |
| Tengo una o varias cuadrillas | `contratista` | + cuadrillas, proyeccion, notas, portal |
| Tengo oficina: supervisores o residentes, contadora | `empresa` | + rentabilidad, compras, estimaciones |
| Soy constructora o desarrolladora con varios frentes | `constructora` | + bitacora, programa, cumplimiento, subcontratos |

Pregunta secundaria en la misma pantalla: **"¿Facturas o tienes gente dada de alta en el
IMSS?"** (Sí / Algunos / No, todavía no). Si responde "Sí" o "Algunos" se sugiere
`cumplimiento`; con "No" no se muestra. **Nunca se pide RFC en el registro.**

**Paso 3 — ¿Qué quieres resolver primero?** (varias opciones, en lenguaje de obra)

| Necesidad (lo que ve el usuario) | Activa |
|---|---|
| Cotizar rápido y verme profesional | cotizaciones |
| Pasar lista y sacar la raya del viernes | equipo |
| Organizar mis cuadrillas y pagar destajos | cuadrillas, equipo |
| Saber cuánto dinero entra y sale de cada obra | caja |
| Saber si la obra me está dejando ganancia | rentabilidad, cotizaciones |
| Cobrar los extras que me piden | cambios |
| Controlar el material y las compras | compras |
| Cobrar por avance (estimaciones) | estimaciones |
| Que mi cliente vea cómo va su obra | portal |
| Llevar los tratos con mis maestros y subcontratistas | notas (+ subcontratos si es empresa) |
| Tener evidencia con fotos de todo lo que pasa | bitacora |
| Cumplir con IMSS, SIROC y REPSE | cumplimiento |
| Tener todo listo para facturar o para mi contador | fiscal |

Se activa la **unión** de paquete base + necesidades + dependencias. Las necesidades que
todavía no existen aparecen con la etiqueta "Próximamente" y **se guardan en `perfil`**:
eso da una lista real de demanda para priorizar las fases.

**Paso 4 — Resumen:** lista de lo que se activa, cada módulo con su interruptor, y abajo
"Otros módulos disponibles" apagados. El texto que se muestra:
*"Empieza con esto. Puedes prender o apagar módulos cuando quieras en Ajustes → Módulos;
apagar uno no borra tus datos."*

### 4.3 Después del registro

- Tarjeta "Siguiente paso" en `/admin` según el perfil (independiente: "Haz tu primera
  cotización"; contratista: "Da de alta tu cuadrilla").
- Sugerencias de módulo según el uso. Ejemplo: si registra más de 3 movimientos de
  material y `compras` está apagado, sugerir "¿Quieres controlar tu material?". Máximo una
  sugerencia a la vez, y se puede descartar para siempre.
- El móvil sin cuenta (modo offline puro) no pasa por el onboarding. Al vincular cuenta,
  hereda los módulos de la empresa.

---

## 5. Orden estratégico

| Fase | Contenido | Por qué en este orden | Tamaño |
|---|---|---|---|
| **F0** | Landing general · módulos · onboarding de necesidades | Habilita todo lo demás y empieza a juntar datos de demanda (`perfil`) **antes** de construir. Riesgo bajo: solo reorganiza lo que ya existe | S–M |
| **F1** | Extras + utilidad por obra | La causa principal de sobrecostos. Reusa 0011 (re-aprobación) y datos que ya existen. Sirve a **todos** los perfiles, incluido el tuyo | M |
| **F1b** | Datos para facturar | Reusa lo que ya existe (clientes, pagos, conceptos). Le quita horas al contador **sin** entrar al negocio de la facturación. Puede ir en paralelo con F1 | S–M |
| **F2** | Compras y material | El material es el otro gran costo junto con la mano de obra. Es la primera pieza "de empresa" | L |
| **F3** | Avance y estimaciones | Necesita presupuesto sólido y la utilidad de F1. Es lo que pide una desarrolladora al subcontratista | L |
| **F4** | Bitácora + programa | La bitácora es barata con el patrón de comprobantes; el programa se apoya en el avance de F3 | M |
| **F5** | Cumplimiento + subcontratos | Diferenciador fuerte para quien trabaja para desarrolladoras. Requiere asesoría de un contador para acertar los formatos | M |
| **F6** | Roles y organización grande | Se hace cuando haya constructoras usándolo: sin ellas, sería especular | M–L |
| **F7** | Seguridad, postventa, herramienta | Valor real pero no decide la compra. Se prioriza según la demanda capturada en `perfil` | M c/u |

**Móvil:** cerrar la brecha de tesorería (0016-0025) **antes** de F2. Compras y
estimaciones se capturan en campo, y si el móvil no tiene caja, la cadena compra→pago
queda rota en el teléfono.

**Criterio para avanzar de fase:** que la anterior esté en producción en las dos
plataformas (o marcada como "solo web" a propósito) y que la usen en una obra real (Casas
Bienestar es el banco de pruebas).

---

## 6. Qué NO hacer

- **No** calcular IMSS/ISR/Infonavit (nómina fiscal). Es muy riesgoso por la
  responsabilidad legal y cambia cada año. Mejor registrar, recordar y exportar para el
  contador.
- **No** hacer Gantt con ruta crítica, BIM ni licitaciones. Es otro producto.
- **No** hacer que un módulo apagado bloquee datos en RLS.
- **No** pedir RFC ni datos fiscales para registrarse.
- **No** timbrar facturas ni conectarse al SAT, IMSS o STPS. Tampoco guardar la e.firma, el
  CSD ni contraseñas. Si algún día la demanda justifica emitir facturas, se hace con un PAC
  por su API y el CSD vive en el PAC, no con nosotros.
- **No** anunciar en la landing módulos que no existen (la landing ya se ajustó con esa
  regla).

---

## 7. Decisiones que te tocan a ti

1. **¿El supervisor ve la utilidad de la obra?** Recomiendo que no (solo admin y contador).
2. **¿Los módulos se van a cobrar?** (plan básico / pro). El diseño lo permite porque el
   control va en la RPC `activar_modulos`, pero el copy de precio sigue neutro hasta que
   decidas.
3. **Asesor fiscal para F5:** ¿tienes un contador que valide los formatos de SIROC, REPSE e
   ICSOE?
4. **Rol "residente"** (F6): ¿es lo mismo que el supervisor pero limitado a sus obras, o
   tiene permisos distintos?
5. **¿Arrancamos por F0 + F1?** Es mi recomendación.

---

## Fuentes

- [INEGI — ENOE, boletines 2025](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/iooe/IOE2025_12.pdf) · [Rotativo — informalidad por sector, dic. 2025](https://rotativo.com.mx/inegi-informalidad-laboral-mexico)
- [Data México — Construcción](https://www.economia.gob.mx/datamexico/es/profile/industry/construction)
- [IMSS — Registro de obra, fases e incidencias (SIROC)](https://www.imss.gob.mx/tramites/imss02097) · [SISC MX — multas por no registrar obra](https://www.sisc.mx/descubre-las-multas-del-imss-por-no-registrar-una-obra-incluso-si-ya-paso-tiempo/)
- [Siempre al Día — implicaciones fiscales del REPSE](https://siemprealdia.co/mexico/fiscal/implicaciones-fiscales-del-repse/) · [Carbajal Contadores — REPSE, SISUB e ICSOE 2026](https://carbajalcontadores.com/2026/09/19/repse-sisub-icsoe-2026-subcontratacion-especializada-obligaciones-retenciones-sat)
- [Despacho Mata — bitácora de obra y BESOP](https://www.despachomata.com/cbj/publicaciones/obra-publica/bitacora) · [DOF — lineamientos BESOP 2023](https://www.dof.gob.mx/nota_detalle.php?codigo=5695761&fecha=17/07/2023)
- [ETASR — impacto de los change orders en sobrecostos](https://etasr.com/index.php/ETASR/article/view/9449) · [Sage — causas de sobrecostos](https://www.sage.com/en-us/blog/construction-project-cost-overruns/)
- [Autodesk/FMI — el costo de la mala comunicación y los datos malos](https://www.autodesk.com/blogs/construction/survey-plangrid-fmi/)
