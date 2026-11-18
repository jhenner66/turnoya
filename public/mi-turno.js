'use strict';

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

const CLAVE_PERSONA = 'turnoya_colaborador_id';
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
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
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

function fechaLocalISO(fecha) {
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}`;
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
  if (turno.en_pausa) return `<span class="badge badge-pause has-icon">${ICONO_PAUSA_MINI}En pausa</span>`;
  return '<span class="badge badge-on">En turno</span>';
}

const state = {
  online: true,
  colaboradorId: Number(localStorage.getItem(CLAVE_PERSONA)) || null,
  colaboradores: [],
  estado: { activos: [], resumen: {} },
  config: { nombre_tienda: 'Mi Tienda', jornada_horas: '8' },
  reporte: null,
  registros: [],
  tabMovil: 'jornada',
  busqueda: '',
  desde: inicioDeMes(),
  hasta: hoyISO()
};

async function api(ruta, opciones = {}) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 15000);
  const config = {
    ...opciones,
    headers: { ...(opciones.headers || {}) },
    signal: controlador.signal
  };
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
      throw new Error('No se pudo conectar con el servidor.');
    }
    marcarConexion(true);
    if (!respuesta.ok) {
      throw new Error((datos && datos.error) || `Error ${respuesta.status}`);
    }
    return datos;
  } catch (error) {
    if (error && (error.name === 'AbortError' || error instanceof TypeError)) {
      marcarConexion(false);
      throw new Error('No se pudo conectar con el servidor. Verifica tu conexión.');
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
  if (state.online && estabaOffline) toast('Conexión restablecida.');
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
  }, 3200);
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

function colaboradorActual() {
  return state.colaboradores.find((c) => c.id === state.colaboradorId) || null;
}

function turnoActivoActual() {
  return (state.estado.activos || []).find((t) => t.colaborador_id === state.colaboradorId) || null;
}

function render() {
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
        <strong>${state.colaboradores.length ? 'No encontramos tu nombre' : 'Aún no hay colaboradores registrados'}</strong>
        <p>${state.colaboradores.length ? 'Prueba buscando con otras letras.' : 'Pídele al encargado de la tienda que te agregue en el sistema.'}</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = disponibles
    .map((c) => {
      const turno = activosPorId.get(c.id);
      return `
        <button type="button" class="worker-pick-card" data-elegir="${c.id}">
          <div class="avatar avatar-lg" data-hue="${colorAvatar(c.nombre)}">${escapar(iniciales(c.nombre))}</div>
          <div class="worker-pick-info">
            <strong>${escapar(c.nombre)}</strong>
            <span>${escapar(c.puesto || 'Colaborador')}</span>
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

  const avisoPausa = $('#aviso-pausa');
  if (enPausa) {
    avisoPausa.classList.remove('hidden');
    avisoPausa.innerHTML = `En pausa desde las <strong>${horaCorta(turno.pausa_inicio)}</strong> · <strong data-pause-timer data-pausa-inicio="${turno.pausa_inicio}">—</strong>`;
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
    state.registros = registros;
    renderMiResumen(persona, reporte);
    renderMisRegistros(registros);
  } catch (error) {
    if (!silencioso) toast(error.message, 'error');
  }
}

