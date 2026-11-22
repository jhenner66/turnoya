'use strict';

/* ================================================================
   [ETIQUETA: CONSTANTES, ICONOS Y UTILIDADES DEL PORTAL]
   Qué hace: Define selectores DOM, claves de almacenamiento local,
   iconos SVG y funciones de formato de fechas, horas y avatares.
   ================================================================ */

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

const CLAVE_PERSONA = 'turnoya_colaborador_id';
const CLAVE_COLA = 'turnoya_cola_offline';
const CLAVE_CACHE = 'turnoya_cache_colaborador';
const CLAVE_AUTH_COLAB = 'turnoya_auth_colaboradores';
const CLAVE_SESION_ACTIVA = 'turnoya_sesion_colab_id';
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const ICONOS = {
  reloj:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.2 2"></path></svg>',
  pausa:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>',
  calendario:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>',
  extra:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
  pago:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M6 12h.01M18 12h.01"></path></svg>',
  usuarios:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>'
};

const ICONO_PAUSA_MINI =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';

const pad2 = (n) => String(n).padStart(2, '0');

function escapar(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function saludo() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return '☀️ Buenos días';
  if (hora >= 12 && hora < 19) return '🌤️ Buenas tardes';
  return '🌙 Buenas noches';
}

function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

function colorAvatar(nombre) {
  let hash = 0;
  const str = String(nombre || '');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function aplicarEstilosDinamicos(raiz = document) {
  $$('[data-hue]', raiz).forEach((el) => {
    const hue = Number(el.dataset.hue) || 0;
    el.style.background = `hsl(${hue} 70% 90%)`;
    el.style.color = `hsl(${hue} 55% 30%)`;
  });
}

function vibrar(ms = 20) {
  try { navigator?.vibrate?.(ms); } catch { /* sin soporte */ }
}

let servidorHoy = null;

function fechaLocalISO(fecha = new Date()) {
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}`;
}

function fechaHoraLocalISO(fecha = new Date()) {
  return (
    `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}` +
    `T${pad2(fecha.getHours())}:${pad2(fecha.getMinutes())}:${pad2(fecha.getSeconds())}`
  );
}

function hoyISO() {
  return servidorHoy || fechaLocalISO(new Date());
}

function inicioDeMes() {
  const base = servidorHoy ? new Date(`${servidorHoy}T12:00:00`) : new Date();
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-01`;
}

function parseLocal(iso) {
  if (!iso) return null;
  const [parteFecha, parteHora = '00:00:00'] = String(iso).split('T');
  const [anio, mes, dia] = parteFecha.split('-').map(Number);
  const [horas, minutos, segundos] = parteHora.split(':').map(Number);
  const fecha = new Date(anio, mes - 1, dia, horas || 0, minutos || 0, segundos || 0);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function minutosEntreLocal(desdeISO, hastaISO) {
  const d = parseLocal(desdeISO);
  const h = parseLocal(hastaISO);
  if (!d || !h) return 0;
  return Math.max(0, (h - d) / 60000);
}

function horaCorta(iso) {
  if (!iso) return '—';
  return String(iso).slice(11, 16);
}

function fechaCorta(iso) {
  if (!iso) return '—';
  const fecha = parseLocal(`${String(iso).slice(0, 10)}T12:00:00`);
  if (!fecha) return iso;
  return `${DIAS_CORTOS[fecha.getDay()]} ${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]}`;
}

function fechaLarga(fecha) {
  const texto = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatoMinutos(minutos) {
  const total = Math.max(0, Math.round(Number(minutos) || 0));
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

function formatoHoras(horas) {
  const minutos = Math.round(Number(horas || 0) * 60);
  if (minutos <= 0) return '0 h';
  return formatoMinutos(minutos);
}

function monedaActual(override) {
  return String(override || (state && state.config && state.config.moneda) || 'S/').trim() || 'S/';
}

function formatoMoneda(monto, moneda) {
  const numero = Number(monto || 0);
  const textoNum = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(numero) ? numero : 0);
  return `${monedaActual(moneda)} ${textoNum}`;
}

function tarifaEfectivaPersona(persona) {
  if (
    persona &&
    persona.tarifa_hora !== null &&
    persona.tarifa_hora !== undefined &&
    persona.tarifa_hora !== ''
  ) {
    return Number(persona.tarifa_hora) || 0;
  }
  if (state.reporte && state.reporte.tarifa_defecto !== undefined) {
    return Number(state.reporte.tarifa_defecto) || 0;
  }
  return Number((state.config && state.config.tarifa_hora_defecto) || 0) || 0;
}

function duracionDesdeDatos({ entrada, pausaMin, pausaInicio }) {
  if (!entrada) return '0 min';
  const inicio = parseLocal(entrada);
  if (!inicio) return '0 min';
  const ahora = new Date();
  let minutos = (ahora - inicio) / 60000;
  minutos -= Number(pausaMin || 0);
  if (pausaInicio) {
    const inicioPausa = parseLocal(pausaInicio);
    if (inicioPausa) minutos -= (ahora - inicioPausa) / 60000;
  }
  return formatoMinutos(Math.max(0, minutos));
}

function insigniaEstado(turno) {
  if (!turno) return '<span class="badge badge-off">Fuera de turno</span>';
  const sufijoOffline = turno.pendiente_offline ? ' · ☁️' : '';
  if (turno.en_pausa) {
    return `<span class="badge badge-pause has-icon">${ICONO_PAUSA_MINI}En pausa${sufijoOffline}</span>`;
  }
  return `<span class="badge badge-on">En turno${sufijoOffline}</span>`;
}

/* ================================================================
   [ETIQUETA: COLA OFFLINE, CACHÉ LOCAL Y SINCRONIZACIÓN]
   Qué hace: Guarda marcajes sin conexión en localStorage, proyecta el
   estado en vivo mientras no hay Internet y sube la cola al reconectar.
   ================================================================ */

/* ================================================================
   [ETIQUETA: CRIPTOGRAFÍA LOCAL (SHA-256) Y SESIÓN OFFLINE DEL COLABORADOR]
   Qué hace: Verifica el PIN de 4 dígitos incluso sin Internet usando
   el verificador SHA-256 entregado por el servidor y guarda tokens locales.
   ================================================================ */

function sha256Hex(texto) {
  const bytes = new TextEncoder().encode(String(texto ?? ''));
  const rightRotate = (v, amt) => (v >>> amt) | (v << (32 - amt));
  const maxWord = 4294967296;
  const words = [];
  const bitLength = bytes.length * 8;
  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate += 1) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  const padded = new Uint8Array(bytes.length + 1 + ((64 - ((bytes.length + 9) % 64)) % 64) + 8);
  padded.set(bytes, 0);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / maxWord), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  for (let i = 0; i < padded.length; i += 4) {
    words.push(view.getUint32(i, false));
  }

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash.unshift((temp1 + temp2) | 0);
      hash.pop();
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i += 1) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  let res = '';
  for (let i = 0; i < 8; i += 1) {
    res += (hash[i] >>> 0).toString(16).padStart(8, '0');
  }
  return res;
}

