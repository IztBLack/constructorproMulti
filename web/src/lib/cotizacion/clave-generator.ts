/**
 * Genera claves de partida (ej. MUR-001) a partir de la descripción, usando un
 * diccionario palabra-clave → prefijo. Port 1:1 del móvil
 * (`lib/domain/clave_generator.dart`) para que web y móvil generen la misma clave.
 */

// Frases compuestas primero (se evalúan por longitud descendente). El ORDEN de
// inserción importa para los empates de longitud (igual que el móvil).
const DICCIONARIO: Record<string, string> = {
  'mano de obra': 'MO',
  impermeabilizante: 'IMP',
  electrosoldada: 'IE',
  trazo: 'PRE', nivelacion: 'PRE', despalme: 'PRE',
  excavacion: 'EXC', acarreo: 'ACA', relleno: 'REL',
  compactacion: 'COM', afine: 'AFI', retiro: 'RET',
  demolicion: 'DEM', limpieza: 'LIM', carga: 'CAR',
  plantilla: 'PLA', zapata: 'ZAP', contratrabe: 'CTR',
  cimentacion: 'CIM', membrana: 'MEM', polietileno: 'MEM',
  refuerzo: 'REF',
  losa: 'LOSA', nervadura: 'NER', caset: 'LOSA', reticular: 'LOSA',
  muro: 'MUR', block: 'MUR', tabique: 'MUR', novablock: 'MUR',
  firme: 'FIR', dentellon: 'DEN', desplante: 'DES',
  aplanado: 'APL', emboquillado: 'EMB', enjarre: 'ENJ',
  fino: 'FIN', chaflan: 'CHA', azotea: 'AZ', pretil: 'AZ',
  tinaco: 'TIN', cisterna: 'CIS', alberca: 'ALB', barda: 'BAR',
  castillo: 'CAS', columna: 'COL', dala: 'DAL', trabe: 'TRA', viga: 'VIG',
  plafon: 'PLF', tablaroca: 'TAB', durock: 'DUR', pintura: 'PIN',
  alisado: 'ALI', estuco: 'EST', ceramica: 'CER', porcelanato: 'POR',
  piso: 'PIS', loseta: 'LOS', zocalo: 'ZOC', azulejo: 'AZU',
  recubrimiento: 'REC',
  electrica: 'IE', electrico: 'IE', luminaria: 'IE', contacto: 'IE',
  cableado: 'IE', cable: 'IE', tablero: 'IE', interruptor: 'IE',
  circuito: 'IE', canalizacion: 'IE',
  sanitaria: 'IS', hidraulica: 'IS', tuberia: 'IS', drenaje: 'IS',
  registro: 'REG', pozo: 'POZ', inodoro: 'IS', lavabo: 'IS',
  regadera: 'IS', wc: 'IS',
  escalera: 'ESC', forjado: 'ESC', rampa: 'RAM',
  canceleria: 'CAN', cancel: 'CAN', vidrio: 'VID',
  puerta: 'PTA', ventana: 'VEN', madera: 'MAD', mueble: 'MUE',
  carpinteria: 'CAR',
  herreria: 'HER', acero: 'ACE', soldadura: 'SOL', perfil: 'PER',
  lamina: 'LAM', fierro: 'FIE',
  'aire acondicionado': 'AC', minisplit: 'AC', ducto: 'AC',
  jardinera: 'JAR', andador: 'AND', estacionamiento: 'EST',
  suministro: 'SUM', fabricacion: 'FAB', instalacion: 'INST',
  colocacion: 'COLOC', construccion: 'CONS', habilitado: 'HAB',
  vaciado: 'VAC', cimbrado: 'CIM', armado: 'ARM', vibrado: 'VIB',
  bombeado: 'BOM', impermeabilizar: 'IMP',
};

function sinAcentos(s: string): string {
  const from = 'áéíóúüñ';
  const to = 'aeiouun';
  let r = s.toLowerCase();
  for (let i = 0; i < from.length; i++) {
    r = r.split(from[i]).join(to[i]);
  }
  return r;
}

/** Genera la clave para `descripcion` evitando colisiones con `clavesExistentes`. */
export function generarClave(descripcion: string, clavesExistentes: string[]): string {
  const desc = sinAcentos(descripcion);
  // Prefijo: claves del diccionario por longitud descendente (empates: orden de inserción).
  const keys = Object.keys(DICCIONARIO).sort((a, b) => b.length - a.length);
  let prefijo = 'GEN';
  for (const k of keys) {
    if (desc.includes(k)) {
      prefijo = DICCIONARIO[k];
      break;
    }
  }
  // Siguiente número para ese prefijo.
  let maxNum = 0;
  const re = new RegExp('^' + prefijo + '-(\\d+)$');
  for (const c of clavesExistentes) {
    const m = re.exec(c.trim().toUpperCase());
    if (m) {
      const n = parseInt(m[1], 10) || 0;
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefijo}-${String(maxNum + 1).padStart(3, '0')}`;
}
