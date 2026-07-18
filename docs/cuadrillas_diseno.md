# Cuadrillas de colaboradores — análisis y diseño

> Rama: `feat/colaboradores-cuadrillas`. Análisis apoyado en el grafo Graphify
> (`graphify-out/graph.html`, 1336 nodos / 60 comunidades, extracción AST de `lib/`)
> + investigación de cómo operan las cuadrillas en construcción (México)
> + introspección del esquema REAL de producción (Supabase Management API).

## Estado de implementación (Fases 1–3 ✅ hechas y verificadas)

- **Fase 1 — Datos + sync:** ✅ 3 tablas Drift (`Cuadrillas`, `CuadrillaMiembro`,
  `AsignacionCuadrillaObra`) + `cuadrilla_id` nullable en `asistencias`/`destajos`;
  migración local v6→**v7** idempotente; snapshot `drift_schemas/drift_schema_v7.json`;
  cableado de sync (`pushOrder`, `resetAll`, `sellarEmpresaId`); migración Supabase
  **`supabase/migrations/0015_cuadrillas.sql`** (aditiva, idempotente, RLS espejo de
  0014); `CuadrillaRepository` + providers.
- **Fase 2 — UI gestión:** ✅ `cuadrillas_screen.dart` (lista, crear/editar, miembros,
  cabo, asignación a obra); acceso desde "Equipo".
- **Fase 3 — Pase de lista por cuadrilla:** ✅ agrupación por cuadrilla + acción
  "marcar toda la cuadrilla"; sella `cuadrilla_id` sin afectar la nómina.
- **Fase 4 — Destajo por cuadrilla + reparto:** ✅ hecha SIN tabla nueva ni migración:
  la bolsa se guarda como **N filas de `destajos`** (una por miembro, monto = bolsa × %),
  todas con el mismo `cuadrilla_id` y concepto (reutiliza la columna ya aplicada en 0015).
  `DestajoRepository.registrarBolsaCuadrilla` + `destajo_cuadrilla_screen.dart` (captura de
  bolsa, reparto por % con validación 100%, "partes iguales"). La nómina existente las suma
  por colaborador sin cambios.

**Verificación:** `dart analyze lib` sin errores; **65 tests** en verde, incluyendo
`test/data/cuadrilla_test.dart` (flujo end-to-end + reparto de bolsa) y
`test/data/migration_v7_test.dart` (migración v6→v7 valida esquema contra snapshot y
preserva datos).

**Producción:** `0015_cuadrillas.sql` ✅ **YA aplicada** (2026-07-18, verificada: 3
tablas, `cuadrilla_id` nullable en asistencias/destajos, 4 policies RLS por tabla,
RLS + trigger). Al ser aditiva, la app y la web actuales la ignoran hasta desplegar.

## 1. Forma actual de los colaboradores (lo que ya existe)

El grafo y el esquema Drift (`lib/data/tables/tables.dart`) muestran que **todas** las
entidades comparten el mismo molde: mixin `SyncCols` (multitenant + offline-first LWW)
+ `Table` con PK de UUID TEXT. Cualquier tabla nueva debe seguir ese molde.

Entidades relevantes hoy:

| Entidad | Rol en el modelo | Notas |
|---|---|---|
| `Colaboradores` | Trabajador (global por empresa) | `puestoId`, `tipoPago` (DIA\|DESTAJO), sueldo por periodo derivado a diario, contacto/emergencia, `activo` |
| `Puestos` | **Catálogo de roles** | `nombre` + `salarioDiaDefault`. Ya modela oficial/ayudante/cabo como "puesto" |
| `ObraColaborador` | **N:M obra↔colaborador con fechas** | PK `(obraId, colaboradorId)`, `fechaIngreso`/`fechaSalida`, `salarioDiaOverride` |
| `Asistencias` | Pase de lista **individual** | `(colaboradorId, obraId, fecha, fraccion)`, único por `(colab, obra, fecha)` |
| `Destajos` | Pago a destajo **individual** | `(colaboradorId, obraId, fecha, monto)` |

**Hallazgos clave:**

1. **La dimensión "rol" ya existe** vía `Puestos`. No hay que re-modelar cabo/oficial/
   ayudante: son puestos. La cuadrilla solo necesita apuntar a un **jefe**.
2. **El patrón N:M con historial ya existe** en `ObraColaborador` (fechas ingreso/salida).
   La membresía a cuadrilla debe clonar ese patrón, no inventar uno nuevo.
3. **La asistencia y el destajo ya son individuales y cuelgan de `(colaborador, obra, fecha)`**.
   Para "pase de lista por cuadrilla" basta **agrupar** en UI + una columna opcional
   `cuadrillaId`; el dato sigue siendo individual (coincide con la práctica real).
4. Todo es **obra-céntrico**: la app cuelga el trabajo de la obra. La decisión de diseño
   más importante es si la cuadrilla es **global reutilizable** o **por obra**.

## 2. Cómo funcionan las cuadrillas en la realidad (investigación)

