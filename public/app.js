'use strict';

/* ================================================================
   Estado y utilidades
   ================================================================ */

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

const TITULOS = {
  inicio: ['Inicio', 'Marca entradas, pausas y salidas del personal.'],
  colaboradores: ['Colaboradores', 'Administra al equipo de la tienda.'],
  registros: ['Registros', 'Consulta y corrige las jornadas registradas.'],
  reportes: ['Reportes', 'Horas trabajadas, pausas y horas extra.'],
  ajustes: ['Ajustes', 'Datos de la tienda, acceso desde el celular y respaldos.']
};

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const ICONOS = {
  usuarios:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  reloj:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.2 2"></path></svg>',
  pausa:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>',
  calendario:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>',
  extra:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
  lupa:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>'
};

function escapar(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const pad2 = (n) => String(n).padStart(2, '0');

let servidorHoy = null;

function hoyISO() {
  return servidorHoy || fechaLocalISO(new Date());
}

function fechaLocalISO(fecha) {
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}`;
}

function inicioDeMes() {
  const base = servidorHoy
    ? new Date(`${servidorHoy}T12:00:00`)
    : new Date();
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

function sumarDias(fechaISO, dias) {
  const fecha = parseLocal(`${fechaISO}T12:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return fechaLocalISO(fecha);
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

const state = {
  vista: 'inicio',
  online: true,
  colaboradores: [],
  estado: { activos: [], resumen: {} },
  config: { nombre_tienda: 'Mi Tienda', jornada_horas: '8' },
  info: null,
  reporte: null,
  registros: [],
  busquedaInicio: '',
  busquedaColabs: '',
  filtros: {
    registros: { desde: inicioDeMes(), hasta: hoyISO(), colaborador_id: '' },
    reportes: { desde: inicioDeMes(), hasta: hoyISO(), colaborador_id: '' }
  }
};

function formatoHoras(horas) {
  const numero = Number(horas || 0);
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(numero)} h`;
}

function formatoMinutos(minutos) {
  const total = Math.max(0, Math.round(Number(minutos) || 0));
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

function formatoDuracion(minutos) {
  return formatoMinutos(minutos);
}

function iniciales(nombre) {
  const partes = String(nombre || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

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

    // 502/503/504 suelen venir de un proxy o del sistema cuando el servidor
    // no está disponible: se tratan como falta de conexión.
    if ([502, 503, 504].includes(respuesta.status)) {
      marcarConexion(false);
      throw new Error('No se pudo conectar con el servidor. Verifica que esté encendido y en la misma red.');
    }

    marcarConexion(true);

    if (!respuesta.ok) {
      throw new Error((datos && datos.error) || `Error ${respuesta.status}`);
    }
    return datos;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      marcarConexion(false);
      throw new Error('El servidor tardó demasiado en responder. Revisa que esté encendido.');
    }
    if (error instanceof TypeError) {
      marcarConexion(false);
      throw new Error('No se pudo conectar con el servidor. Verifica que esté encendido y en la misma red.');
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
  }
}

async function reintentarConexion(silencioso = false) {
  const boton = $('#btn-reintentar-conexion');
  if (boton) {
    boton.disabled = true;
    boton.textContent = 'Reintentando…';
  }

  try {
    await api('/salud');
    await cargarTodo();
    if (!silencioso) toast('Datos actualizados.');
  } catch (error) {
    if (!silencioso) toast(error.message, 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = 'Reintentar';
    }
  }
}

/* ================================================================
   Notificaciones
   ================================================================ */

function toast(mensaje, tipo = 'ok') {
  const raiz = $('#toast-root');
  if (!raiz) return;
  while (raiz.children.length >= 3) {
    raiz.firstElementChild.remove();
  }
  const elemento = document.createElement('div');
  elemento.className = `toast${tipo === 'error' ? ' error' : ''}`;
  elemento.textContent = mensaje;
  raiz.appendChild(elemento);
  setTimeout(() => {
    elemento.classList.add('leaving');
    setTimeout(() => elemento.remove(), 220);
  }, 3200);
}

/* ================================================================
   Modal genérico
   ================================================================ */

let cerrarModalActual = null;

function abrirModal({ titulo, subtitulo = '', contenido, textoGuardar = 'Guardar', ancho = '', onGuardar }) {
  cerrarModal();
  const raiz = $('#modal-root');

  const envoltorio = document.createElement('div');
  envoltorio.className = 'modal-backdrop';
  envoltorio.innerHTML = `
    <div class="modal ${ancho}" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div class="modal-head">
        <div>
          <h2 id="modal-titulo">${escapar(titulo)}</h2>
          ${subtitulo ? `<p>${escapar(subtitulo)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">×</button>
      </div>
      <form id="form-modal" novalidate>
        <div class="modal-body">
          ${contenido}
          <p class="form-error hidden" data-error></p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn ghost" data-cerrar>Cancelar</button>
          <button type="submit" class="btn primary" data-guardar>${escapar(textoGuardar)}</button>
        </div>
      </form>
    </div>
  `;
  raiz.appendChild(envoltorio);

  const formulario = $('#form-modal', envoltorio);
  const botonGuardar = $('[data-guardar]', envoltorio);
  const cajaError = $('[data-error]', envoltorio);

  const cerrar = () => {
    document.removeEventListener('keydown', alPresionarTecla);
    envoltorio.remove();
    cerrarModalActual = null;
  };

  const alPresionarTecla = (evento) => {
    if (evento.key === 'Escape') cerrar();
  };
  document.addEventListener('keydown', alPresionarTecla);

  $$('[data-cerrar]', envoltorio).forEach((boton) =>
    boton.addEventListener('click', cerrar)
  );
  envoltorio.addEventListener('mousedown', (evento) => {
    if (evento.target === envoltorio) cerrar();
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    cajaError.classList.add('hidden');
    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando…';
    try {
      await onGuardar(new FormData(formulario), formulario);
      cerrar();
    } catch (error) {
      cajaError.textContent = error.message || 'No se pudo guardar.';
      cajaError.classList.remove('hidden');
      botonGuardar.disabled = false;
      botonGuardar.textContent = textoGuardar;
    }
  });

  cerrarModalActual = cerrar;
  const primerCampo = $('input:not([type="hidden"]), select, textarea', envoltorio);
  if (primerCampo) setTimeout(() => primerCampo.focus(), 40);
  return { cerrar };
}

function cerrarModal() {
  if (cerrarModalActual) cerrarModalActual();
}

function confirmar({ titulo, mensaje, textoConfirmar = 'Eliminar', onConfirmar }) {
  abrirModal({
    titulo,
    contenido: `<p class="confirm-text">${mensaje}</p>`,
    textoGuardar: textoConfirmar,
    onGuardar: async () => {
      await onConfirmar();
    }
  });
  const boton = $('#form-modal [data-guardar]');
  if (boton) {
    boton.classList.remove('primary');
    boton.classList.add('danger');
  }
}

/* ================================================================
   Inicio
   ================================================================ */

function renderInicio() {
  const resumen = state.estado.resumen || {};
  $('#inicio-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">${ICONOS.usuarios}</div>
      <div class="stat-body">
        <span class="stat-value">${resumen.en_turno ?? 0}</span>
        <span class="stat-label">En turno ahora</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber">${ICONOS.pausa}</div>
      <div class="stat-body">
        <span class="stat-value">${resumen.en_pausa ?? 0}</span>
        <span class="stat-label">En pausa</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue">${ICONOS.reloj}</div>
      <div class="stat-body">
        <span class="stat-value">${formatoHoras(resumen.horas_hoy ?? 0)}</span>
        <span class="stat-label">Horas trabajadas hoy</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon violet">${ICONOS.calendario}</div>
      <div class="stat-body">
        <span class="stat-value">${resumen.turnos_hoy ?? 0}</span>
        <span class="stat-label">Turnos de hoy</span>
      </div>
    </div>
  `;

  const contenedor = $('#inicio-cards');
  const activosPorColaborador = new Map(
    (state.estado.activos || []).map((turno) => [turno.colaborador_id, turno])
  );

  const visibles = state.colaboradores.filter((colaborador) => {
    if (!colaborador.activo && !activosPorColaborador.has(colaborador.id)) return false;
    const busqueda = state.busquedaInicio.trim().toLowerCase();
    if (!busqueda) return true;
    return `${colaborador.nombre} ${colaborador.puesto}`.toLowerCase().includes(busqueda);
  });

  if (!state.colaboradores.length) {
    contenedor.innerHTML = `
      <div class="empty-state">
        ${ICONOS.usuarios}
        <strong>Aún no hay colaboradores</strong>
        <p>Agrega a tu equipo para comenzar a registrar entradas, pausas y salidas.</p>
        <button class="btn primary" type="button" data-ir-colaboradores>Agregar colaborador</button>
      </div>
    `;
    return;
  }

  if (!visibles.length) {
    contenedor.innerHTML = `
      <div class="empty-state">
        ${ICONOS.lupa}
        <strong>Sin resultados</strong>
        <p>No encontramos colaboradores con ese nombre o puesto.</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = visibles
    .map((colaborador) => tarjetaColaborador(colaborador, activosPorColaborador.get(colaborador.id)))
    .join('');

  actualizarReloj();
}

function tarjetaColaborador(colaborador, turno) {
  const enPausa = Boolean(turno && turno.en_pausa);
  const clase = turno ? (enPausa ? 'is-paused' : 'is-active') : '';
  const insignia = turno
    ? enPausa
      ? '<span class="badge badge-pause">En pausa</span>'
      : '<span class="badge badge-on">En turno</span>'
    : '<span class="badge badge-off">Fuera de turno</span>';

  let acciones = '';
  if (!turno) {
    acciones = `
      <button class="btn primary" type="button" data-accion="entrada" data-colaborador="${colaborador.id}">
        Marcar entrada
      </button>
    `;
  } else if (enPausa) {
    acciones = `
      <button class="btn primary" type="button" data-accion="reanudar" data-turno="${turno.id}">Reanudar</button>
      <button class="btn dark" type="button" data-accion="salida" data-turno="${turno.id}">Marcar salida</button>
    `;
  } else {
    acciones = `
      <button class="btn ghost" type="button" data-accion="pausa" data-turno="${turno.id}">Iniciar pausa</button>
      <button class="btn dark" type="button" data-accion="salida" data-turno="${turno.id}">Marcar salida</button>
    `;
  }

  const nota = enPausa
    ? `<p class="emp-note">Pausa desde las ${horaCorta(turno.pausa_inicio)} · <strong data-pause-timer data-pausa-inicio="${turno.pausa_inicio}">—</strong></p>`
    : '';

  return `
    <article class="emp-card ${clase}">
      <div class="emp-head">
        <div class="avatar">${escapar(iniciales(colaborador.nombre))}</div>
        <div class="emp-id">
          <h3>${escapar(colaborador.nombre)}</h3>
          <p>${escapar(colaborador.puesto || 'Sin puesto asignado')}</p>
        </div>
        ${insignia}
      </div>
      <div class="emp-time">
        <div class="time-item">
          <span>Entrada</span>
          <strong>${turno ? horaCorta(turno.entrada) : '—'}</strong>
        </div>
        <div class="time-item">
          <span>Trabajado</span>
          <strong
            data-timer
            data-entrada="${turno ? turno.entrada : ''}"
            data-pausa-min="${turno ? turno.pausa_minutos : 0}"
            data-pausa-inicio="${turno && turno.pausa_inicio ? turno.pausa_inicio : ''}"
          >${turno ? duracionTurno(turno) : '—'}</strong>
        </div>
      </div>
      ${nota}
      <div class="emp-actions">${acciones}</div>
    </article>
  `;
}

function duracionTurno(turno) {
  if (!turno || !turno.entrada) return '—';
  return duracionDesdeDatos({
    entrada: turno.entrada,
    pausaMin: turno.pausa_minutos,
    pausaInicio: turno.pausa_inicio
  });
}

function duracionDesdeDatos({ entrada, pausaMin, pausaInicio }) {
  if (!entrada) return '—';
  const inicio = parseLocal(entrada);
  if (!inicio) return '—';
  const ahora = new Date();
  let minutos = (ahora - inicio) / 60000;
  minutos -= Number(pausaMin || 0);
  if (pausaInicio) {
    const inicioPausa = parseLocal(pausaInicio);
    if (inicioPausa) minutos -= (ahora - inicioPausa) / 60000;
  }
  return formatoDuracion(Math.max(0, minutos));
}

async function refrescarEstado(silencioso = false) {
  try {
    state.estado = await api('/estado');
    if (state.vista === 'inicio') renderInicio();
  } catch (error) {
    if (!silencioso) toast(error.message, 'error');
  }
}

/* ================================================================
   Colaboradores
   ================================================================ */

function renderColaboradores() {
  const cuerpo = $('#tabla-colabs-body');
  const busqueda = state.busquedaColabs.trim().toLowerCase();
  const lista = state.colaboradores.filter((colaborador) => {
    if (!busqueda) return true;
    return `${colaborador.nombre} ${colaborador.puesto} ${colaborador.email} ${colaborador.telefono}`
      .toLowerCase()
      .includes(busqueda);
  });

  if (!lista.length) {
    cuerpo.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-inline">
            <p>${
              state.colaboradores.length
                ? 'No hay colaboradores que coincidan con la búsqueda.'
                : 'Aún no hay colaboradores. Agrega al primer integrante del equipo.'
            }</p>
            ${
              state.colaboradores.length
                ? ''
                : '<button class="btn primary small" type="button" data-accion="nuevo-colaborador">Agregar colaborador</button>'
            }
          </div>
        </td>
      </tr>
    `;
    return;
  }

  cuerpo.innerHTML = lista
    .map((colaborador) => {
      const contacto = [colaborador.email, colaborador.telefono].filter(Boolean);
      return `
        <tr>
          <td>
            <div class="cell-person">
              <div class="avatar">${escapar(iniciales(colaborador.nombre))}</div>
              <div>
                <strong>${escapar(colaborador.nombre)}</strong>
                <span>${escapar(colaborador.puesto || 'Sin puesto')}</span>
              </div>
            </div>
          </td>
          <td>${escapar(colaborador.puesto || '—')}</td>
          <td>${contacto.length ? escapar(contacto.join(' · ')) : '—'}</td>
          <td>
            <span class="badge ${colaborador.activo ? 'badge-on' : 'badge-off'}">
              ${colaborador.activo ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td>
            <div class="row-actions">
              <button class="btn ghost small" type="button" data-accion="editar-colaborador" data-id="${colaborador.id}">
                Editar
              </button>
              <button class="btn soft-danger small" type="button" data-accion="eliminar-colaborador" data-id="${colaborador.id}">
                Eliminar
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function abrirModalColaborador(colaborador = null) {
  const esEdicion = Boolean(colaborador);
  abrirModal({
    titulo: esEdicion ? 'Editar colaborador' : 'Nuevo colaborador',
    subtitulo: esEdicion
      ? 'Actualiza los datos del integrante del equipo.'
      : 'Registra a un integrante del equipo de la tienda.',
    textoGuardar: esEdicion ? 'Guardar cambios' : 'Agregar colaborador',
    contenido: `
      <div class="form-grid">
        <label class="field full">
          <span>Nombre completo <span class="req">*</span></span>
          <input type="text" name="nombre" maxlength="80" required
            value="${escapar(colaborador ? colaborador.nombre : '')}"
            placeholder="Ej. Ana Martínez" autocomplete="off" />
        </label>
        <label class="field full">
          <span>Puesto</span>
          <input type="text" name="puesto" maxlength="80"
            value="${escapar(colaborador ? colaborador.puesto : '')}"
            placeholder="Ej. Cajera, Vendedor, Supervisor" autocomplete="off" />
        </label>
        <label class="field">
          <span>Correo electrónico</span>
          <input type="email" name="email" maxlength="120"
            value="${escapar(colaborador ? colaborador.email : '')}"
            placeholder="correo@tienda.com" autocomplete="off" />
        </label>
        <label class="field">
          <span>Teléfono</span>
          <input type="tel" name="telefono" maxlength="40"
            value="${escapar(colaborador ? colaborador.telefono : '')}"
            placeholder="555 123 4567" autocomplete="off" />
        </label>
        <label class="check-field full">
          <input type="checkbox" name="activo" ${!colaborador || colaborador.activo ? 'checked' : ''} />
          <span>Colaborador activo (puede marcar entrada)</span>
        </label>
      </div>
    `,
    onGuardar: async (datos) => {
      const cuerpo = {
        nombre: datos.get('nombre'),
        puesto: datos.get('puesto'),
        email: datos.get('email'),
        telefono: datos.get('telefono'),
        activo: datos.get('activo') === 'on'
      };
      if (!String(cuerpo.nombre || '').trim()) {
        throw new Error('Escribe el nombre del colaborador.');
      }
      if (esEdicion) {
        await api(`/colaboradores/${colaborador.id}`, {
          method: 'PUT',
          body: JSON.stringify(cuerpo)
        });
        toast('Colaborador actualizado.');
      } else {
        await api('/colaboradores', {
          method: 'POST',
          body: JSON.stringify(cuerpo)
        });
        toast('Colaborador agregado.');
      }
      await recargarColaboradores();
      await refrescarEstado(true);
    }
  });
}

function confirmarEliminarColaborador(colaborador) {
  confirmar({
    titulo: 'Eliminar colaborador',
    mensaje: `¿Eliminar a <strong>${escapar(colaborador.nombre)}</strong>?<br /><br />También se eliminarán <strong>todos sus turnos registrados</strong>. Esta acción no se puede deshacer.`,
    textoConfirmar: 'Sí, eliminar',
    onConfirmar: async () => {
      await api(`/colaboradores/${colaborador.id}`, { method: 'DELETE' });
      toast('Colaborador eliminado.');
      await recargarColaboradores();
      await Promise.all([refrescarEstado(true), cargarRegistros(true), cargarReporte(true)]);
    }
  });
}

async function recargarColaboradores() {
  state.colaboradores = await api('/colaboradores');

  const idsValidos = new Set(state.colaboradores.map((colaborador) => String(colaborador.id)));
  for (const clave of ['registros', 'reportes']) {
    const filtros = state.filtros[clave];
    if (filtros.colaborador_id && !idsValidos.has(String(filtros.colaborador_id))) {
      filtros.colaborador_id = '';
      const selector =
        clave === 'registros' ? '#filtro-reg-colaborador' : '#filtro-rep-colaborador';
      if ($(selector)) $(selector).value = '';
    }
  }

  renderColaboradores();
  renderSelects();
  if (state.vista === 'inicio') renderInicio();
}

function renderSelects() {
  const opciones = state.colaboradores
    .map((colaborador) => `<option value="${colaborador.id}">${escapar(colaborador.nombre)}</option>`)
    .join('');

  const selects = [
    ['#filtro-reg-colaborador', state.filtros.registros.colaborador_id],
    ['#filtro-rep-colaborador', state.filtros.reportes.colaborador_id]
  ];
  for (const [selector, valor] of selects) {
    const select = $(selector);
    if (!select) continue;
    select.innerHTML = `<option value="">Todos</option>${opciones}`;
    select.value = String(valor || '');
  }
}

/* ================================================================
   Registros
   ================================================================ */

async function cargarRegistros(silencioso = false) {
  const filtros = state.filtros.registros;
  const parametros = new URLSearchParams();
  if (filtros.desde) parametros.set('desde', filtros.desde);
  if (filtros.hasta) parametros.set('hasta', filtros.hasta);
  if (filtros.colaborador_id) parametros.set('colaborador_id', filtros.colaborador_id);

  try {
    state.registros = await api(`/turnos?${parametros.toString()}`);
    renderRegistros();
  } catch (error) {
    if (!silencioso) toast(error.message, 'error');
  }
}

function renderRegistros() {
  const cuerpo = $('#tabla-registros-body');
  const pie = $('#tabla-registros-foot');
  const resumen = $('#registros-resumen');

  if (!state.registros.length) {
    cuerpo.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">No hay turnos registrados en este rango de fechas.</td>
      </tr>
    `;
    if (pie) pie.innerHTML = '';
    resumen.textContent = '';
    return;
  }

  let totalHoras = 0;
  let totalPausa = 0;

  cuerpo.innerHTML = state.registros
    .map((turno) => {
      totalHoras += turno.horas || 0;
      totalPausa += turno.pausa_minutos || 0;

      const insignia = turno.activo
        ? turno.en_pausa
          ? '<span class="badge badge-pause">En pausa</span>'
          : '<span class="badge badge-on">En turno</span>'
        : '<span class="badge badge-info">Completado</span>';

      let accionesTurno = '';
      if (turno.activo) {
        if (turno.en_pausa) {
          accionesTurno += `
            <button class="btn ghost small" type="button" data-accion="reanudar-registro" data-id="${turno.id}">
              Reanudar
            </button>`;
        } else {
          accionesTurno += `
            <button class="btn ghost small" type="button" data-accion="pausa-registro" data-id="${turno.id}">
              Pausa
            </button>`;
        }
        accionesTurno += `
          <button class="btn dark small" type="button" data-accion="salida-registro" data-id="${turno.id}">
            Salida
          </button>`;
      }

      return `
        <tr>
          <td class="cell-mono" data-label="Fecha">${fechaCorta(turno.fecha)}</td>
          <td data-label="Colaborador">
            <div class="cell-person">
              <div class="avatar">${escapar(iniciales(turno.colaborador_nombre))}</div>
              <div>
                <strong>${escapar(turno.colaborador_nombre)}</strong>
                <span>${escapar(turno.colaborador_puesto || 'Sin puesto')}</span>
              </div>
            </div>
          </td>
          <td class="cell-mono" data-label="Entrada">${horaCorta(turno.entrada)}</td>
          <td class="cell-mono" data-label="Salida">${turno.salida ? horaCorta(turno.salida) : '—'}</td>
          <td class="cell-mono" data-label="Pausa">${turno.pausa_minutos ? formatoMinutos(turno.pausa_minutos) : '—'}</td>
          <td class="cell-mono" data-label="Horas">${turno.horas !== null ? formatoHoras(turno.horas) : 'En curso'}</td>
          <td data-label="Estado">${insignia}</td>
          <td data-label="Acciones">
            <div class="row-actions">
              ${accionesTurno}
              <button class="btn ghost small" type="button" data-accion="editar-registro" data-id="${turno.id}">
                Editar
              </button>
              <button class="btn soft-danger small" type="button" data-accion="eliminar-registro" data-id="${turno.id}">
                Eliminar
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  if (pie) {
    pie.innerHTML = filaTotales(8, [
      'Totales',
      '',
      '',
      '',
      totalPausa ? formatoMinutos(totalPausa) : '—',
      formatoHoras(totalHoras),
      '',
      ''
    ]);
  }

  const partes = [`${state.registros.length} registro${state.registros.length === 1 ? '' : 's'}`];
  if (totalHoras) partes.push(`${formatoHoras(totalHoras)} trabajadas`);
  if (totalPausa) partes.push(`${formatoMinutos(totalPausa)} de pausa`);
  resumen.textContent = partes.join(' · ');
}

function abrirModalRegistro(turno = null) {
  const esEdicion = Boolean(turno);
  const fechaBase = turno ? turno.fecha : hoyISO();
  const entradaBase = turno ? horaCorta(turno.entrada) : '09:00';
  const salidaBase = turno && turno.salida ? horaCorta(turno.salida) : esEdicion ? '' : '17:00';

  const opciones = state.colaboradores
    .filter((colaborador) => colaborador.activo || (turno && turno.colaborador_id === colaborador.id))
    .map(
      (colaborador) =>
        `<option value="${colaborador.id}" ${
          turno && turno.colaborador_id === colaborador.id ? 'selected' : ''
        }>${escapar(colaborador.nombre)}</option>`
    )
    .join('');

  if (!opciones) {
    toast('Primero agrega un colaborador.', 'error');
    return;
  }

  abrirModal({
    titulo: esEdicion ? 'Editar registro' : 'Nuevo registro manual',
    subtitulo: 'Usa esta opción para corregir u registrar jornadas pasadas.',
    textoGuardar: esEdicion ? 'Guardar cambios' : 'Guardar registro',
    ancho: 'wide',
    contenido: `
      <div class="form-grid">
        <label class="field full">
          <span>Colaborador <span class="req">*</span></span>
          <select name="colaborador_id" required>${opciones}</select>
        </label>
        <label class="field">
          <span>Fecha <span class="req">*</span></span>
          <input type="date" name="fecha" required value="${fechaBase}" />
        </label>
        <label class="field">
          <span>Pausa (minutos)</span>
          <input type="number" name="pausa_minutos" min="0" max="1440" step="1"
            value="${turno ? Math.round(turno.pausa_minutos || 0) : 0}" />
        </label>
        <label class="field">
          <span>Hora de entrada <span class="req">*</span></span>
          <input type="time" name="entrada" required value="${entradaBase}" />
        </label>
        <label class="field">
          <span>Hora de salida ${esEdicion ? '' : '<span class="req">*</span>'}</span>
          <input type="time" name="salida" ${esEdicion ? '' : 'required'} value="${salidaBase}" />
          <small class="field-hint">${esEdicion ? 'Déjala vacía si el turno sigue abierto.' : 'Si es menor que la entrada, se toma como el día siguiente.'}</small>
        </label>
        <div class="duration-preview" data-duracion-previa>
          Selecciona la entrada y la salida para ver la duración.
        </div>
        <label class="field full">
          <span>Notas</span>
          <textarea name="notas" maxlength="500" placeholder="Observaciones del turno (opcional)">${escapar(
            turno ? turno.notas : ''
          )}</textarea>
        </label>
      </div>
    `,
    onGuardar: async (datos) => {
      const colaboradorId = Number(datos.get('colaborador_id'));
      const fecha = String(datos.get('fecha') || '');
      const horaEntrada = String(datos.get('entrada') || '');
      const horaSalida = String(datos.get('salida') || '');
      const pausa = Number(datos.get('pausa_minutos') || 0);

      if (!colaboradorId) throw new Error('Selecciona un colaborador.');
      if (!fecha) throw new Error('Selecciona la fecha del turno.');
      if (!horaEntrada) throw new Error('Indica la hora de entrada.');
      if (!esEdicion && !horaSalida) throw new Error('Indica la hora de salida.');

      const entradaISO = `${fecha}T${horaEntrada}:00`;
      let salidaISO = '';
      if (horaSalida) {
        salidaISO = `${fecha}T${horaSalida}:00`;
        if (salidaISO <= entradaISO) {
          salidaISO = `${sumarDias(fecha, 1)}T${horaSalida}:00`;
        }
      }
      if (!Number.isFinite(pausa) || pausa < 0) {
        throw new Error('La pausa debe ser un número de minutos mayor o igual a 0.');
      }

      const cuerpo = {
        colaborador_id: colaboradorId,
        fecha,
        entrada: entradaISO,
        salida: salidaISO || null,
        pausa_minutos: pausa,
        notas: datos.get('notas')
      };

      if (esEdicion) {
        await api(`/turnos/${turno.id}`, {
          method: 'PUT',
          body: JSON.stringify(cuerpo)
        });
        toast('Registro actualizado.');
      } else {
        await api('/turnos', {
          method: 'POST',
          body: JSON.stringify(cuerpo)
        });
        toast('Registro guardado.');
      }

      await Promise.all([cargarRegistros(true), refrescarEstado(true), cargarReporte(true)]);
    }
  });

  const formulario = $('#form-modal');
  if (formulario) {
    const actualizar = () => actualizarDuracionPrevia(formulario);
    for (const nombre of ['fecha', 'entrada', 'salida', 'pausa_minutos']) {
      const campo = $(`[name="${nombre}"]`, formulario);
      if (campo) campo.addEventListener('input', actualizar);
    }
    actualizar();
  }
}

function actualizarDuracionPrevia(formulario) {
  const caja = $('[data-duracion-previa]', formulario);
  if (!caja) return;

  const horaEntrada = String(($('[name="entrada"]', formulario) || {}).value || '');
  const horaSalida = String(($('[name="salida"]', formulario) || {}).value || '');
  const pausa = Number(($('[name="pausa_minutos"]', formulario) || {}).value || 0);

  caja.classList.remove('is-error');

  if (!horaEntrada) {
    caja.textContent = 'Indica la hora de entrada para calcular la duración.';
    return;
  }
  if (!horaSalida) {
    caja.textContent = 'Turno abierto: la duración se calculará al marcar la salida.';
    return;
  }

  const [hEntrada, mEntrada] = horaEntrada.split(':').map(Number);
  const [hSalida, mSalida] = horaSalida.split(':').map(Number);
  const minutosEntrada = hEntrada * 60 + mEntrada;
  let minutosSalida = hSalida * 60 + mSalida;
  const siguienteDia = minutosSalida <= minutosEntrada;
  if (siguienteDia) minutosSalida += 24 * 60;

  const duracion = minutosSalida - minutosEntrada - Math.max(0, pausa);
  if (!Number.isFinite(duracion) || duracion <= 0) {
    caja.classList.add('is-error');
    caja.textContent = 'La pausa es igual o mayor que el turno. Revisa los datos.';
    return;
  }

  const partes = [`Duración estimada: ${formatoMinutos(duracion)}`];
  if (pausa > 0) partes.push(`incluye ${formatoMinutos(pausa)} de pausa`);
  if (siguienteDia) partes.push('termina al día siguiente');
  caja.textContent = partes.join(' · ');
}

function confirmarEliminarRegistro(turno) {
  confirmar({
    titulo: 'Eliminar registro',
    mensaje: `¿Eliminar el turno de <strong>${escapar(turno.colaborador_nombre)}</strong> del <strong>${fechaCorta(
      turno.fecha
    )}</strong>?<br /><br />Esta acción no se puede deshacer.`,
    textoConfirmar: 'Sí, eliminar',
    onConfirmar: async () => {
      await api(`/turnos/${turno.id}`, { method: 'DELETE' });
      toast('Registro eliminado.');
      await Promise.all([cargarRegistros(true), refrescarEstado(true), cargarReporte(true)]);
    }
  });
}

/* ================================================================
   Reportes
   ================================================================ */

async function cargarReporte(silencioso = false) {
  const filtros = state.filtros.reportes;
  const parametros = new URLSearchParams({
    desde: filtros.desde,
    hasta: filtros.hasta
  });
  if (filtros.colaborador_id) parametros.set('colaborador_id', filtros.colaborador_id);

  try {
    state.reporte = await api(`/reportes?${parametros.toString()}`);
    renderReporte();
  } catch (error) {
    if (!silencioso) toast(error.message, 'error');
  }
}

function renderReporte() {
  const reporte = state.reporte;
  if (!reporte) return;

  $('#reporte-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue">${ICONOS.reloj}</div>
      <div class="stat-body">
        <span class="stat-value">${formatoHoras(reporte.totales.horas)}</span>
        <span class="stat-label">Horas trabajadas</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber">${ICONOS.extra}</div>
      <div class="stat-body">
        <span class="stat-value">${formatoHoras(reporte.totales.extra)}</span>
        <span class="stat-label">Horas extra</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${ICONOS.calendario}</div>
      <div class="stat-body">
        <span class="stat-value">${reporte.totales.turnos}</span>
        <span class="stat-label">Turnos completados</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon violet">${ICONOS.usuarios}</div>
      <div class="stat-body">
        <span class="stat-value">${reporte.totales.colaboradores}</span>
        <span class="stat-label">Colaboradores</span>
      </div>
    </div>
  `;

  $('#reporte-rango').textContent = `Del ${fechaCorta(reporte.desde)} al ${fechaCorta(
    reporte.hasta
  )} · Jornada diaria de ${formatoHoras(reporte.umbral)}`;

  const cuerpoColabs = $('#tabla-reporte-colabs');
  if (!reporte.por_colaborador.length) {
    cuerpoColabs.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">No hay turnos completados en este rango de fechas.</td>
      </tr>
    `;
  } else {
    cuerpoColabs.innerHTML =
      reporte.por_colaborador
        .map(
          (colaborador) => `
            <tr>
              <td>
                <div class="cell-person">
                  <div class="avatar">${escapar(iniciales(colaborador.colaborador_nombre))}</div>
                  <div>
                    <strong>${escapar(colaborador.colaborador_nombre)}</strong>
                    <span>${colaborador.turnos} turno${colaborador.turnos === 1 ? '' : 's'}</span>
                  </div>
                </div>
              </td>
              <td>${escapar(colaborador.colaborador_puesto || '—')}</td>
              <td class="right cell-mono">${colaborador.dias}</td>
              <td class="right cell-mono">${colaborador.turnos}</td>
              <td class="right cell-mono">${colaborador.pausa_minutos ? formatoMinutos(colaborador.pausa_minutos) : '—'}</td>
              <td class="right cell-mono"><strong>${formatoHoras(colaborador.horas)}</strong></td>
              <td class="right cell-mono">${colaborador.extra ? formatoHoras(colaborador.extra) : '—'}</td>
            </tr>
          `
        )
        .join('') +
      filaTotales(7, [
        `Totales`,
        '',
        reporte.totales.dias,
        reporte.totales.turnos,
        formatoMinutos(reporte.totales.pausa_minutos),
        formatoHoras(reporte.totales.horas),
        formatoHoras(reporte.totales.extra)
      ]);
  }

  const cuerpoDias = $('#tabla-reporte-dias');
  if (!reporte.por_dia.length) {
    cuerpoDias.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">No hay turnos completados en este rango de fechas.</td>
      </tr>
    `;
  } else {
    cuerpoDias.innerHTML =
      reporte.por_dia
        .map(
          (dia) => `
            <tr>
              <td class="cell-mono">${fechaCorta(dia.fecha)}</td>
              <td class="right cell-mono">${dia.turnos}</td>
              <td class="right cell-mono">${dia.pausa_minutos ? formatoMinutos(dia.pausa_minutos) : '—'}</td>
              <td class="right cell-mono"><strong>${formatoHoras(dia.horas)}</strong></td>
              <td class="right cell-mono">${dia.extra ? formatoHoras(dia.extra) : '—'}</td>
            </tr>
          `
        )
        .join('') +
      filaTotales(5, [
        'Totales',
        reporte.totales.turnos,
        formatoMinutos(reporte.totales.pausa_minutos),
        formatoHoras(reporte.totales.horas),
        formatoHoras(reporte.totales.extra)
      ]);
  }
}

function filaTotales(columnas, valores) {
  return `
    <tr class="total-row">
      ${valores
        .map((valor, indice) => {
          const alineacion = indice === 0 ? '' : 'right';
          return `<td class="${alineacion}">${valor}</td>`;
        })
        .join('')}
    </tr>
  `;
}

function descargarCSV(filtros) {
  const parametros = new URLSearchParams({
    desde: filtros.desde,
    hasta: filtros.hasta
  });
  if (filtros.colaborador_id) parametros.set('colaborador_id', filtros.colaborador_id);
  const enlace = document.createElement('a');
  enlace.href = `/api/reportes/csv?${parametros.toString()}`;
  enlace.download = '';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

/* ================================================================
   Reloj en vivo
   ================================================================ */

function actualizarReloj() {
  const ahora = new Date();
  const reloj = $('#live-clock');
  const fecha = $('#live-date');
  if (reloj) {
    reloj.textContent = `${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}:${pad2(ahora.getSeconds())}`;
  }
  if (fecha) fecha.textContent = fechaLarga(ahora);

  $$('[data-timer]').forEach((elemento) => {
    elemento.textContent = duracionDesdeDatos({
      entrada: elemento.dataset.entrada,
      pausaMin: elemento.dataset.pausaMin,
      pausaInicio: elemento.dataset.pausaInicio
    });
  });

  $$('[data-pause-timer]').forEach((elemento) => {
    const inicio = parseLocal(elemento.dataset.pausaInicio);
    if (!inicio) {
      elemento.textContent = '—';
      return;
    }
    elemento.textContent = formatoDuracion(Math.max(0, (ahora - inicio) / 60000));
  });
}

/* ================================================================
   Navegación y eventos
   ================================================================ */

function cambiarVista(vista) {
  if (!TITULOS[vista]) return;
  state.vista = vista;

  $$('.nav-btn').forEach((boton) => {
    const activo = boton.dataset.view === vista;
    boton.classList.toggle('is-active', activo);
    if (activo) {
      boton.setAttribute('aria-current', 'page');
    } else {
      boton.removeAttribute('aria-current');
    }
  });
  $$('.view').forEach((seccion) =>
    seccion.classList.toggle('hidden', seccion.id !== `view-${vista}`)
  );

  const [titulo, subtitulo] = TITULOS[vista];
  $('#view-title').textContent = titulo;
  $('#view-subtitle').textContent = subtitulo;

  if (vista === 'inicio') refrescarEstado(true);
  if (vista === 'registros') cargarRegistros(true);
  if (vista === 'reportes') cargarReporte(true);
  if (vista === 'colaboradores') renderColaboradores();
  if (vista === 'ajustes') {
    renderAccesoCelular(state.info);
    renderInfoAjustes();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function leerFiltros(desdeSelector, hastaSelector, colaboradorSelector) {
  const desde = $(desdeSelector).value;
  const hasta = $(hastaSelector).value;
  const colaboradorId = $(colaboradorSelector).value;
  if (desde && hasta && desde > hasta) {
    throw new Error('La fecha “Desde” no puede ser posterior a “Hasta”.');
  }
  return { desde, hasta, colaborador_id: colaboradorId };
}

function aplicarConfig() {
  const nombre = state.config.nombre_tienda || 'Mi Tienda';
  $('#sidebar-store').textContent = nombre;
  document.title = `Control de Horas · ${nombre}`;
  $('#config-nombre').value = nombre;
  $('#config-jornada').value = state.config.jornada_horas || 8;
}

function renderAccesoCelular(info) {
  const lista = $('#lan-list');
  if (!lista) return;

  const enNube = Boolean(info && info.modo === 'nube');
  const direcciones =
    info && Array.isArray(info.direcciones) ? info.direcciones : [];

  const titulo = $('#lan-titulo');
  const ayuda = $('#lan-ayuda');
  const nota = $('#lan-nota');
  if (titulo) {
    titulo.textContent = enNube
      ? 'Acceso desde cualquier lugar'
      : 'Acceso desde el celular';
  }
  if (ayuda) {
    ayuda.textContent = enNube
      ? 'Esta instalación está en línea. Abre esta dirección en el teléfono, con datos móviles o cualquier Wi-Fi.'
      : 'Abre una de estas direcciones en el teléfono, conectado al mismo Wi-Fi que esta computadora.';
  }
  if (nota) {
    nota.textContent = enNube
      ? 'Escribe esta misma dirección en la app Android (TurnoYa) la primera vez que la abres.'
      : 'Si aparece más de una, usa la de tu red Wi-Fi. Esa misma dirección se escribe en la app Android (TurnoYa) la primera vez que la abres.';
  }

  const respaldo = $('#respaldo-ayuda');
  if (respaldo) {
    if (enNube) {
      respaldo.textContent =
        'El archivo .sql incluye colaboradores, turnos y ajustes, y se puede restaurar en la base de datos en la nube.';
    } else {
      respaldo.innerHTML =
        'El archivo incluye colaboradores, turnos y ajustes. Para restaurarlo, detén el servidor y reemplaza <code>data/tienda.db</code> por el archivo descargado.';
    }
  }

  const enlaces = enNube && !direcciones.length ? [window.location.origin] : direcciones;
  if (!enlaces.length) {
    lista.innerHTML =
      '<li class="muted small">No se detectó una dirección de red. Verifica que esta computadora esté conectada al Wi-Fi o a la red local.</li>';
    return;
  }

  lista.innerHTML = enlaces
    .map(
      (url) => `
        <li class="lan-item">
          <code>${escapar(url)}</code>
          <button class="btn ghost small" type="button" data-copiar="${escapar(url)}">Copiar</button>
        </li>`
    )
    .join('');
}

function renderInfoAjustes() {
  const lista = $('#ajustes-info');
  if (!lista) return;

  const info = state.info || {};
  const servidor =
    (Array.isArray(info.direcciones) && info.direcciones[0]) || window.location.origin;
  const filas = [
    ['Versión', info.version || '1.2.0'],
    ['Servidor', servidor],
    ['Puerto', info.puerto || window.location.port || '3000'],
    ['Base de datos', info.base_datos || 'data/tienda.db'],
    ['Node.js', info.node || '—']
  ];

  lista.innerHTML = filas
    .map(
      ([etiqueta, valor]) => `
        <div class="info-row">
          <dt>${escapar(etiqueta)}</dt>
          <dd>${escapar(valor)}</dd>
        </div>`
    )
    .join('');
}

function rangoRapido(tipo) {
  const hoy = new Date();
  const iso = fechaLocalISO;

  if (tipo === 'hoy') {
    return { desde: iso(hoy), hasta: iso(hoy) };
  }

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

  return {
    desde: `${hoy.getFullYear()}-${pad2(hoy.getMonth() + 1)}-01`,
    hasta: iso(hoy)
  };
}

function marcarRangoActivo(destino, tipo) {
  $$(`.quick-ranges [data-destino="${destino}"]`).forEach((boton) => {
    boton.classList.toggle('is-active', Boolean(tipo) && boton.dataset.rango === tipo);
  });
}

async function aplicarRangoRapido(destino, tipo) {
  const rango = rangoRapido(tipo);
  const filtros = state.filtros[destino];
  if (!filtros) return;

  const prefijo = destino === 'registros' ? 'reg' : 'rep';
  filtros.desde = rango.desde;
  filtros.hasta = rango.hasta;
  filtros.colaborador_id = $(`#filtro-${prefijo}-colaborador`).value;

  $(`#filtro-${prefijo}-desde`).value = rango.desde;
  $(`#filtro-${prefijo}-hasta`).value = rango.hasta;
  marcarRangoActivo(destino, tipo);

  if (destino === 'registros') {
    await cargarRegistros();
  } else {
    await cargarReporte();
  }
}

async function cargarTodo() {
  const [config, colaboradores, info, estado] = await Promise.all([
    api('/config'),
    api('/colaboradores'),
    api('/info').catch(() => null),
    api('/estado')
  ]);

  state.config = config;
  state.colaboradores = colaboradores;
  state.info = info;
  state.estado = estado;

  if (info && info.hora_servidor) {
    servidorHoy = String(info.hora_servidor).slice(0, 10);
    const base = new Date(`${servidorHoy}T12:00:00`);
    const inicio = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-01`;
    for (const clave of ['registros', 'reportes']) {
      state.filtros[clave].desde = inicio;
      state.filtros[clave].hasta = servidorHoy;
    }
    const pares = [
      ['#filtro-reg-desde', 'registros'],
      ['#filtro-reg-hasta', 'registros'],
      ['#filtro-rep-desde', 'reportes'],
      ['#filtro-rep-hasta', 'reportes']
    ];
    for (const [selector, clave] of pares) {
      const campo = $(selector);
      if (campo) campo.value = state.filtros[clave][selector.includes('desde') ? 'desde' : 'hasta'];
    }
  }

  aplicarConfig();
  renderAccesoCelular(info);
  renderInfoAjustes();
  renderColaboradores();
  renderSelects();
  renderInicio();

  await Promise.all([cargarRegistros(true), cargarReporte(true)]);
}

async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* sigue con el método alternativo */
  }

  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function conectarEventos() {
  $$('.nav-btn').forEach((boton) => {
    boton.addEventListener('click', () => cambiarVista(boton.dataset.view));
  });
  const navActivo = $('.nav-btn.is-active');
  if (navActivo) navActivo.setAttribute('aria-current', 'page');

  document.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('.quick-ranges [data-rango]');
    if (!boton) return;
    try {
      await aplicarRangoRapido(boton.dataset.destino, boton.dataset.rango);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#btn-reintentar-conexion').addEventListener('click', () => reintentarConexion());

  $('#btn-imprimir-reporte').addEventListener('click', () => window.print());

  $('#btn-respaldo').addEventListener('click', () => {
    const enlace = document.createElement('a');
    enlace.href = '/api/respaldo';
    enlace.download = '';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    toast('Descargando respaldo de la base de datos…');
  });

  for (const [selector, destino] of [
    ['#filtro-reg-desde', 'registros'],
    ['#filtro-reg-hasta', 'registros'],
    ['#filtro-rep-desde', 'reportes'],
    ['#filtro-rep-hasta', 'reportes']
  ]) {
    $(selector).addEventListener('input', () => marcarRangoActivo(destino, null));
  }

  window.addEventListener('online', () => reintentarConexion(true));
  window.addEventListener('offline', () => marcarConexion(false));

  $('#inicio-cards').addEventListener('click', async (evento) => {
    const irAColaboradores = evento.target.closest('[data-ir-colaboradores]');
    if (irAColaboradores) {
      cambiarVista('colaboradores');
      return;
    }

    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;

    const accion = boton.dataset.accion;
    const idTurno = boton.dataset.turno;
    boton.disabled = true;

    try {
      if (accion === 'entrada') {
        await api('/turnos/entrada', {
          method: 'POST',
          body: JSON.stringify({ colaborador_id: Number(boton.dataset.colaborador) })
        });
        toast('Entrada registrada.');
      } else if (accion === 'pausa') {
        await api(`/turnos/${idTurno}/pausa/iniciar`, { method: 'POST' });
        toast('Pausa iniciada.');
      } else if (accion === 'reanudar') {
        await api(`/turnos/${idTurno}/pausa/finalizar`, { method: 'POST' });
        toast('Pausa finalizada. Turno reanudado.');
      } else if (accion === 'salida') {
        await api(`/turnos/${idTurno}/salida`, { method: 'POST' });
        toast('Salida registrada.');
      }
      await refrescarEstado(true);
      await cargarRegistros(true);
      if (state.vista === 'reportes') cargarReporte(true);
    } catch (error) {
      toast(error.message, 'error');
      boton.disabled = false;
    }
  });

  $('#buscar-inicio').addEventListener('input', (evento) => {
    state.busquedaInicio = evento.target.value;
    renderInicio();
  });

  $('#buscar-colabs').addEventListener('input', (evento) => {
    state.busquedaColabs = evento.target.value;
    renderColaboradores();
  });

  $('#btn-nuevo-colab').addEventListener('click', () => abrirModalColaborador());

  $('#tabla-colabs-body').addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    if (boton.dataset.accion === 'nuevo-colaborador') {
      abrirModalColaborador();
      return;
    }
    const colaborador = state.colaboradores.find((c) => c.id === Number(boton.dataset.id));
    if (!colaborador) return;

    if (boton.dataset.accion === 'editar-colaborador') {
      abrirModalColaborador(colaborador);
    } else if (boton.dataset.accion === 'eliminar-colaborador') {
      confirmarEliminarColaborador(colaborador);
    }
  });

  $('#filtros-registros').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
      state.filtros.registros = leerFiltros(
        '#filtro-reg-desde',
        '#filtro-reg-hasta',
        '#filtro-reg-colaborador'
      );
      marcarRangoActivo('registros', null);
      await cargarRegistros();
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#btn-limpiar-registros').addEventListener('click', async () => {
    state.filtros.registros = {
      desde: inicioDeMes(),
      hasta: hoyISO(),
      colaborador_id: ''
    };
    $('#filtro-reg-desde').value = state.filtros.registros.desde;
    $('#filtro-reg-hasta').value = state.filtros.registros.hasta;
    $('#filtro-reg-colaborador').value = '';
    marcarRangoActivo('registros', 'mes');
    await cargarRegistros();
  });

  $('#btn-nuevo-registro').addEventListener('click', () => abrirModalRegistro());

  $('#tabla-registros-body').addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const turno = state.registros.find((t) => t.id === Number(boton.dataset.id));
    if (!turno) return;

    const accion = boton.dataset.accion;
    if (accion === 'editar-registro') {
      abrirModalRegistro(turno);
      return;
    }
    if (accion === 'eliminar-registro') {
      confirmarEliminarRegistro(turno);
      return;
    }

    boton.disabled = true;
    try {
      if (accion === 'pausa-registro') {
        await api(`/turnos/${turno.id}/pausa/iniciar`, { method: 'POST' });
        toast('Pausa iniciada.');
      } else if (accion === 'reanudar-registro') {
        await api(`/turnos/${turno.id}/pausa/finalizar`, { method: 'POST' });
        toast('Pausa finalizada. Turno reanudado.');
      } else if (accion === 'salida-registro') {
        await api(`/turnos/${turno.id}/salida`, { method: 'POST' });
        toast('Salida registrada.');
      }
      await Promise.all([cargarRegistros(true), refrescarEstado(true), cargarReporte(true)]);
    } catch (error) {
      toast(error.message, 'error');
      boton.disabled = false;
    }
  });

  $('#btn-exportar-registros').addEventListener('click', () => {
    try {
      descargarCSV(leerFiltros('#filtro-reg-desde', '#filtro-reg-hasta', '#filtro-reg-colaborador'));
      toast('Descargando CSV…');
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#filtros-reportes').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
      state.filtros.reportes = leerFiltros(
        '#filtro-rep-desde',
        '#filtro-rep-hasta',
        '#filtro-rep-colaborador'
      );
      marcarRangoActivo('reportes', null);
      await cargarReporte();
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#btn-exportar-reporte').addEventListener('click', () => {
    try {
      descargarCSV(leerFiltros('#filtro-rep-desde', '#filtro-rep-hasta', '#filtro-rep-colaborador'));
      toast('Descargando CSV…');
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#lan-list').addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-copiar]');
    if (!boton) return;
    const ok = await copiarTexto(boton.dataset.copiar);
    toast(
      ok ? 'Dirección copiada.' : 'No se pudo copiar. Selecciona el texto manualmente.',
      ok ? 'ok' : 'error'
    );
  });

  $('#form-config').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = evento.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      state.config = await api('/config', {
        method: 'PUT',
        body: JSON.stringify({
          nombre_tienda: $('#config-nombre').value,
          jornada_horas: Number($('#config-jornada').value)
        })
      });
      aplicarConfig();
      await cargarReporte(true);
      toast('Ajustes guardados.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });
}

function aplicarFechasPorDefecto() {
  $('#filtro-reg-desde').value = state.filtros.registros.desde;
  $('#filtro-reg-hasta').value = state.filtros.registros.hasta;
  $('#filtro-rep-desde').value = state.filtros.reportes.desde;
  $('#filtro-rep-hasta').value = state.filtros.reportes.hasta;
}

/* ================================================================
   Arranque
   ================================================================ */

async function iniciar() {
  aplicarFechasPorDefecto();
  conectarEventos();
  actualizarReloj();
  setInterval(actualizarReloj, 1000);

  try {
    await cargarTodo();
  } catch (error) {
    marcarConexion(false);
    toast(error.message, 'error');
  }

  setInterval(() => {
    if (state.vista === 'inicio' && document.visibilityState === 'visible') {
      refrescarEstado(true);
    }
  }, 30000);

  setInterval(() => {
    if (!state.online && document.visibilityState === 'visible') {
      reintentarConexion(true);
    }
  }, 12000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!state.online) {
      reintentarConexion(true);
    } else if (state.vista === 'inicio') {
      refrescarEstado(true);
    }
  });
}

document.addEventListener('DOMContentLoaded', iniciar);