function leerMapaAuthColab() {
  try {
    const crudo = localStorage.getItem(CLAVE_AUTH_COLAB);
    const obj = crudo ? JSON.parse(crudo) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function guardarAuthColab(colaboradorId, datos) {
  try {
    const mapa = leerMapaAuthColab();
    mapa[String(colaboradorId)] = {
      ...(mapa[String(colaboradorId)] || {}),
      ...datos
    };
    localStorage.setItem(CLAVE_AUTH_COLAB, JSON.stringify(mapa));
  } catch { /* ignorar */ }
}

function obtenerAuthColab(colaboradorId) {
  if (!colaboradorId) return null;
  const mapa = leerMapaAuthColab();
  return mapa[String(colaboradorId)] || null;
}

function verificarPinOffline(colaboradorId, pin, verificador) {
  if (!verificador || !String(verificador).includes(':')) return false;
  const [sal, esperado] = String(verificador).split(':');
  if (!sal || !esperado) return false;
  return sha256Hex(`${sal}:${colaboradorId}:${pin}`) === esperado;
}

function leerColaOffline() {
  try {
    const crudo = localStorage.getItem(CLAVE_COLA);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function guardarColaOffline(lista) {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(lista));
  } catch { /* memoria llena */ }
  actualizarBannerCola();
}

function encolarAccionOffline(accion) {
  const cola = leerColaOffline();
  const auth = obtenerAuthColab(accion.colaborador_id);
  cola.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...(auth && auth.token ? { token: auth.token } : {}),
    ...accion
  });
  guardarColaOffline(cola);
}