function renderMiResumen(persona, reporte) {
  if (!reporte) return;
  const t = reporte.totales || { horas: 0, extra: 0, turnos: 0, dias: 0, pausa_minutos: 0 };

  $('#rango-texto').textContent = `Del ${fechaCorta(reporte.desde)} al ${fechaCorta(reporte.hasta)} · Jornada diaria de ${formatoHoras(reporte.umbral)}`;

  const cajaTexto = $('#mi-resumen-texto');
  if (!t.turnos) {
    cajaTexto.innerHTML = `Aún no tienes turnos completados entre el <strong>${escapar(fechaCorta(reporte.desde))}</strong> y el <strong>${escapar(fechaCorta(reporte.hasta))}</strong>.`;
  } else {
    const extraTxt = t.extra > 0
      ? `Incluye <strong class="cell-extra-on">${formatoHoras(t.extra)} de horas extra</strong>.`
      : 'Sin horas extra en este periodo.';
    cajaTexto.innerHTML = `Hola <strong>${escapar(persona.nombre.split(' ')[0])}</strong>: del <strong>${escapar(fechaCorta(reporte.desde))}</strong> al <strong>${escapar(fechaCorta(reporte.hasta))}</strong> llevas <strong>${formatoHoras(t.horas)} trabajadas</strong> en <strong>${t.dias} día${t.dias === 1 ? '' : 's'}</strong> (${t.turnos} turno${t.turnos === 1 ? '' : 's'}). ${extraTxt}`;
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
  `;
}

function renderMisRegistros(registros) {
  const cuerpo = $('#mis-registros-body');
  const pie = $('#mis-registros-foot');
  const nota = $('#mis-registros-nota');

  if (!registros.length) {
    cuerpo.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">No tienes registros en este rango de fechas.</td>
      </tr>
    `;
    pie.innerHTML = '';
    nota.textContent = '';
    return;
  }

  const porDiaExtra = new Map();
  if (state.reporte && Array.isArray(state.reporte.detalle)) {
    for (const d of state.reporte.detalle) {
      porDiaExtra.set(d.id, d.extra_dia || 0);
    }
  }

  let totalHoras = 0;
  let totalPausa = 0;

  cuerpo.innerHTML = registros
    .map((turno) => {
      totalHoras += turno.horas || 0;
      totalPausa += turno.pausa_minutos || 0;
      const extraDia = porDiaExtra.get(turno.id) || 0;
      const insignia = turno.activo
        ? insigniaEstado(turno)
        : '<span class="badge badge-info">Completado</span>';

      return `
        <tr>
          <td class="cell-mono" data-label="Fecha">${fechaCorta(turno.fecha)}</td>
          <td class="cell-mono" data-label="Entrada">${horaCorta(turno.entrada)}</td>
          <td class="cell-mono" data-label="Salida">${turno.salida ? horaCorta(turno.salida) : '—'}</td>
          <td class="cell-mono" data-label="Pausa">${turno.pausa_minutos ? formatoMinutos(turno.pausa_minutos) : '—'}</td>
          <td class="cell-mono" data-label="Horas"><strong>${turno.horas !== null ? formatoHoras(turno.horas) : 'En curso'}</strong></td>
          <td class="cell-mono${extraDia ? ' cell-extra-on' : ''}" data-label="Extra del día">${extraDia ? formatoHoras(extraDia) : '—'}</td>
          <td data-label="Estado">${insignia}</td>
        </tr>
      `;
    })
    .join('');

  const totalExtra = (state.reporte && state.reporte.totales && state.reporte.totales.extra) || 0;
  pie.innerHTML = `
    <tr class="total-row">
      <td>Totales</td>
      <td></td>
      <td></td>
      <td data-label="Pausa">${totalPausa ? formatoMinutos(totalPausa) : '—'}</td>
      <td data-label="Horas">${formatoHoras(totalHoras)}</td>
      <td data-label="Extra del día">${totalExtra ? formatoHoras(totalExtra) : '—'}</td>
      <td></td>
    </tr>
  `;

  nota.textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'} · ${formatoHoras(totalHoras)} trabajadas`;
}

function elegirPersona(id) {
  state.colaboradorId = id ? Number(id) : null;
  if (state.colaboradorId) {
    localStorage.setItem(CLAVE_PERSONA, String(state.colaboradorId));
  } else {
    localStorage.removeItem(CLAVE_PERSONA);
  }
  render();
  if (state.colaboradorId) {
    cargarMisDatos(true);
  }
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
  const [config, colaboradores, estado] = await Promise.all([
    api('/config'),
    api('/colaboradores'),
    api('/estado')
  ]);

  state.config = config;
  state.colaboradores = colaboradores;
  state.estado = estado;

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
  }

  render();
  if (state.colaboradorId) {
    await cargarMisDatos(true);
  }
}

async function refrescarEstado(silencioso = false) {
  try {
    state.estado = await api('/estado');
    render();
  } catch (err) {
    if (!silencioso) toast(err.message, 'error');
  }
}

function conectarEventos() {
  $('#lista-personas').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-elegir]');
    if (!boton) return;
    elegirPersona(Number(boton.dataset.elegir));
  });

  $('#buscar-persona').addEventListener('input', (e) => {
    state.busqueda = e.target.value;
    renderListaPersonas();
  });

  $('#btn-cambiar-persona').addEventListener('click', () => elegirPersona(null));

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
          await api(`/turnos/${idTurno}/salida`, { method: 'POST' });
          vibrar(35);
          toast(`¡Hasta luego, ${persona.nombre.split(' ')[0]}! Salida registrada.`);
          await Promise.all([refrescarEstado(true), cargarMisDatos(true)]);
        }
      });
      return;
    }

    boton.disabled = true;
    try {
      if (accion === 'entrada') {
        await api('/turnos/entrada', {
          method: 'POST',
          body: JSON.stringify({ colaborador_id: persona.id })
        });
        vibrar(30);
        toast(`¡Buen turno, ${persona.nombre.split(' ')[0]}! Entrada registrada.`);
      } else if (accion === 'pausa') {
        await api(`/turnos/${idTurno}/pausa/iniciar`, { method: 'POST' });
        vibrar();
        toast('Pausa iniciada. ¡Buen descanso!');
      } else if (accion === 'reanudar') {
        await api(`/turnos/${idTurno}/pausa/finalizar`, { method: 'POST' });
        vibrar();
        toast('Turno reanudado.');
      }
      await Promise.all([refrescarEstado(true), cargarMisDatos(true)]);
    } catch (err) {
      toast(err.message, 'error');
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
      await cargarTodo();
      toast('Datos actualizados.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function iniciar() {
  $('#filtro-desde').value = state.desde;
  $('#filtro-hasta').value = state.hasta;
  conectarEventos();
  actualizarReloj();
  setInterval(actualizarReloj, 1000);

  try {
    await cargarTodo();
  } catch (err) {
    marcarConexion(false);
    toast(err.message, 'error');
  }

  setInterval(() => {
    if (document.visibilityState === 'visible') {
      refrescarEstado(true);
    }
  }, 25000);
}

document.addEventListener('DOMContentLoaded', iniciar);
