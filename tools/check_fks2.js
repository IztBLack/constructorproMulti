const fs = require('fs');
const data = JSON.parse(fs.readFileSync('d:\\Dev\\_EnDesarrollo\\constructorpro_flutter\\tools\\backup_temp_2\\data.json', 'utf-8'));

const getIds = (table) => new Set((data[table] || []).map(r => r.id));
const puestos = getIds('puestos');
const obras = getIds('obras');
const colabs = getIds('colaboradores');
const cots = getIds('cotizaciones');
const secs = getIds('secciones');
const parts = getIds('partidas');

const checkFk = (table, fkCol, refSet, isNullable) => {
  const bad = (data[table] || []).filter(r => {
    const val = r[fkCol];
    if (val == null || val === '') return !isNullable;
    return !refSet.has(val);
  });
  if (bad.length > 0) {
    console.log("Table " + table + " has " + bad.length + " rows with invalid " + fkCol);
  }
};

checkFk('colaboradores', 'puestoId', puestos, false);
checkFk('obraColaboradores', 'obraId', obras, false);
checkFk('obraColaboradores', 'colaboradorId', colabs, false);
checkFk('asistencias', 'colaboradorId', colabs, false);
checkFk('asistencias', 'obraId', obras, false);
checkFk('destajos', 'colaboradorId', colabs, false);
checkFk('destajos', 'obraId', obras, false);
checkFk('cotizaciones', 'obraId', obras, true);
checkFk('archivosCotizacion', 'cotizacionId', cots, false);
checkFk('secciones', 'cotizacionId', cots, false);
checkFk('partidas', 'seccionId', secs, false);
checkFk('pagos', 'cotizacionId', cots, false);
checkFk('movimientos', 'obraId', obras, false);
checkFk('movimientos', 'cotizacionId', cots, true);
checkFk('movimientos', 'seccionId', secs, true);
checkFk('movimientos', 'partidaId', parts, true);
console.log('FK check complete.');