function leerCacheLocal() {
  try {
    const crudo = localStorage.getItem(CLAVE_CACHE);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

function guardarCacheLocal() {
  try {
    localStorage.setItem(
      CLAVE_CACHE,
      JSON.stringify({
        config: state.config,
        colaboradores: state.colaboradores,
        estadoServidor: state.estadoServidor,
        reporte: state.reporte,
        registrosServidor: state.registrosServidor
      })
    );
  } catch { /* ignorar */ }
}

const cacheInicial = leerCacheLocal();

const sesionActivaInicial = (() => {
  const savedPersona = Number(localStorage.getItem(CLAVE_PERSONA)) || null;
  const savedSesion = Number(localStorage.getItem(CLAVE_SESION_ACTIVA)) || null;
  if (savedPersona && savedSesion && savedPersona === savedSesion) return savedPersona;
  return null;
})();

const state = {
  online: navigator.onLine !== false,
  sincronizando: false,
  syncRequierePin: false,
  colaboradorId: sesionActivaInicial,
  colaboradores: (cacheInicial && cacheInicial.colaboradores) || [],
  estadoServidor: (cacheInicial && cacheInicial.estadoServidor) || { activos: [], resumen: {} },
  estado: { activos: [], resumen: {} },
  config: (cacheInicial && cacheInicial.config) || {
    nombre_tienda: 'Mi Tienda',
    jornada_horas: '8',
    moneda: 'S/',
    tarifa_hora_defecto: '0'
  },
  reporte: (cacheInicial && cacheInicial.reporte) || null,
  registrosServidor: (cacheInicial && cacheInicial.registrosServidor) || [],
  registros: [],
  tabMovil: 'jornada',
  busqueda: '',
  desde: inicioDeMes(),
  hasta: hoyISO()
};

// Aplica los marcajes pendientes en el teléfono sobre el último estado conocido del servidor,
// para que el colaborador vea su turno actualizado al instante aunque no tenga Internet.
function recomputarEstadoConCola() {
  const cola = leerColaOffline();
  const activosMap = new Map();
  for (const t of (state.estadoServidor.activos || [])) {
    activosMap.set(t.colaborador_id, { ...t });
  }

  const turnosCerradosOffline = [];

  for (const item of cola) {
    const colabId = Number(item.colaborador_id);
    const colab = state.colaboradores.find((c) => c.id === colabId);
    const actual = activosMap.get(colabId);

    if (item.tipo === 'entrada' && !actual) {
      activosMap.set(colabId, {
        id: `offline-${item.id}`,
        colaborador_id: colabId,
        colaborador_nombre: colab ? colab.nombre : 'Colaborador',
        colaborador_puesto: colab ? colab.puesto : '',
        fecha: item.momento.slice(0, 10),
        entrada: item.momento,
        salida: null,
        pausa_inicio: null,
        pausa_minutos: 0,
        notas: item.notas || '',
        horas: null,
        activo: true,
        en_pausa: false,
        pendiente_offline: true
      });
    } else if (item.tipo === 'pausa' && actual && !actual.en_pausa) {
      actual.pausa_inicio = item.momento;
      actual.en_pausa = true;
      actual.pendiente_offline = true;
    } else if (item.tipo === 'reanudar' && actual && actual.en_pausa) {
      actual.pausa_minutos =
        Number(actual.pausa_minutos || 0) +
        minutosEntreLocal(actual.pausa_inicio, item.momento);
      actual.pausa_inicio = null;
      actual.en_pausa = false;
      actual.pendiente_offline = true;
    } else if (item.tipo === 'salida' && actual) {
      let pausaMin = Number(actual.pausa_minutos || 0);
      if (actual.pausa_inicio) {
        pausaMin += minutosEntreLocal(actual.pausa_inicio, item.momento);
      }
      const horas = Math.max(
        0,
        minutosEntreLocal(actual.entrada, item.momento) / 60 - pausaMin / 60
      );
      turnosCerradosOffline.unshift({
        ...actual,
        salida: item.momento,
        pausa_inicio: null,
        pausa_minutos: Math.round(pausaMin * 100) / 100,
        horas: Math.round(horas * 100) / 100,
        activo: false,
        en_pausa: false,
        pendiente_offline: true
      });
      activosMap.delete(colabId);
    }
  }

  state.estado = {
    ...state.estadoServidor,
    activos: [...activosMap.values()]
  };

  // Combina los registros del servidor con los turnos creados/modificados sin conexión
  const baseRegistros = (state.registrosServidor || []).filter((r) => {
    if (r.colaborador_id !== state.colaboradorId) return false;
    // Si era el turno abierto que ahora se cerró o sigue en activosMap, usamos la versión proyectada
    if (!r.salida) return false;
    return true;
  });

  const mioActivo = activosMap.get(state.colaboradorId);
  const miosCerradosOffline = turnosCerradosOffline.filter(
    (t) => t.colaborador_id === state.colaboradorId
  );

  state.registros = [
    ...(mioActivo ? [mioActivo] : []),
    ...miosCerradosOffline,
    ...baseRegistros
  ];
}

function actualizarBannerCola() {
  const cola = leerColaOffline();
  const banner = $('#sync-banner');
  const texto = $('#sync-text');
  if (!banner || !texto) return;

  if (!cola.length) {
    state.syncRequierePin = false;
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const n = cola.length;
  if (state.sincronizando) {
    texto.textContent = `Subiendo ${n} marcaje${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'} al servidor…`;
  } else if (state.syncRequierePin) {
    texto.textContent = `🔐 Toca "Subir ahora" e ingresa tu PIN para enviar ${n} marcaje${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'}.`;
  } else {
    texto.textContent = `☁️ ${n} marcaje${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'} en tu teléfono · Se subirá${n === 1 ? '' : 'n'} automáticamente al volver Internet.`;
  }
}

async function sincronizarColaOffline(silencioso = false) {
  const cola = leerColaOffline();
  if (!cola.length || state.sincronizando) return false;

  state.sincronizando = true;
  actualizarBannerCola();
  const boton = $('#btn-sincronizar-ahora');
  if (boton) boton.disabled = true;

  try {
    await api('/sincronizar', {
      method: 'POST',
      body: JSON.stringify({ acciones: cola })
    });
    state.syncRequierePin = false;
    guardarColaOffline([]);
    toast(`✓ ${cola.length === 1 ? 'Marcaje pendiente subido' : `${cola.length} marcajes pendientes subidos`} al servidor.`);
    await cargarTodo();
    return true;
  } catch (error) {
    if (!esErrorDeRed(error) && error && error.status === 401) {
      state.syncRequierePin = true;
      actualizarBannerCola();
      if (!silencioso) {
        const primerId = Number(cola[0] && cola[0].colaborador_id);
        const personaPendiente = state.colaboradores.find((c) => c.id === primerId);
        if (personaPendiente && personaPendiente.tiene_pin) {
          abrirModalPinColaborador(personaPendiente, {
            alAutenticar: ({ token }) => {
              const actualizada = leerColaOffline().map((item) =>
                Number(item.colaborador_id) === primerId && token
                  ? { ...item, token }
                  : item
              );
              guardarColaOffline(actualizada);
              sincronizarColaOffline(true);
            }
          });
        } else {
          toast(error.message, 'error');
        }
      }
      return false;
    }
    if (!silencioso) {
      toast('Todavía no hay conexión. Tus marcajes siguen seguros en el teléfono.', 'error');
    }
    return false;
  } finally {
    state.sincronizando = false;
    if (boton) boton.disabled = false;
    actualizarBannerCola();
  }
}

/* ================================================================
   [ETIQUETA: COMUNICACIÓN CON SERVIDOR, TOASTS Y CONFIRMACIÓN]
   Qué hace: Ejecuta peticiones `/api`, detecta caídas de red para
   activar el modo offline, muestra notificaciones y confirma salida.
   ================================================================ */

function esErrorDeRed(error) {
  return Boolean(error && error.esOffline);
}

async function api(ruta, opciones = {}) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 12000);
  const config = {
    ...opciones,
    headers: {
      'X-TurnoYa-Cliente': '1',
      'X-TurnoYa-Vista': 'colaborador',
      ...(opciones.headers || {})
    },
    signal: controlador.signal
  };
  const colabIdToken = opciones.colaboradorIdToken || state.colaboradorId;
  const authColab = obtenerAuthColab(colabIdToken);
  if (authColab && authColab.token) {
    config.headers['X-TurnoYa-Colab-Token'] = authColab.token;
  }
  if (opciones.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
  }

  try {
    const respuesta = await fetch(`/api${ruta}`, config);
    let datos = null;
    const tipo = respuesta.headers.get('content-type') || '';
    if (tipo.includes('application/json')) {
      datos = await respuesta.json().catch(() => null);
    }
    if ([502, 503, 504].includes(respuesta.status)) {
      marcarConexion(false);
      const err = new Error('Sin conexión con el servidor.');
      err.esOffline = true;
      throw err;
    }
    marcarConexion(true);
    if (!respuesta.ok) {
      const err = new Error((datos && datos.error) || `Error ${respuesta.status}`);
      err.status = respuesta.status;
      throw err;
    }
    return datos;
  } catch (error) {
    if (error && (error.name === 'AbortError' || error instanceof TypeError)) {
      marcarConexion(false);
      const err = new Error('Sin conexión con el servidor.');
      err.esOffline = true;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(temporizador);
  }
}

function marcarConexion(online) {
  const estabaOffline = !state.online;
  state.online = Boolean(online);
  const banner = $('#connection-banner');
  if (banner) banner.classList.toggle('hidden', state.online);
  if (state.online && estabaOffline) {
    toast('Conexión restablecida.');
    if (leerColaOffline().length) {
      sincronizarColaOffline(true);
    }
  }
}

function toast(mensaje, tipo = 'ok') {
  const raiz = $('#toast-root');
  if (!raiz) return;
  while (raiz.children.length >= 3) raiz.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `toast${tipo === 'error' ? ' error' : ''}`;
  el.textContent = mensaje;
  raiz.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }, 3600);
}

