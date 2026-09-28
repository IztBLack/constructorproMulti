#!/usr/bin/env node
// Escribe a un archivo el SQL de los DATOS DEMO de seis meses para una empresa.
//
//   node scripts/demo-seis-meses.mjs --user-id <uuid> --empresa-id <uuid> --out <archivo.sql>
//        [--hoy 2026-09-27] [--semilla valle-del-norte] [--sin-transaccion]
//
// No llama a ninguna API ni se conecta a ninguna base: solo arma el texto.
// Cargarlo en Supabase es un paso aparte (ver src/db/seed/README.md).
//
// Importa el generador en TypeScript directamente: Node 22.18+/23.6+ quita los
// tipos solo. En Node más viejo: `node --experimental-strip-types …`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'user-id': { type: 'string' },
    'empresa-id': { type: 'string' },
    out: { type: 'string' },
    hoy: { type: 'string' },
    semilla: { type: 'string' },
    'sin-transaccion': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
});

const USO =
  'Uso: node scripts/demo-seis-meses.mjs --user-id <uuid> --empresa-id <uuid> --out <archivo.sql> [--hoy YYYY-MM-DD] [--semilla texto] [--sin-transaccion]';

if (values.help) {
  console.log(USO);
  process.exit(0);
}
if (!values['user-id'] || !values['empresa-id'] || !values.out) {
  console.error(USO);
  process.exit(2);
}

// `web/package.json` no declara "type": "module" (Next no lo necesita); Node
// avisa que reinterpreta el .ts como módulo ES. Es inofensivo: se calla solo ese aviso.
const avisoOriginal = process.emitWarning;
process.emitWarning = (aviso, ...resto) => {
  const codigo = typeof resto[0] === 'object' ? resto[0]?.code : resto[1];
  if (codigo === 'MODULE_TYPELESS_PACKAGE_JSON') return;
  return avisoOriginal.call(process, aviso, ...resto);
};

const { generarDemo } = await import(new URL('../src/db/seed/demo-seis-meses.ts', import.meta.url).href);

const demo = generarDemo({
  userId: values['user-id'],
  empresaId: values['empresa-id'],
  hoy: values.hoy,
  semilla: values.semilla,
  transaccion: !values['sin-transaccion'],
});

const destino = resolve(values.out);
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, demo.sql + '\n', 'utf8');

const bytes = Buffer.byteLength(demo.sql + '\n', 'utf8');
console.log(`SQL escrito en ${destino} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${bytes} bytes)`);
console.log(`Obra marca (si existe, el script no vuelve a sembrar): ${demo.resumen.marcaObraId}`);
for (const o of demo.resumen.obras) {
  console.log(`  ${o.clave} · ${o.nombre}: contratado $${o.contratado.toLocaleString('es-MX')}, avance ${o.avanceFisico} %, margen buscado ${o.margenBuscado} %`);
}
