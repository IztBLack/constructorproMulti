import 'dart:typed_data';

import '../core/db/app_database.dart';
import '../core/pdf/pdf_config.dart';
import '../core/pdf/textos_finales.dart';
import '../data/repositories_nota_obra.dart';
import '../domain/logic/flujo_calculator.dart';
import '../domain/logic/nomina_calculator.dart';
import '../domain/logic/presupuesto_calculator.dart';
import '../domain/logic/proyeccion_nomina.dart';
import 'reportes/asistencias_global.dart';
import 'reportes/estado_cuenta_cliente.dart';
import 'reportes/flujo_caja.dart';
import 'reportes/flujo_caja_global.dart';
import 'reportes/nomina.dart';
import 'reportes/nomina_global.dart';
import 'reportes/nota_obra.dart';
import 'reportes/presupuesto.dart';
import 'reportes/presupuestos_global.dart';
import 'reportes/proyeccion_nomina.dart';

/// Genera los reportes PDF (equivalente a PdfGenerator.kt, con el paquete `pdf`),
/// con personalización (empresa, color, logo, marca de agua, pie).
///
/// Aquí ya no se dibuja nada: cada reporte vive en `reportes/` y las primitivas
/// de estilo en `kit/`. Esta clase se queda como la ÚNICA puerta de entrada
/// para el resto de la app —una pantalla llama `PdfService.nomina(...)` y no
/// necesita saber en qué archivo quedó— y como el lugar donde se lee de un
/// vistazo qué documentos sabe emitir el sistema.
class PdfService {
  // ---------------- Nómina ----------------
  static Future<Uint8List> nomina({
    required String obraNombre,
    required String rango,
    required NominaSummary summary,
    PdfConfig config = const PdfConfig(),
  }) =>
      generarNomina(
        obraNombre: obraNombre,
        rango: rango,
        summary: summary,
        config: config,
      );

  // ---------------- Proyección de nómina ----------------
  /// La raya ESPERADA de una semana. No es un comprobante de pago.
  ///
  /// Va sin bloque de firmas a propósito: una hoja con líneas para firmar invita
  /// a usarse como recibo, y esto todavía no ocurre.
  static Future<Uint8List> proyeccionNomina({
    required String alcance,
    required String rango,
    required ProyeccionResultado resultado,
    Map<String, String> nombreCuadrilla = const {},
    PdfConfig config = const PdfConfig(),
  }) =>
      generarProyeccionNomina(
        alcance: alcance,
        rango: rango,
        resultado: resultado,
        nombreCuadrilla: nombreCuadrilla,
        config: config,
      );

  // ---------------- Presupuesto ----------------
  static Future<Uint8List> presupuesto({
    required Cotizacion cot,
    required List<Seccion> secciones,
    required List<Partida> partidas,
    required PresupuestoTotales totales,
    required bool iva,
    Map<String, double> aportadoPorPartida = const {},
    PdfConfig config = const PdfConfig(),
    /// Texto general de la empresa por tipo (`empresa_config.pdf_textos`).
    /// Lo comparten web y móvil; vacío = se imprime el integrado.
    Map<TipoDocumento, String> textosEmpresa = const {},
  }) =>
      generarPresupuesto(
        cot: cot,
        secciones: secciones,
        partidas: partidas,
        totales: totales,
        iva: iva,
        aportadoPorPartida: aportadoPorPartida,
        config: config,
        textosEmpresa: textosEmpresa,
      );

  // ---------------- Nota de obra (trato con un socio) ----------------

  /// La cuenta de un trato de palabra, para mandarla por WhatsApp a alguien que
  /// no tiene acceso al sistema.
  ///
  /// Imita a propósito la tabla de dos columnas que el dueño hacía en Word —que
  /// es lo que sus socios ya saben leer— pero con el encabezado y los totales
  /// del resto de los documentos. Gemelo de `documento-nota-html.ts`.
  static Future<Uint8List> notaObra({
    required NotaConRenglones nota,
    required String obraNombre,
    PdfConfig config = const PdfConfig(),
    Map<TipoDocumento, String> textosEmpresa = const {},
  }) =>
      generarNotaObra(
        nota: nota,
        obraNombre: obraNombre,
        config: config,
        textosEmpresa: textosEmpresa,
      );

