// Zona horaria configurable: en Vercel `TZ` es un nombre reservado, por eso
// se usa TURNOYA_TZ (por ejemplo America/Caracas). Si no se define, se usa
// la zona horaria del sistema.
const ZONA_HORARIA = (
  process.env.TURNOYA_TZ ||
  process.env.TZ ||
  ''
).trim() || null;

if (process.env.TURNOYA_TZ) {
  process.env.TZ = process.env.TURNOYA_TZ;
}

const path = require('node:path');
const os = require('node:os');
const express = require('express');
const {
  dataDir,
  esRemota,
  uno,
  todos,
  ejecutar,
  lote,
  preparar,
  cerrar
} = require('./db');
const paquete = require('./package.json');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const VERSION = paquete.version || '1.0.0';

app.disable('x-powered-by');

// Cabeceras básicas de seguridad.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// La base de datos se prepara una sola vez (importante en modo servidor sin estado).
app.use('/api', async (req, res, next) => {
  try {
    await preparar();
    next();
  } catch (error) {
    next(error);
  }
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ruta = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

const pad = (n) => String(n).padStart(2, '0');

function aISOlocal(fecha = new Date()) {
  const opciones = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  if (ZONA_HORARIA) opciones.timeZone = ZONA_HORARIA;
  const partes = new Intl.DateTimeFormat('en-GB', opciones).formatToParts(fecha);
  const get = (tipo) => partes.find((p) => p.type === tipo).value;
  const hora = get('hour') === '24' ? '00' : get('hour');
  return (
    `${get('year')}-${get('month')}-${get('day')}` +
    `T${hora}:${get('minute')}:${get('second')}`
  );
}

function hoyISO() {
  return aISOlocal().slice(0, 10);
}

function redondear(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function leerFechaHora(valor) {
  if (!valor) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(valor).trim()
  );
  if (!m) return null;
  const fecha = new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0),
      0
    )
  );
  if (
    fecha.getUTCFullYear() !== Number(m[1]) ||
    fecha.getUTCMonth() !== Number(m[2]) - 1 ||
    fecha.getUTCDate() !== Number(m[3]) ||
    fecha.getUTCHours() !== Number(m[4]) ||
    fecha.getUTCMinutes() !== Number(m[5])
  ) {
    return null;
  }
  return fecha;
}