function confirmarSalida({ nombre, turno, onConfirmar }) {
  const raiz = $('#modal-root');
  raiz.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div><h2>Marcar salida</h2></div>
          <button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body">
          <div class="confirm-icon">${ICONOS.reloj}</div>
          <p class="confirm-text">
            ¿Terminar tu jornada, <strong>${escapar(nombre)}</strong>?<br />
            Entraste a las <strong>${horaCorta(turno.entrada)}</strong> y llevas
            <strong>${duracionDesdeDatos({ entrada: turno.entrada, pausaMin: turno.pausa_minutos, pausaInicio: turno.pausa_inicio })}</strong> trabajando.
          </p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn ghost" data-cerrar>Cancelar</button>
          <button type="button" class="btn primary" id="btn-confirmar-salida">Sí, marcar salida</button>
        </div>
      </div>
    </div>
  `;
  const cerrar = () => { raiz.innerHTML = ''; };
  $$('[data-cerrar]', raiz).forEach((b) => b.addEventListener('click', cerrar));
  $('#btn-confirmar-salida', raiz).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await onConfirmar();
      cerrar();
    } catch (err) {
      toast(err.message, 'error');
      cerrar();
    }
  });
}

/* ================================================================
   [ETIQUETA: SELECTOR DE PERSONA Y TARJETA DE JORNADA EN VIVO]
   Qué hace: Muestra la pantalla inicial de selección por nombre o el
   panel de fichaje con cronómetro, nota de entrada y botones de turno.
   ================================================================ */
function colaboradorActual() {
  return state.colaboradores.find((c) => c.id === state.colaboradorId) || null;
}

function turnoActivoActual() {
  return (state.estado.activos || []).find((t) => t.colaborador_id === state.colaboradorId) || null;
}

function render() {
  recomputarEstadoConCola();
  actualizarBannerCola();

  const persona = colaboradorActual();
  const seleccion = $('#vista-seleccion');
  const panel = $('#vista-panel');
  const btnCambiar = $('#btn-cambiar-persona');

  $('#saludo-seleccion').textContent = `${saludo()}, ¿quién eres?`;

  if (!persona) {
    seleccion.classList.remove('hidden');
    panel.classList.add('hidden');
    btnCambiar.classList.add('hidden');
    renderListaPersonas();
    return;
  }

  seleccion.classList.add('hidden');
  panel.classList.remove('hidden');
  btnCambiar.classList.remove('hidden');
  panel.dataset.tab = state.tabMovil;
  renderJornada(persona);
  renderMisRegistros(state.registros);
}

function renderListaPersonas() {
  const contenedor = $('#lista-personas');
  const activosPorId = new Map((state.estado.activos || []).map((t) => [t.colaborador_id, t]));
  const busqueda = state.busqueda.trim().toLowerCase();

  const disponibles = state.colaboradores.filter((c) => {
    if (!c.activo && !activosPorId.has(c.id)) return false;
    if (!busqueda) return true;
    return `${c.nombre} ${c.puesto}`.toLowerCase().includes(busqueda);
  });

  if (!disponibles.length) {
    contenedor.innerHTML = `
      <div class="empty-state">
        ${ICONOS.usuarios}
        <strong>${state.colaboradores.length ? 'No encontramos tu nombre' : 'Sin conexión para cargar la lista'}</strong>
        <p>${state.colaboradores.length ? 'Prueba buscando con otras letras.' : 'Conéctate a Internet una primera vez para descargar la lista del equipo.'}</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = disponibles
    .map((c) => {
      const turno = activosPorId.get(c.id);
      const iconoPin = c.tiene_pin ? '🔒 ' : '';
      return `
        <button type="button" class="worker-pick-card" data-elegir="${c.id}">
          <div class="avatar avatar-lg" data-hue="${colorAvatar(c.nombre)}">${escapar(iniciales(c.nombre))}</div>
          <div class="worker-pick-info">
            <strong>${escapar(c.nombre)}</strong>
            <span>${iconoPin}${escapar(c.puesto || 'Colaborador')}</span>
          </div>
          ${insigniaEstado(turno)}
        </button>
      `;
    })
    .join('');

  aplicarEstilosDinamicos(contenedor);
}

function renderJornada(persona) {
  const turno = turnoActivoActual();
  const enPausa = Boolean(turno && turno.en_pausa);

  const tarjeta = $('#tarjeta-jornada');
  tarjeta.classList.toggle('is-active', Boolean(turno && !enPausa));
  tarjeta.classList.toggle('is-paused', enPausa);

  const avatar = $('#persona-avatar');
  avatar.textContent = iniciales(persona.nombre);
  avatar.dataset.hue = colorAvatar(persona.nombre);
  aplicarEstilosDinamicos(tarjeta);

  $('#persona-saludo').textContent = saludo();
  $('#persona-nombre').textContent = persona.nombre;
  $('#persona-puesto').textContent = persona.puesto || 'Colaborador';
  $('#persona-estado-badge').innerHTML = insigniaEstado(turno);

  $('#turno-entrada').textContent = turno ? horaCorta(turno.entrada) : '—';
  const trabajadoEl = $('#turno-trabajado');
  trabajadoEl.dataset.entrada = turno ? turno.entrada : '';
  trabajadoEl.dataset.pausaMin = turno ? turno.pausa_minutos : 0;
  trabajadoEl.dataset.pausaInicio = turno && turno.pausa_inicio ? turno.pausa_inicio : '';
  trabajadoEl.textContent = turno
    ? duracionDesdeDatos({
        entrada: turno.entrada,
        pausaMin: turno.pausa_minutos,
        pausaInicio: turno.pausa_inicio
      })
    : '0 min';

  $('#turno-pausa').textContent =
    turno && turno.pausa_minutos ? formatoMinutos(turno.pausa_minutos) : '—';

  const campoNota = $('#campo-nota-entrada');
  if (campoNota) campoNota.classList.toggle('hidden', Boolean(turno));

  const avisoPausa = $('#aviso-pausa');
  if (enPausa) {
    avisoPausa.classList.remove('hidden');
    avisoPausa.innerHTML = `En pausa desde las <strong>${horaCorta(turno.pausa_inicio)}</strong> · <strong data-pause-timer data-pausa-inicio="${turno.pausa_inicio}">—</strong>`;
  } else if (turno && turno.notas) {
    avisoPausa.classList.remove('hidden');
    avisoPausa.innerHTML = `📝 Nota del turno: <strong>${escapar(turno.notas)}</strong>`;
  } else {
    avisoPausa.classList.add('hidden');
    avisoPausa.textContent = '';
  }

  const acciones = $('#acciones-jornada');
  if (!turno) {
    acciones.innerHTML = `
      <button class="btn primary btn-lg" type="button" data-accion="entrada">
        Marcar mi entrada
      </button>
    `;
  } else if (enPausa) {
    acciones.innerHTML = `
      <button class="btn primary btn-lg" type="button" data-accion="reanudar" data-turno="${turno.id}">
        Reanudar mi turno
      </button>
      <button class="btn dark btn-lg" type="button" data-accion="salida" data-turno="${turno.id}">
        Marcar mi salida
      </button>
    `;
  } else {
    acciones.innerHTML = `
      <button class="btn ghost btn-lg" type="button" data-accion="pausa" data-turno="${turno.id}">
        Iniciar pausa
      </button>
      <button class="btn dark btn-lg" type="button" data-accion="salida" data-turno="${turno.id}">
        Marcar mi salida
      </button>
    `;
  }

  actualizarReloj();
}

/* ================================================================
   [ETIQUETA: EJECUCIÓN ONLINE / OFFLINE DE MARCAJES]
   Qué hace: Intenta registrar entrada, pausa, reanudación o salida en el
   servidor y, si falla la red, lo guarda en la cola offline del teléfono.
   ================================================================ */
