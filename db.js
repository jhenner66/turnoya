const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'tienda.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    puesto TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    entrada TEXT NOT NULL,
    salida TEXT,
    pausa_inicio TEXT,
    pausa_minutos REAL NOT NULL DEFAULT 0,
    notas TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);
  CREATE INDEX IF NOT EXISTS idx_turnos_colaborador ON turnos(colaborador_id);
  CREATE INDEX IF NOT EXISTS idx_turnos_abiertos ON turnos(salida);

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

const valoresPorDefecto = {
  nombre_tienda: 'Mi Tienda',
  jornada_horas: '8'
};

const insertarConfig = db.prepare(
  'INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)'
);
for (const [clave, valor] of Object.entries(valoresPorDefecto)) {
  insertarConfig.run(clave, valor);
}

module.exports = { db, dataDir };