- **Cuadrilla** = equipo pequeño (2–6) por **especialidad** (albañilería, acero, cimbra,
  instalaciones, acabados), bajo un mando de campo (**cabo/jefe de cuadrilla**).
- Jerarquía: maestro de obra → cabo → oficial → media cuchara → ayudante/peón. El **cabo
  es un colaborador** con rol de mando.
- Una cuadrilla trabaja **una obra a la vez** pero **rota** entre obras según la fase.
- La pertenencia es **estable pero no permanente**: un colaborador puede cambiar de
  cuadrilla entre proyectos → conviene **N:M con fechas** (historial).
- **Asistencia individual** (aunque el cabo reporte a toda su cuadrilla de golpe).
- Dos esquemas de pago coexisten: **raya** (por asistencia, individual) y **destajo por
  cuadrilla** (bolsa que el cabo reparte, ayudante ~30–40%). La app ya tiene ambos, pero
  el destajo es individual.
- ERPs (Procore) validan el patrón: **cuadrilla con jefe como atributo + miembros +
  asignación temporal a obra**.

## 3. Diseño propuesto (mínimo correcto, fiel a las convenciones)

Dos tablas nuevas + columnas opcionales. Ambas con `SyncCols` y UUID TEXT.

> **Alcance decidido:** cuadrilla **global reutilizable + asignación a obra con fechas**
> (Modelo A). La cuadrilla persiste su identidad e historial y **rota entre obras**. Son
> **tres** tablas nuevas: `Cuadrillas`, `CuadrillaMiembro`, `AsignacionCuadrillaObra`.

### `Cuadrillas` (global, por empresa)
```
id TEXT PK
nombre TEXT
especialidad TEXT            // "ALBANILERIA"|"ACERO"|"CIMBRA"|"INSTALACIONES"|"ACABADOS"|"MIXTA"
jefeColaboradorId TEXT NULL  // el cabo; debe existir también como miembro
activa BOOL = true
+ SyncCols
```

### `CuadrillaMiembro`  (N:M con historial — clon de `ObraColaborador`)
```
cuadrillaId TEXT
colaboradorId TEXT
fechaIngreso INT
fechaSalida INT NULL
PK (cuadrillaId, colaboradorId)
+ SyncCols
```

### `AsignacionCuadrillaObra`  (la cuadrilla rota entre obras)
```
id TEXT PK
cuadrillaId TEXT
obraId TEXT
fechaInicio INT
fechaFin INT NULL
fase TEXT = ''               // frente/fase opcional (cimbra, acabados, ...)
+ SyncCols
```
> Regla: para "una obra a la vez", el repositorio valida que no haya dos asignaciones de
> la misma cuadrilla con periodos solapados (SQLite local no lo impone por sí solo).

### Columna opcional en `Asistencias` y `Destajos`
```
cuadrillaId TEXT NULL   // agrupa el pase de lista / la bolsa de destajo; el dato sigue individual
```

## 4. Plan de implementación por fases

**Fase 1 — Datos (fundacional).**
- Tablas Drift `Cuadrillas`, `CuadrillaMiembro`, `AsignacionCuadrillaObra` (+ columnas `cuadrillaId` opcionales).
- Registrar en `@DriftDatabase`; `schemaVersion` 6 → 7; paso `if (from < 7)` idempotente
  (`createTable` + `addColumn` con checks `pragma_table_info`); re-`_instalarTriggersSync()`.
- Snapshot de esquema (`drift_dev schema dump`) + test de migración.
- Migración Supabase `0015_cuadrillas.sql` (tablas espejo) + RLS por `empresa_id`.
- Añadir tablas a `sellarEmpresaId` y a la lista de sync (pull/push).
- Modelos de dominio puros + `CuadrillaRepository` + providers Riverpod.

**Fase 2 — Gestión de cuadrillas (UI).**
- Pantalla de cuadrillas: crear, editar, especialidad, asignar/quitar miembros, marcar jefe.
- Reusar `colaboradorRepositoryProvider` / `colaboradoresPorObraProvider` (nodos god del grafo).

**Fase 3 — Pase de lista por cuadrilla.**
- Agrupar `pase_lista_screen` por cuadrilla; acción "marcar toda la cuadrilla".
- La asistencia sigue individual; solo se sella `cuadrillaId` para el reporte.

**Fase 4 — Destajo por cuadrilla + reparto (futuro/opcional).**
- Bolsa de destajo por cuadrilla y reparto por porcentaje entre miembros (cabo define %).

## 5. Riesgos / cuidados

- **Migración local es destructiva si se hace mal** (`lib/core/db/app_database.dart` avisa:
  la BD es 100% local). Todo cambio de esquema pasa por el punto único `onUpgrade`, con
  checks idempotentes y snapshot de prueba.
- **Sync:** cada tabla nueva necesita trigger `mark_pending`, entrar en `sellarEmpresaId`,
  en el pull/push y en el `0015` de Supabase con RLS, o no sincroniza / filtra datos entre
  empresas.
- **Integridad:** `jefeColaboradorId` debería existir como fila en `CuadrillaMiembro`
  (evitar cuadrilla sin mando). Validar en repositorio (SQLite local sin FK estricta).
