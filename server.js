/* ==================================================================
 * [ETIQUETA: CONFIGURACIÓN DEL SERVIDOR Y ZONA HORARIA]
 * Qué hace: Configura la zona horaria (`TURNOYA_TZ`), carga Express,
 * el módulo de base de datos (`db.js`) y las variables de puerto/host.
 * ================================================================== */

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
const crypto = require('node:crypto');
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
app.set('trust proxy', 1);

/* ==================================================================
 * [ETIQUETA: SEGURIDAD HTTP Y ARCHIVOS ESTÁTICOS]
 * Qué hace: Aplica cabeceras CSP/HSTS/anti-clickjacking, parseo JSON,
 * sirve `public/`, expone `/mi-turno` y prepara BD/sesión antes de `/api`.
 * ================================================================== */

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
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Vista exclusiva para colaboradores (fichaje + sus propios registros y resumen).
app.get(['/mi-turno', '/mi-turno/', '/colaborador'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mi-turno.html'));
});

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

// Validación anti-CSRF en mutaciones HTTP y carga de sesión firmada.
app.use('/api', async (req, res, next) => {
  try {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const origen = req.headers.origin;
      const host = req.get('host');
      if (origen && host) {
        try {
          if (new URL(origen).host !== host) {
            throw new HttpError(403, 'Origen no autorizado.');
          }
        } catch (err) {
          if (err instanceof HttpError) throw err;
          throw new HttpError(403, 'Origen no válido.');
        }
      }
      const esCliente = req.headers['x-turnoya-cliente'] === '1';
      const esJson = String(req.headers['content-type'] || '').includes('application/json');
      if (!esCliente && !esJson) {
        throw new HttpError(403, 'Solicitud rechazada por protección CSRF.');
      }
    }

    const secreto = await obtenerSecretoAuth();
    req.secretoAuth = secreto;
    const cookies = parsearCookies(req);

    const candidatoColab =
      req.headers['x-turnoya-colab-token'] || cookies.turnoya_colab || '';
    const candidatoGeneral = req.headers['x-turnoya-auth'] || '';

    let sesionColab = verificarTokenSesion(candidatoColab, secreto);
    if ((!sesionColab || sesionColab.rol !== 'colab') && candidatoGeneral) {
      const alt = verificarTokenSesion(candidatoGeneral, secreto);
      if (alt && alt.rol === 'colab') sesionColab = alt;
    }

    const esVistaColaborador = req.headers['x-turnoya-vista'] === 'colaborador';
    req.esAdmin = !esVistaColaborador;
    req.sesionColabId =
      sesionColab && sesionColab.rol === 'colab' && Number.isInteger(Number(sesionColab.colaborador_id))
        ? Number(sesionColab.colaborador_id)
        : null;
    next();
  } catch (error) {
    next(error);
  }
});

/* ==================================================================
 * [ETIQUETA: UTILIDADES DE FECHAS, VALIDACIÓN Y MAPEO]
 * Qué hace: Formatea fechas/horas locales, valida rangos y solapamientos
 * de turnos, calcula duración neta y lee/guarda la configuración.
 * ================================================================== */

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

