const fs = require('node:fs');
const path = require('node:path');

/*
 * Capa de datos.
 *
 * - En local usa un archivo SQLite en `data/tienda.db` (libSQL embebido).
 * - En la nube usa Turso (libSQL remoto) cuando existe TURSO_DATABASE_URL.
 *   Así el mismo código funciona en la PC y en Vercel sin cambios.
 */

const urlRemota = (
  process.env.TURSO_DATABASE_URL ||
  process.env.DATABASE_URL ||
  ''
).trim();
const tokenRemoto = (
  process.env.TURSO_AUTH_TOKEN ||
  process.env.DATABASE_AUTH_TOKEN ||
  ''
).trim();

const esRemota = Boolean(urlRemota);

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');

let cliente;
if (esRemota) {
  // Cliente HTTP puro: no necesita binarios nativos en el servidor.
  const { createClient } = require('@libsql/client/web');
  cliente = createClient({
    url: urlRemota,
    authToken: tokenRemoto || undefined
  });
} else {
  fs.mkdirSync(dataDir, { recursive: true });
  const { createClient } = require('@libsql/client');
  cliente = createClient({
    url: `file:${path.join(dataDir, 'tienda.db')}`
  });
}

/* --------------------------- Consultas --------------------------- */

async function uno(sql, args = []) {
  const resultado = await cliente.execute({ sql, args });
  return resultado.rows[0] ?? null;
}

async function todos(sql, args = []) {
  const resultado = await cliente.execute({ sql, args });
  return resultado.rows;
}

async function ejecutar(sql, args = []) {
  const resultado = await cliente.execute({ sql, args });
  return {
    lastInsertRowid: Number(resultado.lastInsertRowid ?? 0),
    changes: Number(resultado.rowsAffected ?? 0)
  };
}

async function lote(sentencias) {
  return cliente.batch(sentencias, 'write');
}

/* ------------------------- Inicialización ------------------------ */

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    puesto TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    entrada TEXT NOT NULL,
    salida TEXT,
    pausa_inicio TEXT,
    pausa_minutos REAL NOT NULL DEFAULT 0,
    notas TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha)',
  'CREATE INDEX IF NOT EXISTS idx_turnos_colaborador ON turnos(colaborador_id)',
  'CREATE INDEX IF NOT EXISTS idx_turnos_abiertos ON turnos(salida)',
  `CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )`
];

const VALORES_POR_DEFECTO = {
  nombre_tienda: 'Mi Tienda',
  jornada_horas: '8'
};

let preparado = null;

function preparar() {
  if (!preparado) preparado = inicializar();
  return preparado;
}

async function inicializar() {
  if (!esRemota) {
    await cliente.execute('PRAGMA journal_mode = WAL');
    await cliente.execute('PRAGMA foreign_keys = ON');
  }

  await cliente.batch(ESQUEMA, 'write');

  for (const [clave, valor] of Object.entries(VALORES_POR_DEFECTO)) {
    await cliente.execute({
      sql: 'INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)',
      args: [clave, valor]
    });
  }
}

async function cerrar() {
  try {
    cliente.close();
  } catch (error) {
    /* la conexión ya estaba cerrada */
  }
}

module.exports = {
  cliente,
  dataDir,
  esRemota,
  uno,
  todos,
  ejecutar,
  lote,
  preparar,
  cerrar
};