function normalizarFechaHora(valor, campo) {
  const texto = String(valor ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    texto
  );
  if (!m || !leerFechaHora(texto)) {
    throw new HttpError(400, `La ${campo} no es válida. Usa el formato AAAA-MM-DD HH:MM.`);
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`;
}

function minutosEntre(desdeISO, hastaISO) {
  const desde = leerFechaHora(desdeISO);
  const hasta = leerFechaHora(hastaISO);
  if (!desde || !hasta) return 0;
  return Math.max(0, (hasta - desde) / 60000);
}

async function leerConfig() {
  const filas = await todos('SELECT clave, valor FROM configuracion');
  const config = {};
  for (const fila of filas) config[fila.clave] = fila.valor;
  return config;
}

async function guardarConfig(clave, valor) {
  await ejecutar(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    [clave, String(valor)]
  );
}

async function umbralDiario() {
  const valor = Number((await leerConfig()).jornada_horas);
  return Number.isFinite(valor) && valor > 0 && valor <= 24 ? valor : 8;
}

function mapearColaborador(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    puesto: fila.puesto,
    email: fila.email,
    telefono: fila.telefono,
    activo: Boolean(fila.activo),
    creado_en: fila.creado_en
  };
}

function horasTurno(fila) {
  const entrada = leerFechaHora(fila.entrada);
  const salida = leerFechaHora(fila.salida);
  if (!entrada || !salida) return null;
  const horas = (salida - entrada) / 3600000 - Number(fila.pausa_minutos || 0) / 60;
  return redondear(Math.max(0, horas));
}

function mapearTurno(fila) {
  const abierto = !fila.salida;
  return {
    id: fila.id,
    colaborador_id: fila.colaborador_id,
    colaborador_nombre: fila.colaborador_nombre,
    colaborador_puesto: fila.colaborador_puesto,
    fecha: fila.fecha,
    entrada: fila.entrada,
    salida: fila.salida,
    pausa_inicio: fila.pausa_inicio,
    pausa_minutos: redondear(Number(fila.pausa_minutos || 0)),
    notas: fila.notas,
    horas: horasTurno(fila),
    activo: abierto,
    en_pausa: abierto && Boolean(fila.pausa_inicio)
  };
}

const SELECT_TURNOS = `
  SELECT t.*, c.nombre AS colaborador_nombre, c.puesto AS colaborador_puesto
  FROM turnos t
  JOIN colaboradores c ON c.id = t.colaborador_id
`;

async function obtenerTurno(id) {
  return uno(`${SELECT_TURNOS} WHERE t.id = ?`, [Number(id)]);
}

async function exigirColaborador(id) {
  const colaborador = await uno('SELECT * FROM colaboradores WHERE id = ?', [
    Number(id)
  ]);
  if (!colaborador) throw new HttpError(404, 'El colaborador no existe.');
  return colaborador;
}

async function buscarSolape(colaboradorId, entradaISO, salidaISO, excluirId = null) {
  const filas = await todos(
    'SELECT id, entrada, salida FROM turnos WHERE colaborador_id = ? AND id != ?',
    [Number(colaboradorId), Number(excluirId) || -1]
  );

  const inicio = leerFechaHora(entradaISO);
  const fin = salidaISO ? leerFechaHora(salidaISO) : null;

  for (const fila of filas) {
    const inicioExistente = leerFechaHora(fila.entrada);
    const finExistente = fila.salida ? leerFechaHora(fila.salida) : null;
    if (
      inicioExistente < (fin || new Date(8640000000000000)) &&
      (!finExistente || finExistente > inicio)
    ) {
      return fila.id;
    }
  }
  return null;
}

function texto(valor, maximo = 120) {
  return String(valor ?? '').trim().slice(0, maximo);
}

function numeroNoNegativo(valor, campo, maximo = 1440) {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > maximo) {
    throw new HttpError(400, `${campo} debe ser un número entre 0 y ${maximo}.`);
  }
  return n;
}

function leerFechaISO(valor, campo) {
  const fecha = texto(valor, 10);
  if (!fecha) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !leerFechaHora(`${fecha}T00:00`)) {
    throw new HttpError(400, `La fecha ${campo} no es válida. Usa el formato AAAA-MM-DD.`);
  }
  return fecha;
}

function leerRango(req) {
  const desde = leerFechaISO(req.query.desde, 'inicial');
  const hasta = leerFechaISO(req.query.hasta, 'final');
  if (desde && hasta && desde > hasta) {
    throw new HttpError(
      400,
      'La fecha inicial no puede ser posterior a la fecha final.'
    );
  }
  return { desde, hasta };
}

/* ------------------------------------------------------------------ */
/* Colaboradores                                                       */
/* ------------------------------------------------------------------ */

app.get(
  '/api/colaboradores',
  ruta(async (req, res) => {
    const filas = await todos(
      'SELECT * FROM colaboradores ORDER BY activo DESC, nombre COLLATE NOCASE ASC'
    );
    res.json(filas.map(mapearColaborador));
  })
);

app.post(
  '/api/colaboradores',
  ruta(async (req, res) => {
    const nombre = texto(req.body.nombre, 80);
    if (!nombre) throw new HttpError(400, 'El nombre es obligatorio.');

    const info = await ejecutar(
      `INSERT INTO colaboradores (nombre, puesto, email, telefono, activo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        texto(req.body.puesto, 80),
        texto(req.body.email, 120),
        texto(req.body.telefono, 40),
        req.body.activo === false ? 0 : 1,
        aISOlocal()
      ]
    );

    const fila = await uno('SELECT * FROM colaboradores WHERE id = ?', [
      info.lastInsertRowid
    ]);
    res.status(201).json(mapearColaborador(fila));
  })
);

app.put(
  '/api/colaboradores/:id',
  ruta(async (req, res) => {
    const id = Number(req.params.id);
    await exigirColaborador(id);

    const nombre = texto(req.body.nombre, 80);
    if (!nombre) throw new HttpError(400, 'El nombre es obligatorio.');

    await ejecutar(
      `UPDATE colaboradores
       SET nombre = ?, puesto = ?, email = ?, telefono = ?, activo = ?
       WHERE id = ?`,
      [
        nombre,
        texto(req.body.puesto, 80),
        texto(req.body.email, 120),
        texto(req.body.telefono, 40),
        req.body.activo === false ? 0 : 1,
        id
      ]
    );

    const fila = await uno('SELECT * FROM colaboradores WHERE id = ?', [id]);
    res.json(mapearColaborador(fila));
  })
);