async function ejecutarOEncolarMarcaje({ tipo, turnoId, notas = '' }) {
  const persona = colaboradorActual();
  if (!persona) return;
  const momento = fechaHoraLocalISO(new Date());
  const nombreCorto = persona.nombre.split(' ')[0];

  // Si ya hay marcajes previos en cola para este colaborador o el turno actual fue creado offline,
  // encolamos también este marcaje para respetar el orden cronológico exacto, e intentamos subir toda la cola.
  const hayColaPrevia = leerColaOffline().some((item) => Number(item.colaborador_id) === persona.id);
  const esTurnoOffline = String(turnoId || '').startsWith('offline-');

  if (!hayColaPrevia && !esTurnoOffline) {
    try {
      if (tipo === 'entrada') {
        await api('/turnos/entrada', {
          method: 'POST',
          body: JSON.stringify({ colaborador_id: persona.id, momento, notas })
        });
        vibrar(30);
        toast(`¡Buen turno, ${nombreCorto}! Entrada registrada.`);
      } else if (tipo === 'pausa') {
        await api(`/turnos/${turnoId}/pausa/iniciar`, {
          method: 'POST',
          body: JSON.stringify({ momento })
        });
        vibrar();
        toast('Pausa iniciada. ¡Buen descanso!');
      } else if (tipo === 'reanudar') {
        await api(`/turnos/${turnoId}/pausa/finalizar`, {
          method: 'POST',
          body: JSON.stringify({ momento })
        });
        vibrar();
        toast('Turno reanudado.');
      } else if (tipo === 'salida') {
        await api(`/turnos/${turnoId}/salida`, {
          method: 'POST',
          body: JSON.stringify({ momento })
        });
        vibrar(35);
        toast(`¡Hasta luego, ${nombreCorto}! Salida registrada.`);
      }
      await Promise.all([refrescarEstado(true), cargarMisDatos(true)]);
      return;
    } catch (error) {
      if (!esErrorDeRed(error)) {
        if (error && error.status === 401 && persona.tiene_pin) {
          abrirModalPinColaborador(persona, {
            alAutenticar: () => {
              ejecutarOEncolarMarcaje({ tipo, turnoId, notas }).catch((e) =>
                toast(e.message, 'error')
              );
            }
          });
          return;
        }
        throw error;
      }
      // Si falló por falta de Internet, cae al guardado offline de abajo
    }
  }

  encolarAccionOffline({
    colaborador_id: persona.id,
    tipo,
    momento,
    notas
  });
  vibrar(30);
  render();

  if (hayColaPrevia && state.online) {
    await sincronizarColaOffline(true);
    return;
  }

  const mensajesOffline = {
    entrada: `☁️ Entrada (${horaCorta(momento)}) guardada en tu teléfono. Se subirá al volver Internet.`,
    pausa: `☁️ Pausa (${horaCorta(momento)}) guardada en tu teléfono. Se subirá al volver Internet.`,
    reanudar: `☁️ Reanudación (${horaCorta(momento)}) guardada en tu teléfono.`,
    salida: `☁️ Salida (${horaCorta(momento)}) guardada en tu teléfono. Se subirá al volver Internet.`
  };
  toast(mensajesOffline[tipo] || '☁️ Marcaje guardado en el teléfono.');
}

/* ================================================================
   [ETIQUETA: RESUMEN PERSONAL Y TABLA DE MIS REGISTROS]
   Qué hace: Carga y dibuja los totales de horas del colaborador y su
   historial propio (solo lectura), incluyendo turnos pendientes de subir.
   ================================================================ */
async function cargarMisDatos(silencioso = false) {
  const persona = colaboradorActual();
  if (!persona) return;

  const params = new URLSearchParams({
    desde: state.desde,
    hasta: state.hasta,
    colaborador_id: String(persona.id)
  });

  try {
    const [reporte, registros] = await Promise.all([
      api(`/reportes?${params.toString()}`),
      api(`/turnos?${params.toString()}`)
    ]);
    state.reporte = reporte;
    state.registrosServidor = registros;
    guardarCacheLocal();
    recomputarEstadoConCola();
    renderMiResumen(persona, state.reporte);
    renderMisRegistros(state.registros);
  } catch (error) {
    if (!esErrorDeRed(error) && error && error.status === 401) {
      if (persona.tiene_pin) {
        cerrarSesionPersona({ silencioso: true });
      }
      return;
    }
    recomputarEstadoConCola();
    if (state.reporte) renderMiResumen(persona, state.reporte);
    renderMisRegistros(state.registros);
    if (!silencioso && !esErrorDeRed(error)) toast(error.message, 'error');
  }
}

