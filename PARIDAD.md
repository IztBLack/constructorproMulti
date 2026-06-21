# Paridad ConstructorPro: Kotlin (original) → Flutter

Estado: **paridad funcional ~95%+**. Todo el flujo operativo está cubierto, con varias
mejoras nuevas. Esta es la trazabilidad de funciones.

## ✅ Implementado (con paridad o mejorado)

| Área | Función |
|---|---|
| Obras | CRUD · detalle con 4 pestañas · **switcher entre obras** |
| Equipo | CRUD · activar/inactivar · contacto emergencia · **historial de obras** · buscar · ordenar (nombre/puesto/obra) · **crear inline al asignar** |
| Asistencia | pase de lista por día · **vista semanal (grid)** · resumen semanal · **pase de lista unificado cross-obra** |
| Nómina | cálculo semanal (16 tests de paridad) · detalle por día · agregar/**eliminar destajo** · **registrar en caja** · PDF |
| Flujo de caja | entradas/salidas · **gasto ligado a partida** · PDF |
| Cotizaciones | CRUD · estados · duplicar · vincular/convertir a obra · **IVA% y descuento configurables** |
| Presupuesto | secciones/partidas · **importar texto** · **clave automática** · **autocompletado catálogo** · **ajuste global de precios** · **avance por partida (aportado/%)** |
| Pagos | **unificados** (pagos + entradas de caja) |
| Archivos | **fotos/planos PDF con visor** |
| Catálogo | CRUD · búsqueda · **cargar catálogo oficial** (239 conceptos) |
| PDF | **logo, color, marca de agua, pie, firma, empresa, mayúsculas, modo compacto** · **diálogo de opciones por reporte** |
| Reportes globales | **flujo, nómina (por semana elegible), presupuestos, asistencias** |
| Dashboard | **selector Mes/Año** · accesos rápidos · **distribución del gasto** · saldo por obra |
| Config | tema · recordatorio de nómina · **zona de peligro** · respaldo · IVA por defecto |
| Transversal | crash logger local · respaldo JSON (puente desde Kotlin) · datos de prueba |

## 🟡 Diferencias menores / pendientes

- **Config de PDF por documento** (`pdfConfigJson` por obra/cotización): se cubre con el
  diálogo de opciones por reporte; no se persiste override por entidad.
- **Diccionario de claves:** portado (~90 prefijos); el original tenía algunos más raros.
- **Editor de presupuesto a nivel obra (legacy):** en Flutter el presupuesto vive bajo
  Cotización (decisión de diseño; se "convierte en obra").
- **Importar conceptos de versiones anteriores** (catálogo): no portado.

## 🔧 Calidad
- `flutter analyze`: sin issues.
- 16/16 tests de paridad de lógica (nómina, flujo, presupuesto).
- APK compila; corre verificado en Android (tableta) e iOS (iPhone vía Sideloadly).
