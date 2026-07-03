/// Tipos TS del esquema Postgres relevantes para el panel de oficina (/admin).
/// Las fechas se guardan como bigint epoch ms.

export type EstadoCotizacion = 'BORRADOR' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'CONVERTIDA';
export type TipoPago = 'DIA' | 'DESTAJO';
export type TipoMovimiento = 'ENTRADA' | 'SALIDA';
export type Rol = 'admin' | 'oficina' | 'cliente' | string;

export interface Obra {
  id: string;
  empresa_id: string;
  nombre: string;
  cliente: string | null;
  cliente_id: string | null;
  ubicacion: string | null;
  fecha_inicio: number | null;
  activa: boolean;
  avance: number;
  cotizacion_origen_id: string | null;
  pdf_config_json: unknown | null;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

export interface Cotizacion {
  id: string;
  empresa_id: string;
  cliente: string;
  cliente_id: string | null;
  nombre_proyecto: string;
  ubicacion: string | null;
  fecha: number;
  estado: EstadoCotizacion;
  iva_enabled: boolean;
  descuento: number;
  notas: string | null;
  obra_id: string | null;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

export interface Seccion {
  id: string;
  empresa_id: string;
  cotizacion_id: string;
  nombre: string;
  orden: number;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

export interface Partida {
  id: string;
  empresa_id: string;
  seccion_id: string;
  clave: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  orden: number;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

export interface Puesto {
  id: string;
  empresa_id: string;
  nombre: string;
  salario_dia_default: number;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

export interface Colaborador {
  id: string;
  empresa_id: string;
  nombre: string;
  puesto_id: string | null;
  tipo_pago: TipoPago;
  telefono: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_parentesco: string | null;
  activo: boolean;
  salario_personalizado: number | null;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

/// Registro de asistencia (pase de lista, capturado en el móvil).
/// `fecha` es el día (epoch ms, medianoche local). `fraccion`: 0 | 0.5 | 0.75 | 1.0.
export interface Asistencia {
  id: string;
  empresa_id: string;
  colaborador_id: string;
  obra_id: string;
  fecha: number;
  fraccion: number;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

/// Pago por destajo (capturado en el móvil) de un colaborador en una obra.
export interface Destajo {
  id: string;
  empresa_id: string;
  colaborador_id: string;
  obra_id: string;
  fecha: number;
  concepto: string | null;
  monto: number;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

export interface Movimiento {
  id: string;
  empresa_id: string;
  obra_id: string;
  fecha: number;
  tipo: TipoMovimiento;
  categoria: string | null;
  concepto: string | null;
  monto: number;
  metodo_pago: string | null;
  referencia: string | null;
  cotizacion_id: string | null;
  partida_id: string | null;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

/// Cotización con sus secciones y partidas anidadas (para el detalle).
export interface CotizacionConDetalle extends Cotizacion {
  secciones: (Seccion & { partidas: Partida[] })[];
}

/// Relación histórica colaborador↔obra. PK compuesta (obra_id, colaborador_id).
/// fecha_salida = null mientras la asignación está activa.
export interface ObraColaborador {
  empresa_id: string;
  obra_id: string;
  colaborador_id: string;
  fecha_ingreso: number;
  fecha_salida: number | null;
  salario_dia_override: number | null;
}

/// Versión liviana de Obra para selectores (id + nombre).
export interface ObraResumen {
  id: string;
  nombre: string;
}

/// Asignación enriquecida con el nombre de la obra, para listas de detalle.
export interface AsignacionObraColaborador extends ObraColaborador {
  obra_nombre: string;
}

export interface Cliente {
  id: string;
  empresa_id: string;
  nombre: string;
  email: string;
  telefono: string;
  user_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface CatalogoConcepto {
  id: string;
  empresa_id: string;
  clave: string | null;
  descripcion: string;
  unidad: string | null;
  precio_unitario_default: number;
  categoria: string | null;
  es_personalizado: boolean;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}