function renderMiResumen(persona, reporte) {
  if (!reporte) return;
  const t = reporte.totales || { horas: 0, extra: 0, turnos: 0, dias: 0, pausa_minutos: 0, pago: 0 };
  const moneda = monedaActual(reporte.moneda);
  const tarifa = tarifaEfectivaPersona(persona);
  const mostrarPago = tarifa > 0 || (t.pago || 0) > 0;

  $('#rango-texto').textContent = `Del ${fechaCorta(reporte.desde)} al ${fechaCorta(reporte.hasta)} · Jornada diaria de ${formatoHoras(reporte.umbral)}`;

  const cajaTexto = $('#mi-resumen-texto');
  if (!t.turnos) {
    cajaTexto.innerHTML = `Aún no tienes turnos completados entre el <strong>${escapar(fechaCorta(reporte.desde))}</strong> y el <strong>${escapar(fechaCorta(reporte.hasta))}</strong>.`;
  } else {
    const extraTxt = t.extra > 0
      ? `Incluye <strong class="cell-extra-on">${formatoHoras(t.extra)} de horas extra</strong>.`
      : 'Sin horas extra en este periodo.';
    const pagoTxt = mostrarPago
      ? ` Pago estimado: <strong class="cell-pay">${formatoMoneda(t.pago || 0, moneda)}</strong>.`
      : '';
    cajaTexto.innerHTML = `Hola <strong>${escapar(persona.nombre.split(' ')[0])}</strong>: del <strong>${escapar(fechaCorta(reporte.desde))}</strong> al <strong>${escapar(fechaCorta(reporte.hasta))}</strong> llevas <strong>${formatoHoras(t.horas)} trabajadas</strong> en <strong>${t.dias} día${t.dias === 1 ? '' : 's'}</strong> (${t.turnos} turno${t.turnos === 1 ? '' : 's'}). ${extraTxt}${pagoTxt}`;
  }

  $('#mis-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue">${ICONOS.reloj}</div>
      <div class="stat-body">
        <span class="stat-value">${formatoHoras(t.horas)}</span>
        <span class="stat-label">Mis horas trabajadas</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber">${ICONOS.extra}</div>
      <div class="stat-body">
        <span class="stat-value">${formatoHoras(t.extra)}</span>
        <span class="stat-label">Mis horas extra</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${ICONOS.calendario}</div>
      <div class="stat-body">
        <span class="stat-value">${t.dias}</span>
        <span class="stat-label">Días trabajados</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon violet">${ICONOS.pausa}</div>
      <div class="stat-body">
        <span class="stat-value">${t.pausa_minutos ? formatoMinutos(t.pausa_minutos) : '0 min'}</span>
        <span class="stat-label">Pausas totales</span>
      </div>
    </div>
    ${
      mostrarPago
        ? `
      <div class="stat-card">
        <div class="stat-icon emerald">${ICONOS.pago}</div>
        <div class="stat-body">
          <span class="stat-value">${formatoMoneda(t.pago || 0, moneda)}</span>
          <span class="stat-label">Mi pago estimado</span>
        </div>
      </div>`
        : ''
    }
  `;
}

function renderMisRegistros(registros) {
  const cuerpo = $('#mis-registros-body');
  const pie = $('#mis-registros-foot');
  const nota = $('#mis-registros-nota');
  if (!cuerpo || !pie || !nota) return;

  if (!registros.length) {
    cuerpo.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">No tienes registros en este rango de fechas.</td>
      </tr>
    `;
    pie.innerHTML = '';
    nota.textContent = '';
    return;
  }

  const persona = colaboradorActual();
  const tarifa = tarifaEfectivaPersona(persona);
  const moneda = monedaActual(state.reporte && state.reporte.moneda);

  const porIdReporte = new Map();
  if (state.reporte && Array.isArray(state.reporte.detalle)) {
    for (const d of state.reporte.detalle) {
      porIdReporte.set(d.id, { extra: d.extra_dia || 0, pago: d.pago || 0 });
    }
  }

  let totalHoras = 0;
  let totalPausa = 0;
  let pagoOfflineCerrado = 0;

  cuerpo.innerHTML = registros
    .map((turno) => {
      totalHoras += turno.horas || 0;
      totalPausa += turno.pausa_minutos || 0;
      const infoRep = porIdReporte.get(turno.id);
      const extraDia = infoRep ? infoRep.extra : 0;
      const pagoTurno = infoRep
        ? infoRep.pago
        : turno.horas !== null && tarifa > 0
          ? Math.round(turno.horas * tarifa * 100) / 100
          : 0;
      if (turno.pendiente_offline && turno.horas !== null) {
        pagoOfflineCerrado += pagoTurno;
      }
      const insignia = turno.activo
        ? insigniaEstado(turno)
        : turno.pendiente_offline
          ? '<span class="badge badge-pause">☁️ Pendiente de subir</span>'
          : '<span class="badge badge-info">Completado</span>';

      return `
        <tr>
          <td class="cell-mono" data-label="Fecha">
            <div>
              <strong>${fechaCorta(turno.fecha)}</strong>
              ${turno.notas ? `<small class="row-note">📝 ${escapar(turno.notas)}</small>` : ''}
            </div>
          </td>
          <td class="cell-mono" data-label="Entrada">${horaCorta(turno.entrada)}</td>
          <td class="cell-mono" data-label="Salida">${turno.salida ? horaCorta(turno.salida) : '—'}</td>
          <td class="cell-mono" data-label="Pausa">${turno.pausa_minutos ? formatoMinutos(turno.pausa_minutos) : '—'}</td>
          <td class="cell-mono" data-label="Horas"><strong>${turno.horas !== null ? formatoHoras(turno.horas) : 'En curso'}</strong></td>
          <td class="cell-mono${extraDia ? ' cell-extra-on' : ''}" data-label="Extra del día">${extraDia ? formatoHoras(extraDia) : '—'}</td>
          <td class="cell-mono${pagoTurno > 0 ? ' cell-pay' : ''}" data-label="Pago">${pagoTurno > 0 ? formatoMoneda(pagoTurno, moneda) : '—'}</td>
          <td data-label="Estado">${insignia}</td>
        </tr>
      `;
    })
    .join('');

  const totalExtra = (state.reporte && state.reporte.totales && state.reporte.totales.extra) || 0;
  const totalPagoFinal =
    state.reporte && state.reporte.totales
      ? Math.round((Number(state.reporte.totales.pago || 0) + pagoOfflineCerrado) * 100) / 100
      : tarifa > 0
        ? Math.round(totalHoras * tarifa * 100) / 100
        : 0;
  const mostrarPagoTotal = tarifa > 0 || totalPagoFinal > 0;

  pie.innerHTML = `
    <tr class="total-row">
      <td>Totales</td>
      <td></td>
      <td></td>
      <td data-label="Pausa">${totalPausa ? formatoMinutos(totalPausa) : '—'}</td>
      <td data-label="Horas">${formatoHoras(totalHoras)}</td>
      <td data-label="Extra del día">${totalExtra ? formatoHoras(totalExtra) : '—'}</td>
      <td data-label="Pago">${mostrarPagoTotal ? formatoMoneda(totalPagoFinal, moneda) : '—'}</td>
      <td></td>
    </tr>
  `;

  const notaPago = mostrarPagoTotal ? ` · ${formatoMoneda(totalPagoFinal, moneda)}` : '';
  nota.textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'} · ${formatoHoras(totalHoras)} trabajadas${notaPago}`;
}

function activarPersonaAutenticada(id) {
  state.colaboradorId = id ? Number(id) : null;
  if (state.colaboradorId) {
    localStorage.setItem(CLAVE_PERSONA, String(state.colaboradorId));
    localStorage.setItem(CLAVE_SESION_ACTIVA, String(state.colaboradorId));
  } else {
    localStorage.removeItem(CLAVE_PERSONA);
    localStorage.removeItem(CLAVE_SESION_ACTIVA);
  }
  render();
  if (state.colaboradorId) {
    cargarMisDatos(true);
  }
}

