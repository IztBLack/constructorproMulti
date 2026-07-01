// Script para corregir IDs legacy (enteros) a UUIDs en un backup JSON.
// Uso: node fix_backup.js ruta/al/backup.json
// Salida: backup_fixed.json en el mismo directorio.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- UUID v4 generator (sin dependencias) ---
function uuidv4() {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(val) {
  if (val == null || val === '') return true;
  return UUID_RE.test(String(val));
}

// --- Remapeo ---
const remap = {}; // oldId → newUuid

function fix(oldId) {
  if (oldId == null || oldId === '') return oldId ?? '';
  const s = String(oldId);
  if (UUID_RE.test(s)) return s; // ya es UUID
  if (!remap[s]) remap[s] = uuidv4();
  return remap[s];
}

function fixNullable(oldId) {
  if (oldId == null || oldId === '') return oldId;
  const s = String(oldId);
  if (UUID_RE.test(s)) return s;
  if (!remap[s]) remap[s] = uuidv4();
  return remap[s];
}

function safeList(root, key) {
  return Array.isArray(root[key]) ? root[key] : [];
}

// --- Main ---
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node fix_backup.js ruta/al/backup.json');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf-8');
const root = JSON.parse(raw);

// Fase 1: Registrar todos los PKs
for (const key of [
  'puestos', 'obras', 'colaboradores', 'cotizaciones',
  'secciones', 'partidas', 'pagos', 'asistencias',
  'destajos', 'movimientos', 'catalogosConceptos', 'archivosCotizacion',
]) {
  for (const m of safeList(root, key)) {
    if (m.id != null) fix(m.id);
  }
}

// Fase 2: Aplicar remap
for (const m of safeList(root, 'puestos')) {
  m.id = fix(m.id);
}
for (const m of safeList(root, 'obras')) {
  m.id = fix(m.id);
  m.cotizacionOrigenId = fixNullable(m.cotizacionOrigenId);
}
for (const m of safeList(root, 'colaboradores')) {
  m.id = fix(m.id);
  m.puestoId = fix(m.puestoId);
}
for (const m of safeList(root, 'obraColaboradores')) {
  m.obraId = fix(m.obraId);
  m.colaboradorId = fix(m.colaboradorId);
}
for (const m of safeList(root, 'asistencias')) {
  m.id = fix(m.id);
  m.colaboradorId = fix(m.colaboradorId);
  m.obraId = fix(m.obraId);
}
for (const m of safeList(root, 'destajos')) {
  m.id = fix(m.id);
  m.colaboradorId = fix(m.colaboradorId);
  m.obraId = fix(m.obraId);
}
for (const m of safeList(root, 'cotizaciones')) {
  m.id = fix(m.id);
  m.obraId = fixNullable(m.obraId);
}
for (const m of safeList(root, 'archivosCotizacion')) {
  m.id = fix(m.id);
  m.cotizacionId = fix(m.cotizacionId);
}
for (const m of safeList(root, 'secciones')) {
  m.id = fix(m.id);
  m.cotizacionId = fix(m.cotizacionId);
}
for (const m of safeList(root, 'partidas')) {
  m.id = fix(m.id);
  m.seccionId = fix(m.seccionId);
}
for (const m of safeList(root, 'pagos')) {
  m.id = fix(m.id);
  m.cotizacionId = fix(m.cotizacionId);
}
for (const m of safeList(root, 'movimientos')) {
  m.id = fix(m.id);
  m.obraId = fix(m.obraId);
  m.nominaId = fixNullable(m.nominaId);
  m.cotizacionId = fixNullable(m.cotizacionId);
  m.seccionId = fixNullable(m.seccionId);
  m.partidaId = fixNullable(m.partidaId);
}
for (const m of safeList(root, 'catalogosConceptos')) {
  m.id = fix(m.id);
}

// --- Salida ---
const dir = path.dirname(inputPath);
const outPath = path.join(dir, 'backup_fixed.json');
fs.writeFileSync(outPath, JSON.stringify(root, null, 2), 'utf-8');

// Resumen
const remapped = Object.keys(remap).length;
console.log(`\n✅ Backup corregido guardado en: ${outPath}`);
console.log(`   IDs remapeados: ${remapped}`);
console.log('\nMapa de remapeo (old → new):');
for (const [old, nuevo] of Object.entries(remap).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`   "${old}" → ${nuevo}`);
}
