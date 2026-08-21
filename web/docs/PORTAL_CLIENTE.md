# 👤 Lo que ve el CLIENTE en su portal

Documento de referencia: qué muestra el portal del cliente (`/cliente`), pantalla
por pantalla, y **qué NO ve** (lo interno queda oculto). El acceso lo da el admin
con un **código de 6 dígitos**; una vez vinculado, el cliente **solo ve lo suyo**
(garantizado por RLS en la base de datos, no por el frontend).

> Regla de oro: el cliente ve **su presupuesto, el avance de su obra y su estado de
> cuenta (lo que ha pagado y lo que debe)**. NUNCA ve costos internos, salidas de
> caja, comisiones, nómina, destajos, proveedores ni datos de otros clientes.

---

## 0. Entrar / vincularse

1. El cliente abre el portal e **inicia sesión** (o crea su cuenta con su correo).
2. Si su cuenta aún no está ligada, ve:

```
┌───────────────────────────────────────────────┐
│  Bienvenido a Cimnova                   │
│                                                │
│  Ingresa el código de acceso que te dio tu     │
│  constructora.                                 │
│                                                │
│            ┌───────────────┐                   │
│            │   4 8 2 9 3 1 │   [ Vincular ]    │
│            └───────────────┘                   │
└───────────────────────────────────────────────┘
```

3. Ingresa el código → queda vinculado → ya ve su información.

---

## 1. Resumen  (`/cliente`)

Vista de entrada. De un vistazo: su dinero y el avance.

```
┌───────────────────────────────────────────────────────────┐
│  Hola, Roberto Garza                                        │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────────┐  │
│  │Presupuesto│  │  Pagado   │  │  Saldo pendiente       │  │
│  │$5,923,000 │  │$3,176,450 │  │  $2,746,550   (ámbar)  │  │
│  └───────────┘  └───────────┘  └───────────────────────┘  │
│                                                             │
│  Mis obras                                                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Casa Adalberto Tejeda                                 │ │
│  │ Avance de obra   ▓▓▓▓▓▓▓░░░  62%                       │ │
│  │ Avance de pago   ▓▓▓▓▓░░░░░  54%                       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                             │
│  Cotizaciones pendientes de tu respuesta                    │
│  • Ampliación cochera — $245,000   [Ver]                    │
│                                                             │
│  [ Ver cotizaciones ]   [ Ver obras ]                       │
└───────────────────────────────────────────────────────────┘
```

**Muestra:** saludo con su nombre, tarjetas de presupuesto/pagado/saldo, sus obras
con barra de avance, cotizaciones que esperan su respuesta, y accesos rápidos.

---

## 2. Cotizaciones  (`/cliente/cotizaciones`)

Lista de las cotizaciones/presupuestos que la constructora le envió.

```
┌───────────────────────────────────────────────────────────┐
│  Mis cotizaciones                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Casa Adalberto Tejeda    10/oct/2025   $5,923,000     │ │
│  │                                         [Aceptada] ●  │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │ Ampliación cochera       02/feb/2026   $245,000       │ │
│  │                                         [Enviada]  ●  │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

Estados posibles: **Enviada** (espera su respuesta), **Aceptada**, **Rechazada**.

### Detalle de una cotización  (`/cliente/cotizaciones/[id]`)

El presupuesto formal, en **solo lectura**:

```
┌───────────────────────────────────────────────────────────┐
│  Casa Adalberto Tejeda                        [Enviada]     │
│  Cliente: Roberto Garza · Ejido 1ero de Mayo               │
│                                                             │
│  CIMENTACIÓN                                                │
│   Concepto            Cant.  Unid.   P.U.       Importe     │
│   Excavación          120    m³      $250      $30,000      │
│   Zapatas             …                                     │
│  ALBAÑILERÍA                                                │
│   …                                                         │
│                                                             │
│                     Subtotal            $5,106,034          │
│                     IVA (16%)             $816,966          │
│                     TOTAL              $5,923,000           │
│                                                             │
│  [ Descargar PDF ]   [ Aceptar cotización ]  [ Rechazar ]  │
└───────────────────────────────────────────────────────────┘
```

- Ve secciones y partidas con cantidades, unidades, precio unitario e importe.
- Ve subtotal, descuento (si aplica), IVA y total.
- Puede **Descargar PDF** del presupuesto.
- Si está **Enviada**, puede **Aceptar** o **Rechazar** (queda registrado).

---

## 3. Obras  (`/cliente/obras`)

Sus obras con avance y estado de cuenta.

```
┌───────────────────────────────────────────────────────────┐
│  Mis obras                                                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Casa Adalberto Tejeda                                 │ │
│  │ Avance de obra  ▓▓▓▓▓▓▓░░░ 62%                         │ │
│  │ Presupuesto $5,923,000 · Pagado $3,176,450 ·          │ │
│  │ Saldo $2,746,550                                      │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### Detalle de una obra  (`/cliente/obras/[id]`)

