/* ==================================================================
 * [ETIQUETA: CAPA DE DATOS HÍBRIDA (SQLite LOCAL / TURSO NUBE)]
 * Qué hace: Conecta con el archivo local `data/tienda.db` en modo PC
 * o con la base remota Turso (HTTP) cuando existen variables de nube.
 * ================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// [ETIQUETA: DETECCIÓN DE MODO LOCAL O NUBE]
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

// [ETIQUETA: INSTANCIA DEL CLIENTE LIBSQL]
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

/* ==================================================================
 * [ETIQUETA: HELPERS DE CONSULTAS SQL]
 * Qué hace: Simplifica consultas parametrizadas (uno, todos, ejecutar, lote).
 * ================================================================== */

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

/* ==================================================================
 * [ETIQUETA: ESQUEMA DE BASE DE DATOS E INICIALIZACIÓN]
 * Qué hace: Crea las tablas (colaboradores, turnos, configuracion),
 * sus índices de búsqueda y los valores iniciales por defecto.
 * ================================================================== */

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    puesto TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    tarifa_hora REAL DEFAULT NULL,
    pin_hash TEXT DEFAULT NULL,
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
  jornada_horas: '8',
  moneda: 'S/',
  tarifa_hora_defecto: '0'
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

  // Migración segura para bases de datos ya existentes sin columnas tarifa_hora o pin_hash.
  const columnasColab = await cliente.execute('PRAGMA table_info(colaboradores)');
  const nombresCols = new Set(columnasColab.rows.map((c) => c.name));
  if (!nombresCols.has('tarifa_hora')) {
    await cliente.execute('ALTER TABLE colaboradores ADD COLUMN tarifa_hora REAL DEFAULT NULL');
  }
  if (!nombresCols.has('pin_hash')) {
    await cliente.execute('ALTER TABLE colaboradores ADD COLUMN pin_hash TEXT DEFAULT NULL');
  }

  for (const [clave, valor] of Object.entries(VALORES_POR_DEFECTO)) {
    await cliente.execute({
      sql: 'INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)',
      args: [clave, valor]
    });
  }

  // Secreto persistente para firmar sesiones HMAC (compatible con Vercel serverless).
  const secretoInicial =
    (process.env.TURNOYA_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
  await cliente.execute({
    sql: 'INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)',
    args: ['auth_secreto', secretoInicial]
  });
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