app.delete(
  '/api/colaboradores/:id',
  ruta(async (req, res) => {
    const id = Number(req.params.id);
    await exigirColaborador(id);
    // Borrado explícito de sus turnos para no depender de PRAGMA foreign_keys.
    await lote([
      { sql: 'DELETE FROM turnos WHERE colaborador_id = ?', args: [id] },
      { sql: 'DELETE FROM colaboradores WHERE id = ?', args: [id] }
    ]);
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Estado en vivo                                                      */
/* ------------------------------------------------------------------ */

app.get(
  '/api/estado',
  ruta(async (req, res) => {
    const ahora = aISOlocal();
    const hoy = ahora.slice(0, 10);

    const activos = (
      await todos(`${SELECT_TURNOS} WHERE t.salida IS NULL ORDER BY t.entrada ASC`)
    ).map(mapearTurno);

    const turnosHoy = await todos('SELECT * FROM turnos WHERE fecha = ?', [hoy]);

    let horasHoy = 0;
    for (const turno of turnosHoy) {
      if (turno.salida) {
        const horas = horasTurno(turno);
        if (horas !== null) horasHoy += horas;
        continue;
      }

      // Turno abierto: cuenta el tiempo transcurrido menos las pausas.
      let minutos = minutosEntre(turno.entrada, ahora);
      minutos -= Number(turno.pausa_minutos || 0);
      if (turno.pausa_inicio) {
        minutos -= minutosEntre(turno.pausa_inicio, ahora);
      }
      horasHoy += Math.max(0, minutos) / 60;
    }

    res.json({
      ahora,
      fecha: hoy,
      activos,
      resumen: {
        en_turno: activos.filter((t) => !t.en_pausa).length,
        en_pausa: activos.filter((t) => t.en_pausa).length,
        horas_hoy: redondear(horasHoy),
        turnos_hoy: turnosHoy.length
      }
    });
  })
);

/* ------------------------------------------------------------------ */
/* Turnos                                                              */
/* ------------------------------------------------------------------ */

app.get(
  '/api/turnos',
  ruta(async (req, res) => {
    const condiciones = [];
    const parametros = [];

    const { desde, hasta } = leerRango(req);
    const colaboradorId = Number(req.query.colaborador_id);

    if (desde) {
      condiciones.push('t.fecha >= ?');
      parametros.push(desde);
    }
    if (hasta) {
      condiciones.push('t.fecha <= ?');
      parametros.push(hasta);
    }
    if (Number.isInteger(colaboradorId) && colaboradorId > 0) {
      condiciones.push('t.colaborador_id = ?');
      parametros.push(colaboradorId);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const filas = await todos(
      `${SELECT_TURNOS} ${where} ORDER BY t.entrada DESC LIMIT 1000`,
      parametros
    );

    res.json(filas.map(mapearTurno));
  })
);

app.post(
  '/api/turnos/entrada',
  ruta(async (req, res) => {
    const colaborador = await exigirColaborador(req.body.colaborador_id);
    if (!colaborador.activo) {
      throw new HttpError(400, 'El colaborador está inactivo.');
    }

    const abierto = await uno(
      'SELECT id FROM turnos WHERE colaborador_id = ? AND salida IS NULL',
      [colaborador.id]
    );
    if (abierto) {
      throw new HttpError(409, 'Este colaborador ya tiene un turno abierto.');
    }

    const ahora = aISOlocal();
    const info = await ejecutar(
      'INSERT INTO turnos (colaborador_id, fecha, entrada, notas, creado_en) VALUES (?, ?, ?, ?, ?)',
      [colaborador.id, ahora.slice(0, 10), ahora, texto(req.body.notas, 500), ahora]
    );

    res.status(201).json(mapearTurno(await obtenerTurno(info.lastInsertRowid)));
  })
);

app.post(
  '/api/turnos/:id/pausa/iniciar',
  ruta(async (req, res) => {
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    if (turno.salida) throw new HttpError(400, 'El turno ya está cerrado.');
    if (turno.pausa_inicio) {
      throw new HttpError(409, 'La pausa ya está iniciada.');
    }

    await ejecutar('UPDATE turnos SET pausa_inicio = ? WHERE id = ?', [
      aISOlocal(),
      turno.id
    ]);
    res.json(mapearTurno(await obtenerTurno(turno.id)));
  })
);

app.post(
  '/api/turnos/:id/pausa/finalizar',
  ruta(async (req, res) => {
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    if (!turno.pausa_inicio) {
      throw new HttpError(409, 'No hay una pausa en curso.');
    }

    const minutos = minutosEntre(turno.pausa_inicio, aISOlocal());
    await ejecutar(
      'UPDATE turnos SET pausa_inicio = NULL, pausa_minutos = pausa_minutos + ? WHERE id = ?',
      [minutos, turno.id]
    );

    res.json(mapearTurno(await obtenerTurno(turno.id)));
  })
);

app.post(
  '/api/turnos/:id/salida',
  ruta(async (req, res) => {
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    if (turno.salida) throw new HttpError(409, 'El turno ya está cerrado.');

    const ahora = aISOlocal();
    let pausaMinutos = Number(turno.pausa_minutos || 0);
    if (turno.pausa_inicio) {
      pausaMinutos += minutosEntre(turno.pausa_inicio, ahora);
    }

    await ejecutar(
      `UPDATE turnos
       SET salida = ?, pausa_inicio = NULL, pausa_minutos = ?
       WHERE id = ?`,
      [ahora, redondear(pausaMinutos), turno.id]
    );

    res.json(mapearTurno(await obtenerTurno(turno.id)));
  })
);

app.post(
  '/api/turnos',
  ruta(async (req, res) => {
    const colaborador = await exigirColaborador(req.body.colaborador_id);

    const entrada = normalizarFechaHora(req.body.entrada, 'hora de entrada');
    const salida = normalizarFechaHora(req.body.salida, 'hora de salida');
    if (leerFechaHora(salida) <= leerFechaHora(entrada)) {
      throw new HttpError(400, 'La salida debe ser posterior a la entrada.');
    }

    const pausaMinutos = numeroNoNegativo(
      req.body.pausa_minutos,
      'La pausa',
      1440
    );
    if (pausaMinutos / 60 >= minutosEntre(entrada, salida) / 60) {
      throw new HttpError(400, 'La pausa no puede durar más que el turno.');
    }

    if (await buscarSolape(colaborador.id, entrada, salida)) {
      throw new HttpError(
        409,
        'El turno se cruza con otro turno de este colaborador.'
      );
    }

    const info = await ejecutar(
      `INSERT INTO turnos
       (colaborador_id, fecha, entrada, salida, pausa_minutos, notas, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        colaborador.id,
        entrada.slice(0, 10),
        entrada,
        salida,
        pausaMinutos,
        texto(req.body.notas, 500),
        aISOlocal()
      ]
    );

    res.status(201).json(mapearTurno(await obtenerTurno(info.lastInsertRowid)));
  })
);

app.put(
  '/api/turnos/:id',
  ruta(async (req, res) => {
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');

    const colaborador = await exigirColaborador(
      req.body.colaborador_id ?? turno.colaborador_id
    );
    const entrada = normalizarFechaHora(req.body.entrada, 'hora de entrada');
    const salida = req.body.salida
      ? normalizarFechaHora(req.body.salida, 'hora de salida')
      : null;

    if (salida && leerFechaHora(salida) <= leerFechaHora(entrada)) {
      throw new HttpError(400, 'La salida debe ser posterior a la entrada.');
    }

    let pausaMinutos = numeroNoNegativo(
      req.body.pausa_minutos ?? turno.pausa_minutos,
      'La pausa',
      1440
    );

    let pausaInicio = turno.pausa_inicio;
    if (salida && pausaInicio) {
      pausaMinutos += minutosEntre(pausaInicio, aISOlocal());
      pausaInicio = null;
    }
    if (!salida) pausaInicio = turno.salida ? null : turno.pausa_inicio;

    if (salida && pausaMinutos / 60 >= minutosEntre(entrada, salida) / 60) {
      throw new HttpError(400, 'La pausa no puede durar más que el turno.');
    }

    if (await buscarSolape(colaborador.id, entrada, salida, turno.id)) {
      throw new HttpError(
        409,
        'El turno se cruza con otro turno de este colaborador.'
      );
    }

    await ejecutar(
      `UPDATE turnos
       SET colaborador_id = ?, fecha = ?, entrada = ?, salida = ?,
           pausa_inicio = ?, pausa_minutos = ?, notas = ?
       WHERE id = ?`,
      [
        colaborador.id,
        entrada.slice(0, 10),
        entrada,
        salida,
        pausaInicio,
        redondear(pausaMinutos),
        texto(req.body.notas, 500),
        turno.id
      ]
    );

    res.json(mapearTurno(await obtenerTurno(turno.id)));
  })
);

app.delete(
  '/api/turnos/:id',
  ruta(async (req, res) => {
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    await ejecutar('DELETE FROM turnos WHERE id = ?', [turno.id]);
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Reportes                                                            */
/* ------------------------------------------------------------------ */

async function calcularReporte({ desde, hasta, colaboradorId }) {
  const condiciones = ['t.salida IS NOT NULL'];
  const parametros = [];

  if (desde) {
    condiciones.push('t.fecha >= ?');
    parametros.push(desde);
  }
  if (hasta) {
    condiciones.push('t.fecha <= ?');
    parametros.push(hasta);
  }
  if (colaboradorId) {
    condiciones.push('t.colaborador_id = ?');
    parametros.push(colaboradorId);
  }

  const filas = await todos(
    `${SELECT_TURNOS} WHERE ${condiciones.join(' AND ')}
     ORDER BY t.fecha ASC, t.entrada ASC`,
    parametros
  );

  const umbral = await umbralDiario();
  const detalle = filas.map(mapearTurno);

  // Horas extra por colaborador y día (no por turno suelto).
  const dias = new Map();
  for (const turno of detalle) {
    const clave = `${turno.colaborador_id}|${turno.fecha}`;
    const acumulado = dias.get(clave) || {
      colaborador_id: turno.colaborador_id,
      colaborador_nombre: turno.colaborador_nombre,
      colaborador_puesto: turno.colaborador_puesto,
      fecha: turno.fecha,
      horas: 0,
      pausa_minutos: 0,
      turnos: 0,
      extra: 0
    };
    acumulado.horas += turno.horas || 0;
    acumulado.pausa_minutos += turno.pausa_minutos || 0;
    acumulado.turnos += 1;
    dias.set(clave, acumulado);
  }
  for (const dia of dias.values()) {
    dia.horas = redondear(dia.horas);
    dia.pausa_minutos = redondear(dia.pausa_minutos);
    dia.extra = redondear(Math.max(0, dia.horas - umbral));
  }

  for (const turno of detalle) {
    const dia = dias.get(`${turno.colaborador_id}|${turno.fecha}`);
    turno.extra_dia = dia ? dia.extra : 0;
  }

  const porColaborador = new Map();
  for (const dia of dias.values()) {
    const acumulado = porColaborador.get(dia.colaborador_id) || {
      colaborador_id: dia.colaborador_id,
      colaborador_nombre: dia.colaborador_nombre,
      colaborador_puesto: dia.colaborador_puesto,
      turnos: 0,
      dias: 0,
      horas: 0,
      pausa_minutos: 0,
      extra: 0
    };
    acumulado.turnos += dia.turnos;
    acumulado.dias += 1;
    acumulado.horas += dia.horas;
    acumulado.pausa_minutos += dia.pausa_minutos;
    acumulado.extra += dia.extra;
    porColaborador.set(dia.colaborador_id, acumulado);
  }

  const porDia = new Map();
  for (const dia of dias.values()) {
    const acumulado = porDia.get(dia.fecha) || {
      fecha: dia.fecha,
      turnos: 0,
      horas: 0,
      pausa_minutos: 0,
      extra: 0
    };
    acumulado.turnos += dia.turnos;
    acumulado.horas += dia.horas;
    acumulado.pausa_minutos += dia.pausa_minutos;
    acumulado.extra += dia.extra;
    porDia.set(dia.fecha, acumulado);
  }

  const listaColaboradores = [...porColaborador.values()]
    .map((c) => ({
      ...c,
      horas: redondear(c.horas),
      pausa_minutos: redondear(c.pausa_minutos),
      extra: redondear(c.extra)
    }))
    .sort((a, b) => b.horas - a.horas);

  const listaDias = [...porDia.values()]
    .map((d) => ({
      ...d,
      horas: redondear(d.horas),
      pausa_minutos: redondear(d.pausa_minutos),
      extra: redondear(d.extra)
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totales = {
    turnos: detalle.length,
    colaboradores: listaColaboradores.length,
    dias: listaDias.length,
    horas: redondear(listaColaboradores.reduce((s, c) => s + c.horas, 0)),
    pausa_minutos: redondear(
      listaColaboradores.reduce((s, c) => s + c.pausa_minutos, 0)
    ),
    extra: redondear(listaColaboradores.reduce((s, c) => s + c.extra, 0))
  };

  return {
    desde,
    hasta,
    umbral,
    detalle,
    por_colaborador: listaColaboradores,
    por_dia: listaDias,
    totales
  };
}

app.get(
  '/api/reportes',
  ruta(async (req, res) => {
    const hoy = hoyISO();
    const rango = leerRango(req);
    const desde = rango.desde || `${hoy.slice(0, 8)}01`;
    const hasta = rango.hasta || hoy;
    const colaboradorId = Number(req.query.colaborador_id);

    res.json(
      await calcularReporte({
        desde,
        hasta,
        colaboradorId:
          Number.isInteger(colaboradorId) && colaboradorId > 0
            ? colaboradorId
            : null
      })
    );
  })
);

function celdaCSV(valor) {
  let texto = String(valor ?? '');
  // Evita que Excel interprete texto como fórmula.
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replaceAll('"', '""')}"`;
}

function numeroCSV(valor) {
  return String(redondear(valor)).replace('.', ',');
}

app.get(
  '/api/reportes/csv',
  ruta(async (req, res) => {
    const hoy = hoyISO();
    const rango = leerRango(req);
    const desde = rango.desde || `${hoy.slice(0, 8)}01`;
    const hasta = rango.hasta || hoy;
    const colaboradorId = Number(req.query.colaborador_id);

    const reporte = await calcularReporte({
      desde,
      hasta,
      colaboradorId:
        Number.isInteger(colaboradorId) && colaboradorId > 0
          ? colaboradorId
          : null
    });

    const lineas = [];
    lineas.push(
      [
        'Colaborador',
        'Puesto',
        'Fecha',
        'Entrada',
        'Salida',
        'Pausa (min)',
        'Horas trabajadas',
        'Horas extra del día',
        'Notas'
      ]
        .map(celdaCSV)
        .join(';')
    );

    for (const turno of reporte.detalle) {
      lineas.push(
        [
          turno.colaborador_nombre,
          turno.colaborador_puesto,
          turno.fecha,
          turno.entrada.slice(11, 16),
          turno.salida ? turno.salida.slice(11, 16) : '',
          numeroCSV(turno.pausa_minutos),
          numeroCSV(turno.horas || 0),
          numeroCSV(turno.extra_dia || 0),
          turno.notas
        ]
          .map(celdaCSV)
          .join(';')
      );
    }

    lineas.push('');
    lineas.push(
      ['Totales', '', '', '', '', numeroCSV(reporte.totales.pausa_minutos), numeroCSV(reporte.totales.horas), numeroCSV(reporte.totales.extra), '']
        .map(celdaCSV)
        .join(';')
    );

    const csv = `\uFEFF${lineas.join('\r\n')}`;
    const nombreArchivo = `reporte-horas-${desde}-a-${hasta}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombreArchivo}"`
    );
    res.send(csv);
  })
);

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

app.get(
  '/api/config',
  ruta(async (req, res) => {
    res.json(await leerConfig());
  })
);

app.get(
  '/api/info',
  ruta(async (req, res) => {
    res.json({
      nombre_tienda: (await leerConfig()).nombre_tienda,
      version: VERSION,
      puerto: PORT,
      node: process.version,
      modo: esRemota ? 'nube' : 'local',
      base_datos: esRemota ? 'Turso (nube)' : 'data/tienda.db',
      zona_horaria: process.env.TZ || null,
      hora_servidor: aISOlocal(),
      direcciones: esRemota
        ? []
        : direccionesLocales().map((ip) => `http://${ip}:${PORT}`)
    });
  })
);

app.get(
  '/api/salud',
  ruta(async (req, res) => {
    res.json({ ok: true, ahora: aISOlocal(), version: VERSION });
  })
);

function valorSQL(valor) {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'number' || typeof valor === 'bigint') return String(valor);
  if (valor instanceof Uint8Array) {
    return `X'${Buffer.from(valor).toString('hex')}'`;
  }
  return `'${String(valor).replaceAll("'", "''")}'`;
}

// En la nube no hay archivo SQLite: se genera un volcado SQL restaurable.
async function volcarSQL() {
  const objetos = await todos(
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
     ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`
  );

  const lineas = [
    '-- Respaldo de TurnoYa',
    `-- Generado: ${aISOlocal()}`,
    'BEGIN TRANSACTION;'
  ];

  for (const objeto of objetos) {
    lineas.push(`${objeto.sql};`);
    if (objeto.type !== 'table') continue;

    const filas = await todos(`SELECT * FROM "${objeto.name}"`);
    for (const fila of filas) {
      const columnas = Object.keys(fila);
      lineas.push(
        `INSERT INTO "${objeto.name}" (${columnas
          .map((c) => `"${c}"`)
          .join(', ')}) VALUES (${columnas
          .map((c) => valorSQL(fila[c]))
          .join(', ')});`
      );
    }
  }

  lineas.push('COMMIT;');
  return lineas.join('\n');
}

app.get(
  '/api/respaldo',
  ruta(async (req, res, next) => {
    if (esRemota) {
      const sql = await volcarSQL();
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="turnoya-respaldo-${hoyISO()}.sql"`
      );
      res.send(sql);
      return;
    }

    // En local se envía el archivo SQLite completo.
    await ejecutar('PRAGMA wal_checkpoint(TRUNCATE)');
    const archivo = path.join(dataDir, 'tienda.db');
    res.download(archivo, `turnoya-respaldo-${hoyISO()}.db`, (error) => {
      if (error && !res.headersSent) next(error);
    });
  })
);

app.put(
  '/api/config',
  ruta(async (req, res) => {
    if (req.body.nombre_tienda !== undefined) {
      const nombre = texto(req.body.nombre_tienda, 60);
      if (!nombre) throw new HttpError(400, 'El nombre de la tienda es obligatorio.');
      await guardarConfig('nombre_tienda', nombre);
    }

    if (req.body.jornada_horas !== undefined) {
      const horas = Number(req.body.jornada_horas);
      if (!Number.isFinite(horas) || horas < 1 || horas > 24) {
        throw new HttpError(400, 'La jornada diaria debe estar entre 1 y 24 horas.');
      }
      await guardarConfig('jornada_horas', redondear(horas));
    }

    res.json(await leerConfig());
  })
);

/* ------------------------------------------------------------------ */
/* Manejo de errores                                                   */
/* ------------------------------------------------------------------ */

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
  }
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  }
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

