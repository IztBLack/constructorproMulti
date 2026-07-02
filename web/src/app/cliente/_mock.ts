// MOCK - reemplazar por queries reales en la fase de backend.
// Todos los datos de este archivo son ficticios y solo se usan para validar
// la estructura y la vista del portal del cliente antes de conectar Supabase.

export type EstadoCotizacionCliente = 'Enviada' | 'Aceptada' | 'Rechazada';
export type EstadoObraCliente = 'En progreso' | 'Pausada' | 'Completada';

// ─── Tipos del portal cliente ────────────────────────────────────────────────

export interface ClienteMock {
  id: string;
  nombre: string;
  email: string;
  empresa_constructora: string;
}

export interface PagoClienteMock {
  id: string;
  fecha: number; // epoch ms
  concepto: string;
  monto: number;
  metodo: string;
  referencia: string | null;
}

export interface ObraClienteMock {
  id: string;
  nombre: string;
  ubicacion: string;
  fecha_inicio: number; // epoch ms
  estado: EstadoObraCliente;
  avance_pct: number; // 0–100
  presupuesto_total: number;
  pagado: number;
  pagos: PagoClienteMock[];
}

export interface PartidaMock {
  id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
}

export interface SeccionMock {
  id: string;
  nombre: string;
  partidas: PartidaMock[];
}

export interface CotizacionClienteMock {
  id: string;
  nombre_proyecto: string;
  ubicacion: string;
  fecha: number; // epoch ms
  estado: EstadoCotizacionCliente;
  descuento: number; // porcentaje 0–100
  iva_enabled: boolean;
  notas: string | null;
  secciones: SeccionMock[];
}

// ─── Datos mock ──────────────────────────────────────────────────────────────

export const MOCK_CLIENTE: ClienteMock = {
  id: 'cli-001',
  nombre: 'Roberto Garza Morales',
  email: 'rgarza@ejemplo.com',
  empresa_constructora: 'ConstructorPro',
};

export const MOCK_OBRAS: ObraClienteMock[] = [
  {
    id: 'obra-001',
    nombre: 'Remodelación Casa Garza',
    ubicacion: 'Monterrey, N.L.',
    fecha_inicio: new Date('2026-02-10').getTime(),
    estado: 'En progreso',
    avance_pct: 62,
    presupuesto_total: 1_850_000,
    pagado: 1_110_000,
    pagos: [
      {
        id: 'pago-001',
        fecha: new Date('2026-02-15').getTime(),
        concepto: 'Anticipo inicial',
        monto: 370_000,
        metodo: 'Transferencia',
        referencia: 'TRF-20260215-001',
      },
      {
        id: 'pago-002',
        fecha: new Date('2026-03-20').getTime(),
        concepto: 'Estimación 1 — Estructura',
        monto: 370_000,
        metodo: 'Transferencia',
        referencia: 'TRF-20260320-002',
      },
      {
        id: 'pago-003',
        fecha: new Date('2026-04-28').getTime(),
        concepto: 'Estimación 2 — Instalaciones',
        monto: 370_000,
        metodo: 'Cheque',
        referencia: null,
      },
    ],
  },
  {
    id: 'obra-002',
    nombre: 'Ampliación Bodega Garza',
    ubicacion: 'San Pedro Garza García, N.L.',
    fecha_inicio: new Date('2026-05-01').getTime(),
    estado: 'En progreso',
    avance_pct: 18,
    presupuesto_total: 620_000,
    pagado: 186_000,
    pagos: [
      {
        id: 'pago-004',
        fecha: new Date('2026-05-05').getTime(),
        concepto: 'Anticipo inicial',
        monto: 186_000,
        metodo: 'Transferencia',
        referencia: 'TRF-20260505-004',
      },
    ],
  },
];

