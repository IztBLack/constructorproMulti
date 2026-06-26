import '../../core/db/app_database.dart';
import '../../data/repositories.dart';
import '../../data/repositories_obra.dart';

/// Orquesta el "mover" de un colaborador a otra obra desde el pase de lista.
///
/// Reasignación NO destructiva: la obra destino pasa a ser su última obra
/// asignada (vía [ColaboradorRepository.asignarObra], que fija fechaIngreso=now)
/// y la asistencia del día se registra en destino. NO se desvincula de la obra
/// anterior: se conserva el historial. Ambos efectos van en una transacción
/// para no dejar una reasignación a medias si falla el registro de asistencia.
class MovimientoColaboradorService {
  final ColaboradorRepository colaboradores;
  final AsistenciaRepository asistencias;
  final AppDatabase db;

  MovimientoColaboradorService(this.colaboradores, this.asistencias, this.db);

  Future<void> moverAObra({
    required String obraDestinoId,
    required String colaboradorId,
    double? salarioDiaOverride,
    required int fechaHoy,
    double fraccionHoy = 1.0,
  }) =>
      db.transaction(() async {
        await colaboradores.asignarObra(
          obraId: obraDestinoId,
          colaboradorId: colaboradorId,
          salarioDiaOverride: salarioDiaOverride,
        );
        await asistencias.setFraccion(
          obraId: obraDestinoId,
          colaboradorId: colaboradorId,
          fecha: fechaHoy,
          fraccion: fraccionHoy,
        );
      });
}
