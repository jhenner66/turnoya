/* ==================================================================
 * [ETIQUETA: SCRIPT DE MIGRACIÓN LOCAL -> NUBE (TURSO)]
 * Qué hace: Copia las tablas de la base local `data/tienda.db` a Turso
 * usando las credenciales de `.env.local` o variables de entorno.
 * Uso: node scripts/migrar-a-nube.js
 * ================================================================== */

const fs = require('node:fs');
const path = require('node:path');

function cargarEnvLocal() {
  const archivo = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const partes = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(limpia);
    if (!partes) continue;
    let valor = partes[2].trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!process.env[partes[1]]) process.env[partes[1]] = valor;
  }
}

cargarEnvLocal();

const urlRemota = (process.env.TURSO_DATABASE_URL || '').trim();
const tokenRemoto = (process.env.TURSO_AUTH_TOKEN || '').trim();

if (!urlRemota) {
  console.error(
    'Falta TURSO_DATABASE_URL. Ejecuta `vercel env pull` o define la variable.'
  );
  process.exit(1);
}

const { createClient } = require('@libsql/client');

const local = createClient({
  url: `file:${path.join(__dirname, '..', 'data', 'tienda.db')}`
});
const nube = createClient({ url: urlRemota, authToken: tokenRemoto || undefined });

const TABLAS = ['colaboradores', 'turnos', 'configuracion'];
const imprimir = (linea = '') => process.stdout.write(`${linea}\n`);

async function main() {
  imprimir('Origen : data/tienda.db');
  imprimir(`Destino: ${urlRemota.split('?')[0]}`);

  const resumen = {};

  for (const tabla of TABLAS) {
    const filas = (await local.execute(`SELECT * FROM "${tabla}"`)).rows;
    resumen[tabla] = filas.length;

    if (!filas.length) {
      imprimir(`  ${tabla}: sin datos, se omite.`);
      continue;
    }

    const columnas = Object.keys(filas[0]);
    const sentencias = [{ sql: `DELETE FROM "${tabla}"`, args: [] }];

    for (const fila of filas) {
      sentencias.push({
        sql: `INSERT INTO "${tabla}" (${columnas
          .map((c) => `"${c}"`)
          .join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
        args: columnas.map((c) => fila[c])
      });
    }

    await nube.batch(sentencias, 'write');
    imprimir(`  ${tabla}: ${filas.length} fila(s) copiadas.`);
  }

  // Comprobación rápida.
  for (const tabla of TABLAS) {
    const total = await nube.execute(`SELECT COUNT(*) AS n FROM "${tabla}"`);
    const n = Number(total.rows[0].n);
    if (n !== resumen[tabla]) {
      throw new Error(
        `La tabla ${tabla} quedó con ${n} filas, se esperaban ${resumen[tabla]}.`
      );
    }
  }

  imprimir('\nMigración completada y verificada.');
  imprimir('Respaldo SQL de la base anterior: usa /api/respaldo en local si lo necesitas.');
}

main()
  .catch((error) => {
    console.error('\nError en la migración:', error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    local.close();
    nube.close();
  });