export const MOCK_COTIZACIONES: CotizacionClienteMock[] = [
  {
    id: 'cot-001',
    nombre_proyecto: 'Remodelación Casa Garza',
    ubicacion: 'Monterrey, N.L.',
    fecha: new Date('2026-01-28').getTime(),
    estado: 'Aceptada',
    descuento: 5,
    iva_enabled: true,
    notas: 'Incluye materiales y mano de obra. Los acabados premium se cotizan por separado.',
    secciones: [
      {
        id: 'sec-001',
        nombre: 'Demolición y limpieza',
        partidas: [
          {
            id: 'par-001',
            descripcion: 'Demolición de muros interiores',
            unidad: 'm²',
            cantidad: 85,
            precio_unitario: 380,
          },
          {
            id: 'par-002',
            descripcion: 'Retiro y disposición de escombro',
            unidad: 'viaje',
            cantidad: 4,
            precio_unitario: 2_800,
          },
          {
            id: 'par-003',
            descripcion: 'Limpieza general de obra',
            unidad: 'global',
            cantidad: 1,
            precio_unitario: 4_500,
          },
        ],
      },
      {
        id: 'sec-002',
        nombre: 'Estructura y albañilería',
        partidas: [
          {
            id: 'par-004',
            descripcion: 'Construcción de muros de tabique rojo',
            unidad: 'm²',
            cantidad: 120,
            precio_unitario: 950,
          },
          {
            id: 'par-005',
            descripcion: 'Castillos de concreto armado',
            unidad: 'ml',
            cantidad: 48,
            precio_unitario: 1_200,
          },
          {
            id: 'par-006',
            descripcion: 'Losa de concreto maciza e=10cm',
            unidad: 'm²',
            cantidad: 65,
            precio_unitario: 1_850,
          },
        ],
      },
      {
        id: 'sec-003',
        nombre: 'Instalaciones hidráulicas y sanitarias',
        partidas: [
          {
            id: 'par-007',
            descripcion: 'Red de agua fría PVC 3/4"',
            unidad: 'ml',
            cantidad: 60,
            precio_unitario: 420,
          },
          {
            id: 'par-008',
            descripcion: 'Red de drenaje PVC 4"',
            unidad: 'ml',
            cantidad: 45,
            precio_unitario: 380,
          },
          {
            id: 'par-009',
            descripcion: 'Instalación de muebles sanitarios (3 baños)',
            unidad: 'pza',
            cantidad: 9,
            precio_unitario: 2_200,
          },
        ],
      },
      {
        id: 'sec-004',
        nombre: 'Acabados',
        partidas: [
          {
            id: 'par-010',
            descripcion: 'Aplanado yeso en muros y plafón',
            unidad: 'm²',
            cantidad: 340,
            precio_unitario: 320,
          },
          {
            id: 'par-011',
            descripcion: 'Piso porcelanato 60x60 (suministro e instalación)',
            unidad: 'm²',
            cantidad: 180,
            precio_unitario: 1_100,
          },
          {
            id: 'par-012',
            descripcion: 'Pintura vinílica 2 manos',
            unidad: 'm²',
            cantidad: 420,
            precio_unitario: 140,
          },
        ],
      },
    ],
  },
  {
    id: 'cot-002',
    nombre_proyecto: 'Ampliación Bodega Garza',
    ubicacion: 'San Pedro Garza García, N.L.',
    fecha: new Date('2026-04-10').getTime(),
    estado: 'Aceptada',
    descuento: 0,
    iva_enabled: true,
    notas: null,
    secciones: [
      {
        id: 'sec-005',
        nombre: 'Cimentación',
        partidas: [
          {
            id: 'par-013',
            descripcion: 'Zapatas aisladas de concreto armado',
            unidad: 'pza',
            cantidad: 8,
            precio_unitario: 8_500,
          },
          {
            id: 'par-014',
            descripcion: 'Dado de nivelación y plantilla de concreto',
            unidad: 'm²',
            cantidad: 200,
            precio_unitario: 480,
          },
        ],
      },
      {
        id: 'sec-006',
        nombre: 'Estructura metálica',
        partidas: [
          {
            id: 'par-015',
            descripcion: 'Columnas IPR 6" con placa de base',
            unidad: 'pza',
            cantidad: 8,
            precio_unitario: 12_400,
          },
          {
            id: 'par-016',
            descripcion: 'Vigas principales y secundarias',
            unidad: 'ton',
            cantidad: 3.2,
            precio_unitario: 58_000,
          },
          {
            id: 'par-017',
            descripcion: 'Cubierta panel sandwich e=50mm',
            unidad: 'm²',
            cantidad: 210,
            precio_unitario: 890,
          },
        ],
      },
    ],
  },
  {
    id: 'cot-003',
    nombre_proyecto: 'Bardeo perimetral Casa Garza',
    ubicacion: 'Monterrey, N.L.',
    fecha: new Date('2026-06-20').getTime(),
    estado: 'Enviada',
    descuento: 0,
    iva_enabled: true,
    notas: 'Cotización sujeta a revisión de niveles de terreno.',
    secciones: [
      {
        id: 'sec-007',
        nombre: 'Barda de block con remate',
        partidas: [
          {
            id: 'par-018',
            descripcion: 'Barda de block 15x20x40 h=2.50m',
            unidad: 'm²',
            cantidad: 95,
            precio_unitario: 1_150,
          },
          {
            id: 'par-019',
            descripcion: 'Remate de cantera gris (moldura)',
            unidad: 'ml',
            cantidad: 38,
            precio_unitario: 780,
          },
          {
            id: 'par-020',
            descripcion: 'Puerta peatonal herrería galvanizada',
            unidad: 'pza',
            cantidad: 1,
            precio_unitario: 9_800,
          },
          {
            id: 'par-021',
            descripcion: 'Portón vehicular corredizo herrería',
            unidad: 'pza',
            cantidad: 1,
            precio_unitario: 28_500,
          },
        ],
      },
    ],
  },
];
