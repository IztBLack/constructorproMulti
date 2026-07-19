/// Especialidades de cuadrilla (código en BD → etiqueta visible). Módulo sin
/// dependencias de servidor para poder importarse desde componentes cliente.
export const ESPECIALIDADES: { value: string; label: string }[] = [
  { value: 'ALBANILERIA', label: 'Albañilería' },
  { value: 'ACERO', label: 'Acero / fierro' },
  { value: 'CIMBRA', label: 'Cimbra / carpintería' },
  { value: 'INSTALACIONES', label: 'Instalaciones' },
  { value: 'ACABADOS', label: 'Acabados' },
  { value: 'MIXTA', label: 'Mixta' },
];

export const ESPECIALIDAD_LABEL: Record<string, string> = Object.fromEntries(
  ESPECIALIDADES.map((e) => [e.value, e.label]),
);
