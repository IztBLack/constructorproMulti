const fs = require('fs');
const data = JSON.parse(fs.readFileSync('d:\\Dev\\_EnDesarrollo\\constructorpro_flutter\\tools\\backup_temp_2\\data.json', 'utf-8'));
const puestosIds = new Set((data.puestos || []).map(p => p.id));
console.log('Puestos IDs:', Array.from(puestosIds));
const colabsBadPuesto = (data.colaboradores || []).filter(c => !puestosIds.has(c.puestoId));
console.log('Colaboradores with invalid puestoId:', colabsBadPuesto.length);
if (colabsBadPuesto.length > 0) {
  console.log(colabsBadPuesto.map(c => c.nombre + ' -> ' + c.puestoId));
}