```
┌───────────────────────────────────────────────────────────┐
│  Casa Adalberto Tejeda                                      │
│  Ejido 1ero de Mayo · Inicio: 10/oct/2025                  │
│                                                             │
│  Avance de la obra   ▓▓▓▓▓▓▓░░░  62%                        │
│                                                             │
│  Estado de cuenta                                           │
│   Presupuesto        $5,923,000                             │
│   Pagado             $3,176,450                             │
│   Saldo pendiente    $2,746,550   (ámbar)                   │
│                                                             │
│  Mis pagos                                                  │
│   Fecha        Concepto              Monto                  │
│   10/oct/2025  Anticipo             $100,000               │
│   23/oct/2025  Anticipo             $100,000               │
│   11/nov/2025  Materiales           $406,450               │
│   …                                                         │
│                                                             │
│                       [ Descargar estado de cuenta (PDF) ] │
└───────────────────────────────────────────────────────────┘
```

- **Avance %** de la obra.
- **Estado de cuenta REAL de esa obra** (mismo modelo que `/admin`):
  - **Costo total** = suma del presupuesto de la obra (`obra_presupuesto`).
  - **Pagado / Recibido** = suma de sus **entradas** (`movimientos` con `tipo='ENTRADA'`).
  - **Saldo pendiente** = costo − pagado, más una barra de **avance de pago**.
- **Historial de SUS pagos** (solo las ENTRADAS; nunca las salidas de caja).
- **Descargar el estado de cuenta en PDF** (se genera al vuelo, ruta
  `/cliente/obras/[id]/estado-cuenta`: encabezado, presupuesto por partidas,
  totales e historial de pagos).

---

## 🚫 Lo que el cliente NO ve (queda interno para el staff)

- **Salidas de caja / gastos**: pagos a fontanero, eléctrico, planos, comisiones,
  materiales a proveedores, etc.
- **Nombres de proveedores/trabajadores** y cuánto se les pagó.
- **Nómina, asistencia, destajos** de los colaboradores.
- **Utilidad / costos internos** ni el desglose del Excel de control financiero.
- **Catálogo de precios, puestos** ni configuración de la empresa.
- **Datos de otros clientes u otras empresas** (aislamiento por RLS).

En resumen: el cliente ve el **"lado de afuera"** (su presupuesto, su avance, lo que
pagó y lo que debe). Todo el **"lado de adentro"** (cómo se gasta el dinero, a quién
se le paga, márgenes) permanece solo para ti y tu equipo.

---

## 🔒 Cómo se garantiza

El aislamiento NO depende de ocultar cosas en la pantalla, sino de **RLS
(Row-Level Security) en Postgres**: aunque alguien intentara consultar directo, la
base de datos solo devuelve lo ligado a ese cliente.

El rol `cliente` tiene lectura, **scopeada a sus propias obras**, sobre:
`obras`, `cotizaciones` (+ secciones/partidas/pagos), `obra_presupuesto`
(el COSTO TOTAL de su obra) y `movimientos` **únicamente `tipo='ENTRADA'`** (sus
pagos recibidos). El filtro `tipo='ENTRADA'` vive dentro de la política RLS
(`migrations/0010_cliente_estado_cuenta.sql`), de modo que un movimiento de
**SALIDA nunca es visible** para el cliente aunque intente consultarlo directo.

Sin permiso de lectura para el rol `cliente`: `movimientos` de SALIDA, nómina,
asistencia, destajos, colaboradores, catálogo, puestos y los datos de otros
clientes u otras empresas.