function direccionesLocales() {
  const interfaces = os.networkInterfaces();
  const direcciones = [];
  for (const lista of Object.values(interfaces)) {
    for (const info of lista || []) {
      if (info.family === 'IPv4' && !info.internal) direcciones.push(info.address);
    }
  }
  return direcciones;
}

async function arrancar() {
  try {
    await preparar();
  } catch (error) {
    console.error('No se pudo preparar la base de datos:', error.message);
    process.exit(1);
  }

  const servidor = app.listen(PORT, HOST, () => {
    console.log('');
    console.log(`  TurnoYa ${VERSION} - Control de horas`);
    console.log('  ----------------------------------------');
    if (esRemota) {
      console.log('  Base de datos: Turso (nube)');
    } else {
      console.log(`  Base de datos: ${path.join('data', 'tienda.db')}`);
      console.log(`  Local:  http://localhost:${PORT}`);
      for (const direccion of direccionesLocales()) {
        console.log(`  Red:    http://${direccion}:${PORT}`);
      }
    }
    console.log('');
    console.log('  Presiona Ctrl+C para detener el servidor.');
    console.log('');
  });

  let cerrando = false;
  function cerrarServidor(senal) {
    if (cerrando) return;
    cerrando = true;
    console.log(`\n  Cerrando TurnoYa (${senal})…`);
    servidor.close(async () => {
      await cerrar();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on('SIGINT', () => cerrarServidor('SIGINT'));
  process.on('SIGTERM', () => cerrarServidor('SIGTERM'));
}

if (require.main === module) {
  arrancar();
}

module.exports = app;