function abrirModalPinColaborador(persona, { alAutenticar } = {}) {
  const raiz = $('#modal-root');
  raiz.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>Hola, ${escapar(persona.nombre.split(' ')[0])}</h2>
            <p class="muted">Ingresa tu PIN personal de 4 dígitos para entrar.</p>
          </div>
          <button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">×</button>
        </div>
        <form id="form-pin-colaborador">
          <div class="modal-body">
            <label class="field">
              <span>PIN personal (4 dígitos)</span>
              <input type="password" class="pin-input" id="input-pin-colab" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" autocomplete="off" required />
            </label>
            <p class="auth-error hidden" id="pin-colab-error"></p>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn ghost" data-cerrar>Cancelar</button>
            <button type="submit" class="btn primary" id="btn-confirmar-pin">Entrar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const cerrar = () => { raiz.innerHTML = ''; };
  $$('[data-cerrar]', raiz).forEach((b) => b.addEventListener('click', cerrar));

  const input = $('#input-pin-colab', raiz);
  const errEl = $('#pin-colab-error', raiz);
  const btn = $('#btn-confirmar-pin', raiz);
  setTimeout(() => input && input.focus(), 40);

  $('#form-pin-colaborador', raiz).addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const pin = String(input.value || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      errEl.textContent = 'Escribe los 4 dígitos numéricos de tu PIN.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    try {
      const resp = await api('/auth/colaborador/login', {
        method: 'POST',
        colaboradorIdToken: persona.id,
        body: JSON.stringify({ colaborador_id: persona.id, pin })
      });
      guardarAuthColab(persona.id, {
        token: resp.token || '',
        verificador_offline: resp.verificador_offline || null,
        tarifa_hora: resp.colaborador ? resp.colaborador.tarifa_hora : null
      });
      if (resp.colaborador) {
        persona.tarifa_hora = resp.colaborador.tarifa_hora;
      }
      cerrar();
      if (typeof alAutenticar === 'function') {
        await alAutenticar(resp);
      } else {
        activarPersonaAutenticada(persona.id);
      }
    } catch (error) {
      if (esErrorDeRed(error)) {
        const authLocal = obtenerAuthColab(persona.id);
        if (
          authLocal &&
          authLocal.verificador_offline &&
          verificarPinOffline(persona.id, pin, authLocal.verificador_offline)
        ) {
          persona.tarifa_hora = authLocal.tarifa_hora ?? null;
          cerrar();
          toast('Acceso sin conexión verificado.');
          if (typeof alAutenticar === 'function') {
            await alAutenticar({ token: authLocal.token || '', offline: true });
          } else {
            activarPersonaAutenticada(persona.id);
          }
          return;
        }
        errEl.textContent =
          authLocal && authLocal.verificador_offline
            ? 'PIN incorrecto.'
            : 'Necesitas Internet la primera vez que usas tu PIN en este teléfono.';
      } else {
        errEl.textContent = error.message;
      }
      errEl.classList.remove('hidden');
      input.select();
    } finally {
      btn.disabled = false;
    }
  });
}

async function intentarElegirPersona(id) {
  const persona = state.colaboradores.find((c) => c.id === Number(id));
  if (!persona) return;

  if (persona.tiene_pin) {
    abrirModalPinColaborador(persona);
    return;
  }

  try {
    const resp = await api('/auth/colaborador/login', {
      method: 'POST',
      colaboradorIdToken: persona.id,
      body: JSON.stringify({ colaborador_id: persona.id })
    });
    if (resp && resp.token) {
      guardarAuthColab(persona.id, {
        token: resp.token,
        verificador_offline: null,
        tarifa_hora: resp.colaborador ? resp.colaborador.tarifa_hora : null
      });
      if (resp.colaborador) persona.tarifa_hora = resp.colaborador.tarifa_hora;
    }
  } catch (err) {
    if (!esErrorDeRed(err)) {
      toast(err.message, 'error');
      return;
    }
  }
  activarPersonaAutenticada(persona.id);
}

function cerrarSesionPersona({ silencioso = false } = {}) {
  const prevId = state.colaboradorId;
  if (prevId) {
    const prevAuth = obtenerAuthColab(prevId);
    if (prevAuth) {
      // Borra el token activo para exigir PIN de nuevo al tocar el perfil,
      // conservando verificador_offline para desbloquear sin Internet.
      guardarAuthColab(prevId, { token: null });
    }
  }
  if (!silencioso) {
    api('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ tipo: 'colab' })
    }).catch(() => {});
  }
  state.colaboradorId = null;
  state.reporte = null;
  state.registrosServidor = [];
  state.registros = [];
  localStorage.removeItem(CLAVE_PERSONA);
  localStorage.removeItem(CLAVE_SESION_ACTIVA);
  guardarCacheLocal();
  render();
}

function rangoRapido(tipo) {
  const hoy = new Date();
  const iso = fechaLocalISO;
  if (tipo === 'hoy') return { desde: iso(hoy), hasta: iso(hoy) };
  if (tipo === 'semana') {
    const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const desplazamiento = (lunes.getDay() + 6) % 7;
    lunes.setDate(lunes.getDate() - desplazamiento);
    return { desde: iso(lunes), hasta: iso(hoy) };
  }
  if (tipo === 'mes-anterior') {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { desde: iso(primero), hasta: iso(ultimo) };
  }
  return { desde: `${hoy.getFullYear()}-${pad2(hoy.getMonth() + 1)}-01`, hasta: iso(hoy) };
}

/* ================================================================
   [ETIQUETA: RELOJ EN VIVO, EVENTOS Y ARRANQUE DEL PORTAL]
   Qué hace: Registra Service Worker, restaura caché al instante, escucha
   eventos online/offline y reintenta sincronización cada 10 segundos.
   ================================================================ */
function actualizarReloj() {
  const ahora = new Date();
  const reloj = $('#live-clock');
  const fecha = $('#live-date');
  if (reloj) reloj.textContent = `${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}:${pad2(ahora.getSeconds())}`;
  if (fecha) fecha.textContent = fechaLarga(ahora);

  const trabajadoEl = $('#turno-trabajado');
  if (trabajadoEl && trabajadoEl.dataset.entrada) {
    trabajadoEl.textContent = duracionDesdeDatos({
      entrada: trabajadoEl.dataset.entrada,
      pausaMin: trabajadoEl.dataset.pausaMin,
      pausaInicio: trabajadoEl.dataset.pausaInicio
    });
  }

  $$('[data-pause-timer]').forEach((el) => {
    const inicio = parseLocal(el.dataset.pausaInicio);
    if (!inicio) {
      el.textContent = '—';
      return;
    }
    el.textContent = formatoMinutos(Math.max(0, (ahora - inicio) / 60000));
  });
}