  // ---------------- Flujo de caja ----------------
  static Future<Uint8List> flujoCaja({
    required String obraNombre,
    required List<Movimiento> movimientos,
    required ResumenCaja resumen,
    PdfConfig config = const PdfConfig(),
  }) =>
      generarFlujoCaja(
        obraNombre: obraNombre,
        movimientos: movimientos,
        resumen: resumen,
        config: config,
      );

  // ---------------- Estado de cuenta del CLIENTE ----------------
  //
  // Documento que la oficina manda AL CLIENTE. A diferencia de `flujoCaja`,
  // NUNCA muestra salidas/gastos/nómina: solo el total del contrato, los pagos
  // recibidos (ENTRADAS) y el saldo por cobrar. Espeja el estado de cuenta del
  // cliente de la web (`documento-estado-cuenta-html.ts`).
  //
  // POR QUÉ ES UN MÉTODO DEDICADO (no un flag "ocultar salidas" sobre
  // `flujoCaja`): este método NUNCA recibe la lista completa de movimientos. Su
  // firma solo admite totales escalares (ya calculados) y una lista de renglones
  // de pago que ni siquiera tiene campo `tipo`. Así, por construcción, es
  // imposible que un cambio futuro filtre un gasto al cliente: no hay ningún dato
  // de salida que este método pueda pintar aunque quisiera. El caller es quien
  // filtra `tipo == 'ENTRADA'` antes de armar la lista.
  static Future<Uint8List> estadoCuentaCliente({
    required String obraNombre,
    required String cliente,
    required double costoTotal,
    required double recibido,
    required double pendiente,
    // Solo ENTRADAS, ya filtradas por el caller. El record no tiene `tipo`
    // adrede: todo lo que llegue aquí SE PINTA como pago recibido.
    required List<({int fecha, String concepto, double monto})> pagos,
    PdfConfig config = const PdfConfig(),

    /// El párrafo propio de ESTA obra (`obras.texto_final`). Cuelga de la obra
    /// y no de un documento porque el estado de cuenta se emite por obra.
    String? textoFinalObra,

    /// Texto general de la empresa por tipo (`empresa_config.pdf_textos`).
    Map<TipoDocumento, String> textosEmpresa = const {},
  }) =>
      generarEstadoCuentaCliente(
        obraNombre: obraNombre,
        cliente: cliente,
        costoTotal: costoTotal,
        recibido: recibido,
        pendiente: pendiente,
        pagos: pagos,
        config: config,
        textoFinalObra: textoFinalObra,
        textosEmpresa: textosEmpresa,
      );

  // ---------------- Reporte GLOBAL de nómina ----------------
  static Future<Uint8List> nominaGlobal({
    required List<({String obra, NominaSummary summary})> datos,
    required String rango,
    PdfConfig config = const PdfConfig(),
  }) =>
      generarNominaGlobal(datos: datos, rango: rango, config: config);

  // ---------------- Reporte GLOBAL de presupuestos ----------------
  static Future<Uint8List> presupuestosGlobal({
    required List<({String proyecto, String cliente, PresupuestoTotales totales})> datos,
    PdfConfig config = const PdfConfig(),
  }) =>
      generarPresupuestosGlobal(datos: datos, config: config);

  // ---------------- Reporte GLOBAL de asistencias ----------------
  static Future<Uint8List> asistenciasGlobal({
    required List<({String obra, List<({String trabajador, double dias})> filas})> datos,
    required String rango,
    PdfConfig config = const PdfConfig(),
  }) =>
      generarAsistenciasGlobal(datos: datos, rango: rango, config: config);

  // ---------------- Reporte GLOBAL de flujo de caja ----------------
  static Future<Uint8List> flujoCajaGlobal({
    required List<({String obra, ResumenCaja resumen})> porObra,
    required ResumenCaja global,
    PdfConfig config = const PdfConfig(),
  }) =>
      generarFlujoCajaGlobal(porObra: porObra, global: global, config: config);
}