function fechaCorta(iso) {
  if (!iso) return '—';
  const [anio, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

function horaCorta(iso) {
  if (!iso) return '—';
  return String(iso).slice(11, 16);
}

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

const CLAVES_INTERNAS_CONFIG = new Set(['auth_secreto', 'admin_clave_hash']);

async function leerConfig() {
  const filas = await todos('SELECT clave, valor FROM configuracion');
  const config = {};
  for (const fila of filas) {
    if (!CLAVES_INTERNAS_CONFIG.has(fila.clave)) {
      config[fila.clave] = fila.valor;
    }
  }
  return config;
}

async function leerConfigInterna(clave) {
  const fila = await uno('SELECT valor FROM configuracion WHERE clave = ?', [clave]);
  return fila ? fila.valor : null;
}

async function guardarConfig(clave, valor) {
  await ejecutar(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    [clave, String(valor)]
  );
}

/* ==================================================================
 * [ETIQUETA: SEGURIDAD, SESIONES Y CONTROL DE ACCESO]
 * Qué hace: Hash scrypt para contraseñas/PINs, tokens HMAC-SHA256,
 * limitador anti-fuerza bruta, verificador offline y middlewares de rol.
 * ================================================================== */

const DURACION_SESION_ADMIN_MS = 12 * 60 * 60 * 1000;
const DURACION_SESION_COLAB_MS = 30 * 24 * 60 * 60 * 1000;
const VENTANA_INTENTOS_MS = 10 * 60 * 1000;
const MAX_INTENTOS_FALLIDOS = 5;
const intentosFallidos = new Map();

function crearHashSecreto(secreto) {
  const sal = crypto.randomBytes(16).toString('hex');
  const derivado = crypto.scryptSync(String(secreto ?? ''), sal, 64).toString('hex');
  return `${sal}:${derivado}`;
}

function verificarHashSecreto(secreto, almacenado) {
  if (!almacenado || typeof almacenado !== 'string' || !almacenado.includes(':')) {
    return false;
  }
  const [sal, hashHex] = almacenado.split(':');
  if (!sal || !hashHex) return false;
  try {
    const esperado = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(secreto ?? ''), sal, esperado.length);
    return esperado.length === actual.length && crypto.timingSafeEqual(esperado, actual);
  } catch {
    return false;
  }
}

function crearVerificadorOffline(colaboradorId, pin, secreto) {
  const sal = crypto
    .createHmac('sha256', String(secreto))
    .update(`offline-salt:${colaboradorId}`)
    .digest('hex')
    .slice(0, 16);
  const hash = crypto
    .createHash('sha256')
    .update(`${sal}:${colaboradorId}:${pin}`)
    .digest('hex');
  return `${sal}:${hash}`;
}

async function obtenerSecretoAuth() {
  let secreto = await leerConfigInterna('auth_secreto');
  if (!secreto) {
    secreto =
      (process.env.TURNOYA_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
    await guardarConfig('auth_secreto', secreto);
  }
  return secreto;
}

async function obtenerHashAdmin() {
  let hash = await leerConfigInterna('admin_clave_hash');
  if (!hash && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 4) {
    hash = crearHashSecreto(process.env.ADMIN_PASSWORD.trim());
    await guardarConfig('admin_clave_hash', hash);
  }
  return hash || null;
}

function crearTokenSesion(datos, secreto, duracionMs) {
  const payload = { ...datos, exp: Date.now() + duracionMs };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const firma = crypto.createHmac('sha256', String(secreto)).update(payloadB64).digest('base64url');
  return `${payloadB64}.${firma}`;
}

function verificarTokenSesion(token, secreto) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payloadB64, firma] = partes;
  if (!payloadB64 || !firma) return null;

  try {
    const esperada = crypto
      .createHmac('sha256', String(secreto))
      .update(payloadB64)
      .digest('base64url');
    const bufA = Buffer.from(firma, 'utf8');
    const bufB = Buffer.from(esperada, 'utf8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parsearCookies(req) {
  const crudo = String(req.headers.cookie || '');
  const resultado = {};
  for (const parte of crudo.split(';')) {
    const idx = parte.indexOf('=');
    if (idx <= 0) continue;
    const clave = parte.slice(0, idx).trim();
    const valor = parte.slice(idx + 1).trim();
    if (!clave) continue;
    try {
      resultado[clave] = decodeURIComponent(valor);
    } catch {
      resultado[clave] = valor;
    }
  }
  return resultado;
}

function enviarCookieSesion(req, res, nombre, token, maxAgeSeg) {
  const esHttps = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  const atributos = [
    `${nombre}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeg}`
  ];
  if (esHttps) atributos.push('Secure');
  res.append('Set-Cookie', atributos.join('; '));
}

function limpiarCookieSesion(req, res, nombre) {
  const esHttps = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  const atributos = [`${nombre}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (esHttps) atributos.push('Secure');
  res.append('Set-Cookie', atributos.join('; '));
}

function claveIntento(req, destino) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'local');
  return `${ip}:${destino}`;
}

function verificarNoBloqueado(req, destino) {
  const clave = claveIntento(req, destino);
  const registro = intentosFallidos.get(clave);
  if (!registro) return;
  const ahora = Date.now();
  if (registro.bloqueadoHasta && registro.bloqueadoHasta > ahora) {
    const min = Math.max(1, Math.ceil((registro.bloqueadoHasta - ahora) / 60000));
    throw new HttpError(
      429,
      `Demasiados intentos fallidos. Intenta de nuevo en ${min} minuto${min === 1 ? '' : 's'}.`
    );
  }
  if (ahora - registro.ultimoIntento > VENTANA_INTENTOS_MS) {
    intentosFallidos.delete(clave);
  }
}

function registrarIntentoFallido(req, destino) {
  if (intentosFallidos.size > 5000) intentosFallidos.clear();
  const clave = claveIntento(req, destino);
  const ahora = Date.now();
  const prev = intentosFallidos.get(clave);
  const conteo =
    prev && ahora - prev.ultimoIntento <= VENTANA_INTENTOS_MS ? prev.conteo + 1 : 1;
  const bloqueadoHasta =
    conteo >= MAX_INTENTOS_FALLIDOS ? ahora + VENTANA_INTENTOS_MS : 0;
  intentosFallidos.set(clave, { conteo, bloqueadoHasta, ultimoIntento: ahora });
  if (bloqueadoHasta > 0) {
    throw new HttpError(
      429,
      'Demasiados intentos fallidos. Bloqueado temporalmente por 10 minutos.'
    );
  }
}

function limpiarIntentos(req, destino) {
  intentosFallidos.delete(claveIntento(req, destino));
}

function exigirAdmin(req) {
  if (!req.esAdmin) {
    throw new HttpError(401, 'Se requiere iniciar sesión como administrador.');
  }
}

async function exigirAccesoColaborador(req, colaboradorId) {
  const colaborador = await exigirColaborador(colaboradorId);
  if (req.esAdmin) return colaborador;
  if (req.sesionColabId === colaborador.id) return colaborador;
  if (req.sesionColabId && req.sesionColabId !== colaborador.id) {
    throw new HttpError(
      403,
      'No tienes permiso para acceder a los datos de otro colaborador.'
    );
  }
  throw new HttpError(
    401,
    colaborador.pin_hash
      ? 'Ingresa tu PIN de 4 dígitos para continuar.'
      : 'Selecciona tu perfil de colaborador para continuar.'
  );
}

/* ==================================================================
 * [ETIQUETA: API DE AUTENTICACIÓN (ADMIN Y COLABORADOR)]
 * Qué hace: Estado de sesión, configuración inicial de clave admin,
 * login/cambio de clave admin, login por PIN del colaborador y logout.
 * ================================================================== */

app.get(
  '/api/auth/estado',
  ruta(async (req, res) => {
    res.json({
      admin_configurado: true,
      admin_autenticado: true,
      colaborador_id: req.sesionColabId
    });
  })
);

app.post(
  '/api/auth/admin/configurar',
  ruta(async (req, res) => {
    if (await obtenerHashAdmin()) {
      throw new HttpError(403, 'La contraseña de administrador ya fue configurada.');
    }
    const clave = String((req.body || {}).clave ?? '').trim();
    if (clave.length < 4 || clave.length > 64) {
      throw new HttpError(400, 'La contraseña o PIN debe tener entre 4 y 64 caracteres.');
    }
    await guardarConfig('admin_clave_hash', crearHashSecreto(clave));
    const token = crearTokenSesion(
      { rol: 'admin' },
      req.secretoAuth,
      DURACION_SESION_ADMIN_MS
    );
    enviarCookieSesion(
      req,
      res,
      'turnoya_admin',
      token,
      Math.floor(DURACION_SESION_ADMIN_MS / 1000)
    );
    res.status(201).json({ ok: true, token });
  })
);

app.post(
  '/api/auth/admin/login',
  ruta(async (req, res) => {
    verificarNoBloqueado(req, 'admin');
    const hashAdmin = await obtenerHashAdmin();
    if (!hashAdmin) {
      throw new HttpError(400, 'Primero debes configurar la contraseña de administrador.');
    }
    const clave = String((req.body || {}).clave ?? '').trim();
    if (!clave || !verificarHashSecreto(clave, hashAdmin)) {
      registrarIntentoFallido(req, 'admin');
      throw new HttpError(401, 'Contraseña o PIN de administrador incorrecto.');
    }
    limpiarIntentos(req, 'admin');
    const token = crearTokenSesion(
      { rol: 'admin' },
      req.secretoAuth,
      DURACION_SESION_ADMIN_MS
    );
    enviarCookieSesion(
      req,
      res,
      'turnoya_admin',
      token,
      Math.floor(DURACION_SESION_ADMIN_MS / 1000)
    );
    res.json({ ok: true, token });
  })
);

app.post(
  '/api/auth/admin/cambiar',
  ruta(async (req, res) => {
    exigirAdmin(req);
    const body = req.body || {};
    const actual = String(body.clave_actual ?? '').trim();
    const nueva = String(body.clave_nueva ?? '').trim();
    const hashAdmin = await obtenerHashAdmin();
    if (!hashAdmin || !verificarHashSecreto(actual, hashAdmin)) {
      throw new HttpError(401, 'La contraseña actual no es correcta.');
    }
    if (nueva.length < 4 || nueva.length > 64) {
      throw new HttpError(400, 'La nueva clave debe tener entre 4 y 64 caracteres.');
    }
    await guardarConfig('admin_clave_hash', crearHashSecreto(nueva));
    const token = crearTokenSesion(
      { rol: 'admin' },
      req.secretoAuth,
      DURACION_SESION_ADMIN_MS
    );
    enviarCookieSesion(
      req,
      res,
      'turnoya_admin',
      token,
      Math.floor(DURACION_SESION_ADMIN_MS / 1000)
    );
    res.json({ ok: true, token });
  })
);

app.post(
  '/api/auth/colaborador/login',
  ruta(async (req, res) => {
    const body = req.body || {};
    const colaborador = await exigirColaborador(Number(body.colaborador_id));
    if (!colaborador.activo) {
      throw new HttpError(400, 'Este colaborador está inactivo.');
    }

    const destino = `colab:${colaborador.id}`;
    verificarNoBloqueado(req, destino);

    let pinLimpio = null;
    if (colaborador.pin_hash) {
      pinLimpio = String(body.pin ?? '').trim();
      if (!/^\d{4}$/.test(pinLimpio) || !verificarHashSecreto(pinLimpio, colaborador.pin_hash)) {
        registrarIntentoFallido(req, destino);
        throw new HttpError(401, 'PIN incorrecto. Verifica tus 4 dígitos.');
      }
      limpiarIntentos(req, destino);
    }

    const token = crearTokenSesion(
      { rol: 'colab', colaborador_id: colaborador.id },
      req.secretoAuth,
      DURACION_SESION_COLAB_MS
    );
    enviarCookieSesion(
      req,
      res,
      'turnoya_colab',
      token,
      Math.floor(DURACION_SESION_COLAB_MS / 1000)
    );
    const verificadorOffline =
      colaborador.pin_hash && pinLimpio
        ? crearVerificadorOffline(colaborador.id, pinLimpio, req.secretoAuth)
        : null;

    res.json({
      ok: true,
      token,
      verificador_offline: verificadorOffline,
      colaborador: mapearColaborador(colaborador)
    });
  })
);

app.post(
  '/api/auth/logout',
  ruta(async (req, res) => {
    const tipo = String((req.body || {}).tipo || 'todos');
    if (tipo === 'admin' || tipo === 'todos') {
      limpiarCookieSesion(req, res, 'turnoya_admin');
    }
    if (tipo === 'colab' || tipo === 'todos') {
      limpiarCookieSesion(req, res, 'turnoya_colab');
    }
    res.json({ ok: true });
  })
);

async function umbralDiario() {
  const valor = Number((await leerConfig()).jornada_horas);
  return Number.isFinite(valor) && valor > 0 && valor <= 24 ? valor : 8;
}

function mapearColaborador(fila) {
  const tarifa = fila.tarifa_hora;
  return {
    id: fila.id,
    nombre: fila.nombre,
    puesto: fila.puesto,
    email: fila.email,
    telefono: fila.telefono,
    tarifa_hora:
      tarifa === null || tarifa === undefined || tarifa === ''
        ? null
        : redondear(Number(tarifa)),
    tiene_pin: Boolean(fila.pin_hash),
    activo: Boolean(fila.activo),
    creado_en: fila.creado_en
  };
}

function mapearColaboradorPublico(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    puesto: fila.puesto,
    activo: Boolean(fila.activo),
    tiene_pin: Boolean(fila.pin_hash)
  };
}

function leerPinOpcional(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return null;
  }
  const limpio = String(valor).trim();
  if (!/^\d{4}$/.test(limpio)) {
    throw new HttpError(400, 'El PIN debe tener exactamente 4 dígitos numéricos.');
  }
  return limpio;
}

function leerTarifaOpcional(valor, campo = 'La tarifa por hora') {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return null;
  }
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    throw new HttpError(400, `${campo} debe ser un número entre 0 y 100000.`);
  }
  return redondear(n);
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
  SELECT t.*, c.nombre AS colaborador_nombre, c.puesto AS colaborador_puesto,
         c.tarifa_hora AS colaborador_tarifa_hora
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

/* ==================================================================
 * [ETIQUETA: API CRUD DE COLABORADORES]
 * Qué hace: Lista, crea, edita y elimina integrantes del equipo.
 * ================================================================== */

app.get(
  '/api/colaboradores',
  ruta(async (req, res) => {
    const filas = await todos(
      'SELECT * FROM colaboradores ORDER BY activo DESC, nombre COLLATE NOCASE ASC'
    );
    if (req.esAdmin) {
      res.json(filas.map(mapearColaborador));
      return;
    }
    res.json(filas.filter((f) => Boolean(f.activo)).map(mapearColaboradorPublico));
  })
);

app.post(
  '/api/colaboradores',
  ruta(async (req, res) => {
    exigirAdmin(req);
    const body = req.body || {};
    const nombre = texto(body.nombre, 80);
    if (!nombre) throw new HttpError(400, 'El nombre es obligatorio.');
    const tarifaHora = leerTarifaOpcional(body.tarifa_hora);
    const pin = leerPinOpcional(body.pin);
    const pinHash = pin ? crearHashSecreto(pin) : null;

    const info = await ejecutar(
      `INSERT INTO colaboradores (nombre, puesto, email, telefono, tarifa_hora, pin_hash, activo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        texto(body.puesto, 80),
        texto(body.email, 120),
        texto(body.telefono, 40),
        tarifaHora,
        pinHash,
        body.activo === false ? 0 : 1,
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
    exigirAdmin(req);
    const body = req.body || {};
    const id = Number(req.params.id);
    const actual = await exigirColaborador(id);

    const nombre = texto(body.nombre, 80);
    if (!nombre) throw new HttpError(400, 'El nombre es obligatorio.');
    const tarifaHora =
      body.tarifa_hora !== undefined
        ? leerTarifaOpcional(body.tarifa_hora)
        : actual.tarifa_hora ?? null;

    let pinHash = actual.pin_hash ?? null;
    if (body.quitar_pin === true) {
      pinHash = null;
    } else if (body.pin !== undefined && String(body.pin ?? '').trim() !== '') {
      pinHash = crearHashSecreto(leerPinOpcional(body.pin));
    }

    await ejecutar(
      `UPDATE colaboradores
       SET nombre = ?, puesto = ?, email = ?, telefono = ?, tarifa_hora = ?, pin_hash = ?, activo = ?
       WHERE id = ?`,
      [
        nombre,
        texto(body.puesto, 80),
        texto(body.email, 120),
        texto(body.telefono, 40),
        tarifaHora,
        pinHash,
        body.activo === false ? 0 : 1,
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
    exigirAdmin(req);
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

/* ==================================================================
 * [ETIQUETA: API DE ESTADO EN VIVO (TABLERO DE HOY)]
 * Qué hace: Devuelve quién está en turno o en pausa en tiempo real
 * y el acumulado de horas trabajadas en la fecha actual.
 * ================================================================== */

app.get(
  '/api/estado',
  ruta(async (req, res) => {
    const ahora = aISOlocal();
    const hoy = ahora.slice(0, 10);

    const activos = (
      await todos(`${SELECT_TURNOS} WHERE t.salida IS NULL ORDER BY t.entrada ASC`)
    ).map(mapearTurno);

    if (!req.esAdmin) {
      res.json({
        ahora,
        fecha: hoy,
        activos: activos.map((t) => ({
          ...t,
          notas: req.sesionColabId === t.colaborador_id ? t.notas : ''
        })),
        resumen: {}
      });
      return;
    }

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

/* ==================================================================
 * [ETIQUETA: API DE TURNOS, FICHAJE Y SINCRONIZACIÓN OFFLINE]
 * Qué hace: Consulta turnos, marca entrada/pausa/reanudar/salida,
 * procesa cola offline (`/api/sincronizar`) y permite edición manual.
 * ================================================================== */

app.get(
  '/api/turnos',
  ruta(async (req, res) => {
    const condiciones = [];
    const parametros = [];

    const { desde, hasta } = leerRango(req);
    const colaboradorId = Number(req.query.colaborador_id);

    if (!req.esAdmin) {
      if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) {
        throw new HttpError(401, 'Se requiere iniciar sesión para consultar turnos.');
      }
      await exigirAccesoColaborador(req, colaboradorId);
    }

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

function leerMomentoOpcional(valor) {
  if (!valor) return aISOlocal();
  try {
    return normalizarFechaHora(valor, 'fecha y hora del marcaje');
  } catch {
    return aISOlocal();
  }
}

app.post(
  '/api/turnos/entrada',
  ruta(async (req, res) => {
    const body = req.body || {};
    const colaborador = await exigirAccesoColaborador(req, body.colaborador_id);
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

    const ahora = leerMomentoOpcional(body.momento);
    const info = await ejecutar(
      'INSERT INTO turnos (colaborador_id, fecha, entrada, notas, creado_en) VALUES (?, ?, ?, ?, ?)',
      [colaborador.id, ahora.slice(0, 10), ahora, texto(body.notas, 500), aISOlocal()]
    );

    res.status(201).json(mapearTurno(await obtenerTurno(info.lastInsertRowid)));
  })
);

app.post(
  '/api/turnos/:id/pausa/iniciar',
  ruta(async (req, res) => {
    const body = req.body || {};
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    await exigirAccesoColaborador(req, turno.colaborador_id);
    if (turno.salida) throw new HttpError(400, 'El turno ya está cerrado.');
    if (turno.pausa_inicio) {
      throw new HttpError(409, 'La pausa ya está iniciada.');
    }

    await ejecutar('UPDATE turnos SET pausa_inicio = ? WHERE id = ?', [
      leerMomentoOpcional(body.momento),
      turno.id
    ]);
    res.json(mapearTurno(await obtenerTurno(turno.id)));
  })
);

app.post(
  '/api/turnos/:id/pausa/finalizar',
  ruta(async (req, res) => {
    const body = req.body || {};
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    await exigirAccesoColaborador(req, turno.colaborador_id);
    if (!turno.pausa_inicio) {
      throw new HttpError(409, 'No hay una pausa en curso.');
    }

    const momento = leerMomentoOpcional(body.momento);
    const minutos = minutosEntre(turno.pausa_inicio, momento);
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
    const body = req.body || {};
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    await exigirAccesoColaborador(req, turno.colaborador_id);
    if (turno.salida) throw new HttpError(409, 'El turno ya está cerrado.');

    const ahora = leerMomentoOpcional(body.momento);
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

// Sincroniza en orden cronológico los marcajes guardados cuando el teléfono no tenía Internet.
app.post(
  '/api/sincronizar',
  ruta(async (req, res) => {
    const body = req.body || {};
    const lista = Array.isArray(body.acciones) ? body.acciones.slice(0, 100) : [];
    let aplicadas = 0;
    let rechazadas = 0;

    for (const item of lista) {
      const colaboradorId = Number(item && item.colaborador_id);
      if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) continue;

      const colaborador = await uno('SELECT * FROM colaboradores WHERE id = ?', [colaboradorId]);
      if (!colaborador) continue;

      let autorizado = req.esAdmin || req.sesionColabId === colaboradorId;
      if (!autorizado && item.token) {
        const ses = verificarTokenSesion(String(item.token), req.secretoAuth);
        if (
          ses &&
          (ses.rol === 'admin' ||
            (ses.rol === 'colab' && Number(ses.colaborador_id) === colaboradorId))
        ) {
          autorizado = true;
        }
      }
      if (!autorizado && !colaborador.pin_hash) {
        autorizado = true;
      }
      if (!autorizado) {
        rechazadas += 1;
        continue;
      }

      const tipo = String(item.tipo || '');
      const momento = leerMomentoOpcional(item.momento);
      const abierto = await uno(
        'SELECT * FROM turnos WHERE colaborador_id = ? AND salida IS NULL ORDER BY id DESC LIMIT 1',
        [colaboradorId]
      );

      if (tipo === 'entrada') {
        if (!abierto) {
          await ejecutar(
            'INSERT INTO turnos (colaborador_id, fecha, entrada, notas, creado_en) VALUES (?, ?, ?, ?, ?)',
            [colaboradorId, momento.slice(0, 10), momento, texto(item.notas, 500), aISOlocal()]
          );
          aplicadas += 1;
        }
      } else if (tipo === 'pausa' && abierto && !abierto.pausa_inicio) {
        const inicioPausa = momento > abierto.entrada ? momento : abierto.entrada;
        await ejecutar('UPDATE turnos SET pausa_inicio = ? WHERE id = ?', [
          inicioPausa,
          abierto.id
        ]);
        aplicadas += 1;
      } else if (tipo === 'reanudar' && abierto && abierto.pausa_inicio) {
        const minutos = minutosEntre(abierto.pausa_inicio, momento);
        await ejecutar(
          'UPDATE turnos SET pausa_inicio = NULL, pausa_minutos = pausa_minutos + ? WHERE id = ?',
          [minutos, abierto.id]
        );
        aplicadas += 1;
      } else if (tipo === 'salida' && abierto) {
        const salidaISO = momento > abierto.entrada ? momento : aISOlocal();
        let pausaMinutos = Number(abierto.pausa_minutos || 0);
        if (abierto.pausa_inicio) {
          pausaMinutos += minutosEntre(abierto.pausa_inicio, salidaISO);
        }
        await ejecutar(
          'UPDATE turnos SET salida = ?, pausa_inicio = NULL, pausa_minutos = ? WHERE id = ?',
          [salidaISO, redondear(pausaMinutos), abierto.id]
        );
        aplicadas += 1;
      }
    }

    if (lista.length > 0 && aplicadas === 0 && rechazadas > 0) {
      throw new HttpError(
        401,
        'Ingresa tu PIN de 4 dígitos para sincronizar tus marcajes pendientes.'
      );
    }

    res.json({ ok: true, aplicadas, rechazadas });
  })
);

app.post(
  '/api/turnos',
  ruta(async (req, res) => {
    exigirAdmin(req);
    const body = req.body || {};
    const colaborador = await exigirColaborador(body.colaborador_id);

    const entrada = normalizarFechaHora(body.entrada, 'hora de entrada');
    const salida = normalizarFechaHora(body.salida, 'hora de salida');
    if (leerFechaHora(salida) <= leerFechaHora(entrada)) {
      throw new HttpError(400, 'La salida debe ser posterior a la entrada.');
    }

    const pausaMinutos = numeroNoNegativo(
      body.pausa_minutos,
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
        texto(body.notas, 500),
        aISOlocal()
      ]
    );

    res.status(201).json(mapearTurno(await obtenerTurno(info.lastInsertRowid)));
  })
);

app.put(
  '/api/turnos/:id',
  ruta(async (req, res) => {
    exigirAdmin(req);
    const body = req.body || {};
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');

    const colaborador = await exigirColaborador(
      body.colaborador_id ?? turno.colaborador_id
    );
    const entrada = normalizarFechaHora(body.entrada, 'hora de entrada');
    const salida = body.salida
      ? normalizarFechaHora(body.salida, 'hora de salida')
      : null;

    if (salida && leerFechaHora(salida) <= leerFechaHora(entrada)) {
      throw new HttpError(400, 'La salida debe ser posterior a la entrada.');
    }

    let pausaMinutos = numeroNoNegativo(
      body.pausa_minutos ?? turno.pausa_minutos,
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
        texto(body.notas, 500),
        turno.id
      ]
    );

    res.json(mapearTurno(await obtenerTurno(turno.id)));
  })
);

app.delete(
  '/api/turnos/:id',
  ruta(async (req, res) => {
    exigirAdmin(req);
    const turno = await obtenerTurno(req.params.id);
    if (!turno) throw new HttpError(404, 'El turno no existe.');
    await ejecutar('DELETE FROM turnos WHERE id = ?', [turno.id]);
    res.json({ ok: true });
  })
);

/* ==================================================================
 * [ETIQUETA: MOTOR DE REPORTES Y CÁLCULO DE HORAS EXTRA]
 * Qué hace: Agrupa turnos completados por colaborador y por día,
 * calculando el excedente diario sobre la jornada configurada.
 * ================================================================== */

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

  const config = await leerConfig();
  const valorUmbral = Number(config.jornada_horas);
  const umbral =
    Number.isFinite(valorUmbral) && valorUmbral > 0 && valorUmbral <= 24 ? valorUmbral : 8;
  const moneda = texto(config.moneda, 8) || 'S/';
  const valorTarifaDefecto = Number(config.tarifa_hora_defecto);
  const tarifaDefecto =
    Number.isFinite(valorTarifaDefecto) && valorTarifaDefecto >= 0
      ? redondear(valorTarifaDefecto)
      : 0;

  const tarifasPorColaborador = new Map();
  for (const fila of filas) {
    if (!tarifasPorColaborador.has(fila.colaborador_id)) {
      const propia =
        fila.colaborador_tarifa_hora !== null &&
        fila.colaborador_tarifa_hora !== undefined &&
        fila.colaborador_tarifa_hora !== '';
      tarifasPorColaborador.set(fila.colaborador_id, {
        propia,
        tarifa: propia ? redondear(Number(fila.colaborador_tarifa_hora)) : tarifaDefecto
      });
    }
  }

  const detalle = filas.map((fila) => {
    const t = mapearTurno(fila);
    const infoTarifa = tarifasPorColaborador.get(t.colaborador_id) || {
      propia: false,
      tarifa: tarifaDefecto
    };
    t.tarifa_hora = infoTarifa.tarifa;
    t.pago = redondear((t.horas || 0) * infoTarifa.tarifa);
    return t;
  });

  // Horas extra y pago por colaborador y día (tarifa 1x para horas normales y extra).
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
      extra: 0,
      tarifa_hora: turno.tarifa_hora,
      pago: 0
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
    dia.pago = redondear(dia.horas * dia.tarifa_hora);
  }

  for (const turno of detalle) {
    const dia = dias.get(`${turno.colaborador_id}|${turno.fecha}`);
    turno.extra_dia = dia ? dia.extra : 0;
  }

  const porColaborador = new Map();
  for (const dia of dias.values()) {
    const infoTarifa = tarifasPorColaborador.get(dia.colaborador_id) || {
      propia: false,
      tarifa: tarifaDefecto
    };
    const acumulado = porColaborador.get(dia.colaborador_id) || {
      colaborador_id: dia.colaborador_id,
      colaborador_nombre: dia.colaborador_nombre,
      colaborador_puesto: dia.colaborador_puesto,
      tarifa_hora: infoTarifa.tarifa,
      tarifa_propia: infoTarifa.propia,
      turnos: 0,
      dias: 0,
      horas: 0,
      pausa_minutos: 0,
      extra: 0,
      pago: 0
    };
    acumulado.turnos += dia.turnos;
    acumulado.dias += 1;
    acumulado.horas += dia.horas;
    acumulado.pausa_minutos += dia.pausa_minutos;
    acumulado.extra += dia.extra;
    acumulado.pago += dia.pago;
    porColaborador.set(dia.colaborador_id, acumulado);
  }

  const porDia = new Map();
  for (const dia of dias.values()) {
    const acumulado = porDia.get(dia.fecha) || {
      fecha: dia.fecha,
      turnos: 0,
      horas: 0,
      pausa_minutos: 0,
      extra: 0,
      pago: 0
    };
    acumulado.turnos += dia.turnos;
    acumulado.horas += dia.horas;
    acumulado.pausa_minutos += dia.pausa_minutos;
    acumulado.extra += dia.extra;
    acumulado.pago += dia.pago;
    porDia.set(dia.fecha, acumulado);
  }

  const listaColaboradores = [...porColaborador.values()]
    .map((c) => ({
      ...c,
      horas: redondear(c.horas),
      pausa_minutos: redondear(c.pausa_minutos),
      extra: redondear(c.extra),
      pago: redondear(c.pago)
    }))
    .sort((a, b) => b.horas - a.horas);

  const listaDias = [...porDia.values()]
    .map((d) => ({
      ...d,
      horas: redondear(d.horas),
      pausa_minutos: redondear(d.pausa_minutos),
      extra: redondear(d.extra),
      pago: redondear(d.pago)
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
    extra: redondear(listaColaboradores.reduce((s, c) => s + c.extra, 0)),
    pago: redondear(listaColaboradores.reduce((s, c) => s + c.pago, 0))
  };

  return {
    desde,
    hasta,
    umbral,
    moneda,
    tarifa_defecto: tarifaDefecto,
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

    if (!req.esAdmin) {
      if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) {
        throw new HttpError(401, 'Se requiere iniciar sesión para consultar reportes.');
      }
      await exigirAccesoColaborador(req, colaboradorId);
    }

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
    exigirAdmin(req);
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
        `Tarifa/h (${reporte.moneda})`,
        `Pago (${reporte.moneda})`,
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
          numeroCSV(turno.tarifa_hora || 0),
          numeroCSV(turno.pago || 0),
          turno.notas
        ]
          .map(celdaCSV)
          .join(';')
      );
    }

    lineas.push('');
    lineas.push(
      [
        'Totales',
        '',
        '',
        '',
        '',
        numeroCSV(reporte.totales.pausa_minutos),
        numeroCSV(reporte.totales.horas),
        numeroCSV(reporte.totales.extra),
        '',
        numeroCSV(reporte.totales.pago),
        ''
      ]
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

const exceljs = require('exceljs');

/* ==================================================================
 * [ETIQUETA: EXPORTACIÓN A EXCEL (.XLSX)]
 * Qué hace: Genera un libro Excel con hoja "Resumen" y hoja "Registros"
 * usando ExcelJS con estilos, totales y autofiltro.
 * ================================================================== */

app.get(
  '/api/reportes/excel',
  ruta(async (req, res) => {
    exigirAdmin(req);
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

    const config = await leerConfig();
    const nombreTienda = config.nombre_tienda || 'Mi Tienda';

    const libro = new exceljs.Workbook();
    libro.creator = 'TurnoYa';
    libro.created = new Date();
    libro.properties.title = `Reporte de horas ${desde} a ${hasta}`;

    const colorEncabezado = '1F3864';
    const colorSub = 'D9E2F3';
    const colorTotales = 'FFF2CC';
    const moneda = reporte.moneda || 'S/';
    const fmtMoneda = `"${moneda.replaceAll('"', '')} "#,##0.00`;

    /* ---------------- Hoja: Resumen ---------------- */
    const hojaResumen = libro.addWorksheet('Resumen', {
      properties: { tabColor: { argb: '1F3864' } }
    });

    hojaResumen.columns = [
      { width: 34 },
      { width: 18 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
      { width: 16 }
    ];

    hojaResumen.mergeCells('A1:I1');
    const titulo = hojaResumen.getCell('A1');
    titulo.value = `Control de Horas y Nómina · ${nombreTienda}`;
    titulo.font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorEncabezado } };
    titulo.alignment = { vertical: 'middle', horizontal: 'center' };
    hojaResumen.getRow(1).height = 26;

    hojaResumen.mergeCells('A2:I2');
    const subtitulo = hojaResumen.getCell('A2');
    subtitulo.value = `Reporte del ${fechaCorta(desde)} al ${fechaCorta(hasta)} · Jornada diaria de ${reporte.umbral} h`;
    subtitulo.font = { size: 11, italic: true, color: { argb: '404040' } };
    subtitulo.alignment = { vertical: 'middle', horizontal: 'center' };
    hojaResumen.getRow(2).height = 18;

    hojaResumen.mergeCells('A3:I3');
    const generado = hojaResumen.getCell('A3');
    generado.value = `Generado el ${fechaCorta(hoyISO())} a las ${horaCorta(aISOlocal())} · TurnoYa ${VERSION}`;
    generado.font = { size: 9, color: { argb: '808080' } };
    generado.alignment = { vertical: 'middle', horizontal: 'center' };

    let fila = 5;
    hojaResumen.getCell(`A${fila}`).value = 'TOTALES DEL PERIODO';
    hojaResumen.getCell(`A${fila}`).font = { bold: true, size: 12, color: { argb: colorEncabezado } };
    fila += 1;

    const totales = [
      ['Horas trabajadas', reporte.totales.horas, 'h'],
      ['Horas extra', reporte.totales.extra, 'h'],
      ['Pago total estimado', reporte.totales.pago, moneda],
      ['Turnos completados', reporte.totales.turnos, 'turnos'],
      ['Colaboradores', reporte.totales.colaboradores, 'personas'],
      ['Días con actividad', reporte.totales.dias, 'días'],
      ['Pausas (minutos)', reporte.totales.pausa_minutos, 'min']
    ];
    for (const [etiqueta, valor, unidad] of totales) {
      hojaResumen.getCell(`A${fila}`).value = etiqueta;
      hojaResumen.getCell(`A${fila}`).font = { bold: true };
      hojaResumen.getCell(`B${fila}`).value = valor;
      hojaResumen.getCell(`B${fila}`).alignment = { horizontal: 'center' };
      if (unidad === moneda) {
        hojaResumen.getCell(`B${fila}`).numFmt = fmtMoneda;
        hojaResumen.getCell(`B${fila}`).font = { bold: true };
      } else if (unidad === 'h' || unidad === 'min') {
        hojaResumen.getCell(`B${fila}`).numFmt = '0.00';
      }
      hojaResumen.getCell(`C${fila}`).value = unidad;
      hojaResumen.getCell(`C${fila}`).font = { size: 9, color: { argb: '808080' } };
      fila += 1;
    }

    fila += 1;
    hojaResumen.getCell(`A${fila}`).value = 'RESUMEN POR COLABORADOR';
    hojaResumen.getCell(`A${fila}`).font = { bold: true, size: 12, color: { argb: colorEncabezado } };
    fila += 1;

    const encabezadoColabs = [
      'Colaborador',
      'Puesto',
      'Días',
      'Turnos',
      'Pausas (min)',
      'Horas',
      'Horas extra',
      `Tarifa/h (${moneda})`,
      `Pago (${moneda})`
    ];
    encabezadoColabs.forEach((texto, indice) => {
      const celda = hojaResumen.getCell(fila, indice + 1);
      celda.value = texto;
      celda.font = { bold: true, color: { argb: 'FFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorEncabezado } };
      celda.alignment = { horizontal: 'center', vertical: 'middle' };
      celda.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    hojaResumen.getRow(fila).height = 18;
    fila += 1;

    for (const colaborador of reporte.por_colaborador) {
      hojaResumen.getCell(fila, 1).value = colaborador.colaborador_nombre;
      hojaResumen.getCell(fila, 2).value = colaborador.colaborador_puesto || '—';
      hojaResumen.getCell(fila, 3).value = colaborador.dias;
      hojaResumen.getCell(fila, 4).value = colaborador.turnos;
      hojaResumen.getCell(fila, 5).value = redondear(colaborador.pausa_minutos);
      hojaResumen.getCell(fila, 6).value = redondear(colaborador.horas);
      hojaResumen.getCell(fila, 7).value = redondear(colaborador.extra);
      hojaResumen.getCell(fila, 8).value = redondear(colaborador.tarifa_hora);
      hojaResumen.getCell(fila, 9).value = redondear(colaborador.pago);
      for (let i = 1; i <= 9; i++) {
        const celda = hojaResumen.getCell(fila, i);
        celda.border = {
          top: { style: 'thin', color: { argb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
          left: { style: 'thin', color: { argb: 'D9D9D9' } },
          right: { style: 'thin', color: { argb: 'D9D9D9' } }
        };
        if (i >= 3) celda.alignment = { horizontal: 'center' };
        if (i >= 5 && i <= 7) celda.numFmt = '0.00';
        if (i >= 8) celda.numFmt = fmtMoneda;
      }
      fila += 1;
    }

    // Fila de totales
    const totalesColabs = [
      'TOTALES', '', reporte.totales.dias, reporte.totales.turnos,
      redondear(reporte.totales.pausa_minutos), redondear(reporte.totales.horas),
      redondear(reporte.totales.extra), '', redondear(reporte.totales.pago)
    ];
    totalesColabs.forEach((valor, indice) => {
      const celda = hojaResumen.getCell(fila, indice + 1);
      celda.value = valor;
      celda.font = { bold: true };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorTotales } };
      celda.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
      if (indice >= 2) celda.alignment = { horizontal: 'center' };
      if (indice >= 4 && indice <= 6) celda.numFmt = '0.00';
      if (indice === 8) celda.numFmt = fmtMoneda;
    });
    fila += 2;

    /* ---------------- Hoja: Registros ---------------- */
    const hojaRegistros = libro.addWorksheet('Registros', {
      properties: { tabColor: { argb: '548235' } }
    });

    hojaRegistros.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Colaborador', key: 'colaborador', width: 26 },
      { header: 'Puesto', key: 'puesto', width: 16 },
      { header: 'Entrada', key: 'entrada', width: 10 },
      { header: 'Salida', key: 'salida', width: 10 },
      { header: 'Pausa (min)', key: 'pausa', width: 12 },
      { header: 'Horas', key: 'horas', width: 10 },
      { header: 'Horas extra del día', key: 'extra', width: 14 },
      { header: `Pago (${moneda})`, key: 'pago', width: 14 },
      { header: 'Notas', key: 'notas', width: 30 }
    ];

    hojaRegistros.mergeCells('A1:J1');
    const titulo2 = hojaRegistros.getCell('A1');
    titulo2.value = `Registros de jornada · ${nombreTienda}`;
    titulo2.font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titulo2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorEncabezado } };
    titulo2.alignment = { vertical: 'middle', horizontal: 'center' };
    hojaRegistros.getRow(1).height = 26;

    hojaRegistros.mergeCells('A2:J2');
    const sub2 = hojaRegistros.getCell('A2');
    sub2.value = `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)} · Generado el ${fechaCorta(hoyISO())}`;
    sub2.font = { size: 10, italic: true, color: { argb: '404040' } };
    sub2.alignment = { vertical: 'middle', horizontal: 'center' };

    const encabezado = hojaRegistros.getRow(4);
    hojaRegistros.columns.forEach((columna, indice) => {
      const celda = encabezado.getCell(indice + 1);
      celda.value = columna.header;
      celda.font = { bold: true, color: { argb: 'FFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorEncabezado } };
      celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      celda.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    hojaRegistros.getRow(4).height = 20;

    let filaReg = 5;
    let totalHoras = 0;
    let totalPausa = 0;
    let totalPago = 0;
    for (const turno of reporte.detalle) {
      hojaRegistros.getCell(filaReg, 1).value = turno.fecha;
      hojaRegistros.getCell(filaReg, 2).value = turno.colaborador_nombre;
      hojaRegistros.getCell(filaReg, 3).value = turno.colaborador_puesto || '—';
      hojaRegistros.getCell(filaReg, 4).value = turno.entrada.slice(11, 16);
      hojaRegistros.getCell(filaReg, 5).value = turno.salida ? turno.salida.slice(11, 16) : 'En curso';
      hojaRegistros.getCell(filaReg, 6).value = redondear(turno.pausa_minutos);
      hojaRegistros.getCell(filaReg, 7).value = turno.horas !== null ? redondear(turno.horas) : null;
      hojaRegistros.getCell(filaReg, 8).value = turno.extra_dia ? redondear(turno.extra_dia) : null;
      hojaRegistros.getCell(filaReg, 9).value = turno.horas !== null ? redondear(turno.pago || 0) : null;
      hojaRegistros.getCell(filaReg, 10).value = turno.notas || '';

      for (let i = 1; i <= 10; i++) {
        const celda = hojaRegistros.getCell(filaReg, i);
        celda.border = {
          top: { style: 'thin', color: { argb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
          left: { style: 'thin', color: { argb: 'D9D9D9' } },
          right: { style: 'thin', color: { argb: 'D9D9D9' } }
        };
        if (i === 1 || i === 4 || i === 5) celda.alignment = { horizontal: 'center' };
        if (i >= 6 && i <= 8) {
          celda.alignment = { horizontal: 'center' };
          celda.numFmt = '0.00';
        }
        if (i === 9) {
          celda.alignment = { horizontal: 'center' };
          celda.numFmt = fmtMoneda;
        }
      }
      totalHoras += turno.horas || 0;
      totalPausa += turno.pausa_minutos || 0;
      totalPago += turno.pago || 0;
      filaReg += 1;
    }

    // Fila de totales
    hojaRegistros.getCell(filaReg, 1).value = 'TOTALES';
    hojaRegistros.getCell(filaReg, 6).value = redondear(totalPausa);
    hojaRegistros.getCell(filaReg, 7).value = redondear(totalHoras);
    hojaRegistros.getCell(filaReg, 8).value = redondear(reporte.totales.extra);
    hojaRegistros.getCell(filaReg, 9).value = redondear(totalPago);
    for (let i = 1; i <= 10; i++) {
      const celda = hojaRegistros.getCell(filaReg, i);
      celda.font = { bold: true };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorTotales } };
      celda.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
      if (i >= 6 && i <= 8) {
        celda.alignment = { horizontal: 'center' };
        celda.numFmt = '0.00';
      }
      if (i === 9) {
        celda.alignment = { horizontal: 'center' };
        celda.numFmt = fmtMoneda;
      }
    }
    filaReg += 2;

    if (!reporte.detalle.length) {
      hojaRegistros.getCell(filaReg, 1).value = 'No hay turnos completados en este rango de fechas.';
      hojaRegistros.getCell(filaReg, 1).font = { italic: true, color: { argb: '808080' } };
    }

    hojaRegistros.views = [{ state: 'frozen', ySplit: 4 }];
    hojaRegistros.autoFilter = { from: 'A4', to: 'J4' };

    const buffer = await libro.xlsx.writeBuffer();
    const nombreArchivo = `reporte-horas-${desde}-a-${hasta}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombreArchivo}"`
    );
    res.send(buffer);
  })
);

/* ==================================================================
 * [ETIQUETA: CONFIGURACIÓN, INFO DE RED, SALUD Y RESPALDO]
 * Qué hace: Expone `/api/config`, `/api/info` (IPs LAN), `/api/salud`
 * y `/api/respaldo` (.db en local o .sql en Turso nube).
 * ================================================================== */
app.get(
  '/api/config',
  ruta(async (req, res) => {
    const cfg = await leerConfig();
    if (!req.esAdmin && !req.sesionColabId) {
      res.json({ ...cfg, tarifa_hora_defecto: '0' });
      return;
    }
    res.json(cfg);
  })
);

app.get(
  '/api/info',
  ruta(async (req, res) => {
    exigirAdmin(req);
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
    exigirAdmin(req);
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
    exigirAdmin(req);
    const body = req.body || {};
    if (body.nombre_tienda !== undefined) {
      const nombre = texto(body.nombre_tienda, 60);
      if (!nombre) throw new HttpError(400, 'El nombre de la tienda es obligatorio.');
      await guardarConfig('nombre_tienda', nombre);
    }

    if (body.jornada_horas !== undefined) {
      const horas = Number(body.jornada_horas);
      if (!Number.isFinite(horas) || horas < 1 || horas > 24) {
        throw new HttpError(400, 'La jornada diaria debe estar entre 1 y 24 horas.');
      }
      await guardarConfig('jornada_horas', redondear(horas));
    }

    if (body.moneda !== undefined) {
      const moneda = texto(body.moneda, 8);
      if (!moneda) throw new HttpError(400, 'La moneda no puede estar vacía.');
      await guardarConfig('moneda', moneda);
    }

    if (body.tarifa_hora_defecto !== undefined) {
      const tarifa = Number(body.tarifa_hora_defecto);
      if (!Number.isFinite(tarifa) || tarifa < 0 || tarifa > 100000) {
        throw new HttpError(
          400,
          'La tarifa por hora por defecto debe estar entre 0 y 100000.'
        );
      }
      await guardarConfig('tarifa_hora_defecto', redondear(tarifa));
    }

    res.json(await leerConfig());
  })
);

/* ==================================================================
 * [ETIQUETA: MANEJO CENTRALIZADO DE ERRORES]
 * Qué hace: Convierte HttpError y fallos inesperados en respuestas JSON.
 * ================================================================== */

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

/* ==================================================================
 * [ETIQUETA: ARRANQUE DEL SERVIDOR Y CIERRE LIMPIO]
 * Qué hace: Detecta IPs de red local, prepara SQLite/Turso, inicia HTTP
 * y cierra conexiones de forma segura al recibir SIGINT o SIGTERM.
 * ================================================================== */

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

function imprimir(linea = '') {
  process.stdout.write(`${linea}\n`);
}

async function arrancar() {
  try {
    await preparar();
  } catch (error) {
    console.error('No se pudo preparar la base de datos:', error.message);
    process.exit(1);
  }

  const servidor = app.listen(PORT, HOST, () => {
    imprimir('');
    imprimir(`  TurnoYa ${VERSION} - Control de horas`);
    imprimir('  ----------------------------------------');
    if (esRemota) {
      imprimir('  Base de datos: Turso (nube)');
    } else {
      imprimir(`  Base de datos: ${path.join('data', 'tienda.db')}`);
      imprimir(`  Local:  http://localhost:${PORT}`);
      for (const direccion of direccionesLocales()) {
        imprimir(`  Red:    http://${direccion}:${PORT}`);
      }
    }
    imprimir('');
    imprimir('  Presiona Ctrl+C para detener el servidor.');
    imprimir('');
  });

  let cerrando = false;
  function cerrarServidor(senal) {
    if (cerrando) return;
    cerrando = true;
    imprimir(`\n  Cerrando TurnoYa (${senal})…`);
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