async function cargarTodo() {
  const [config, colaboradores, estado, auth] = await Promise.all([
    api('/config'),
    api('/colaboradores'),
    api('/estado'),
    api('/auth/estado').catch(() => null)
  ]);

  state.config = config;
  state.colaboradores = colaboradores.map((c) => {
    const localAuth = obtenerAuthColab(c.id);
    if (localAuth && localAuth.tarifa_hora !== undefined) {
      return { ...c, tarifa_hora: localAuth.tarifa_hora };
    }
    return c;
  });
  state.estadoServidor = estado;

  if (estado && estado.fecha) {
    servidorHoy = estado.fecha;
    state.desde = inicioDeMes();
    state.hasta = servidorHoy;
    $('#filtro-desde').value = state.desde;
    $('#filtro-hasta').value = state.hasta;
  }

  const nombreTienda = config.nombre_tienda || 'Mi Tienda';
  $('#worker-store').textContent = nombreTienda;
  document.title = `Mi Turno · ${nombreTienda}`;

  if (state.colaboradorId && !colaboradorActual()) {
    state.colaboradorId = null;
    localStorage.removeItem(CLAVE_PERSONA);
    localStorage.removeItem(CLAVE_SESION_ACTIVA);
  }

  const persona = colaboradorActual();
  if (persona && auth && Number(auth.colaborador_id) !== persona.id) {
    if (!persona.tiene_pin) {
      try {
        const resp = await api('/auth/colaborador/login', {
          method: 'POST',
          colaboradorIdToken: persona.id,
          body: JSON.stringify({ colaborador_id: persona.id })
        });
        if (resp && resp.token) {
          guardarAuthColab(persona.id, {
            token: resp.token,
            verificador_offline: null,
            tarifa_hora: resp.colaborador ? resp.colaborador.tarifa_hora : null
          });
          if (resp.colaborador) persona.tarifa_hora = resp.colaborador.tarifa_hora;
        }
      } catch { /* ignorar */ }
    } else if (!auth.admin_autenticado) {
      cerrarSesionPersona({ silencioso: true });
    }
  }

  guardarCacheLocal();
  render();
  if (state.colaboradorId) {
    await cargarMisDatos(true);
  }
}

async function refrescarEstado(silencioso = false) {
  try {
    state.estadoServidor = await api('/estado');
    guardarCacheLocal();
    render();
  } catch (err) {
    render();
    if (!silencioso && !esErrorDeRed(err)) toast(err.message, 'error');
  }
}

function conectarEventos() {
  $('#lista-personas').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-elegir]');
    if (!boton) return;
    intentarElegirPersona(Number(boton.dataset.elegir));
  });

  $('#buscar-persona').addEventListener('input', (e) => {
    state.busqueda = e.target.value;
    renderListaPersonas();
  });

  $('#btn-cambiar-persona').addEventListener('click', () => cerrarSesionPersona());

  const navMovil = $('#worker-bottom-nav');
  if (navMovil) {
    navMovil.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-worker-tab]');
      if (!boton) return;
      state.tabMovil = boton.dataset.workerTab;
      const panel = $('#vista-panel');
      if (panel) panel.dataset.tab = state.tabMovil;
      $$('[data-worker-tab]', navMovil).forEach((b) =>
        b.classList.toggle('is-active', b === boton)
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  $('#acciones-jornada').addEventListener('click', async (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton) return;
    const persona = colaboradorActual();
    if (!persona) return;

    const accion = boton.dataset.accion;
    const idTurno = boton.dataset.turno;

    if (accion === 'salida') {
      const turno = turnoActivoActual();
      if (!turno) return;
      confirmarSalida({
        nombre: persona.nombre,
        turno,
        onConfirmar: async () => {
          await ejecutarOEncolarMarcaje({ tipo: 'salida', turnoId: idTurno });
        }
      });
      return;
    }

    boton.disabled = true;
    try {
      const inputNota = $('#input-nota-entrada');
      const notas = accion === 'entrada' && inputNota ? inputNota.value : '';
      await ejecutarOEncolarMarcaje({ tipo: accion, turnoId: idTurno, notas });
      if (accion === 'entrada' && inputNota) inputNota.value = '';
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  document.addEventListener('click', async (e) => {
    const boton = e.target.closest('.quick-ranges [data-rango]');
    if (!boton) return;
    const rango = rangoRapido(boton.dataset.rango);
    state.desde = rango.desde;
    state.hasta = rango.hasta;
    $('#filtro-desde').value = state.desde;
    $('#filtro-hasta').value = state.hasta;
    $$('.quick-ranges .range-btn').forEach((b) =>
      b.classList.toggle('is-active', b === boton)
    );
    await cargarMisDatos();
  });

  $('#filtros-mios').addEventListener('submit', async (e) => {
    e.preventDefault();
    const desde = $('#filtro-desde').value;
    const hasta = $('#filtro-hasta').value;
    if (desde && hasta && desde > hasta) {
      toast('La fecha inicial no puede ser mayor que la final.', 'error');
      return;
    }
    state.desde = desde;
    state.hasta = hasta;
    $$('.quick-ranges .range-btn').forEach((b) => b.classList.remove('is-active'));
    await cargarMisDatos();
  });

  $('#btn-reintentar-conexion').addEventListener('click', async () => {
    try {
      await api('/salud');
      await sincronizarColaOffline(true);
      await cargarTodo();
      toast('Conexión sincronizada.');
    } catch (err) {
      toast('Sigue sin Internet. Tus marcajes están guardados en el teléfono.', 'error');
    }
  });

  const btnSync = $('#btn-sincronizar-ahora');
  if (btnSync) {
    btnSync.addEventListener('click', () => sincronizarColaOffline(false));
  }

  window.addEventListener('online', async () => {
    marcarConexion(true);
    await sincronizarColaOffline(true);
    await cargarTodo().catch(() => {});
  });

  window.addEventListener('offline', () => marcarConexion(false));
}

async function iniciar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  $('#filtro-desde').value = state.desde;
  $('#filtro-hasta').value = state.hasta;
  conectarEventos();
  actualizarReloj();
  setInterval(actualizarReloj, 1000);

  // Renderiza de inmediato con la caché local del teléfono por si no hay Internet
  if (state.colaboradores.length) {
    const nombreTienda = state.config.nombre_tienda || 'Mi Tienda';
    $('#worker-store').textContent = nombreTienda;
    render();
    const persona = colaboradorActual();
    if (persona && state.reporte) renderMiResumen(persona, state.reporte);
  }

  try {
    if (leerColaOffline().length) {
      await sincronizarColaOffline(true);
    }
    await cargarTodo();
  } catch (err) {
    marcarConexion(false);
    render();
  }

  // Reintenta subir marcajes pendientes automáticamente cada 10 segundos
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    if (leerColaOffline().length) {
      await sincronizarColaOffline(true);
    } else if (state.online) {
      refrescarEstado(true);
    }
  }, 10000);
}

document.addEventListener('DOMContentLoaded', iniciar);
