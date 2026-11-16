/**
 * Datos de ejemplo para probar la aplicación.
 * Uso: npm run demo
 */
const { db } = require('../db');

const existentes = db.prepare('SELECT COUNT(*) AS total FROM colaboradores').get();
if (Number(existentes.total) > 0) {
  console.log('Ya existen colaboradores en la base de datos. No se agregaron datos de ejemplo.');
  console.log('Si quieres empezar de cero, detén el servidor y elimina la carpeta "data".');
  process.exit(0);
}

const colaboradores = [
  { nombre: 'Ana Martínez', puesto: 'Cajera', email: 'ana@tienda.com', telefono: '555 101 2233', activo: 1 },
  { nombre: 'Luis Hernández', puesto: 'Vendedor', email: 'luis@tienda.com', telefono: '555 202 3344', activo: 1 },
  { nombre: 'María López', puesto: 'Supervisora', email: 'maria@tienda.com', telefono: '555 303 4455', activo: 1 },
  { nombre: 'Carlos Ramírez', puesto: 'Almacén', email: 'carlos@tienda.com', telefono: '555 404 5566', activo: 1 },
  { nombre: 'Sofía Torres', puesto: 'Vendedora', email: 'sofia@tienda.com', telefono: '555 505 6677', activo: 0 }
];

const insertarColaborador = db.prepare(
  `INSERT INTO colaboradores (nombre, puesto, email, telefono, activo)
   VALUES (?, ?, ?, ?, ?)`
);
const ids = colaboradores.map(
  (c) => Number(insertarColaborador.run(c.nombre, c.puesto, c.email, c.telefono, c.activo).lastInsertRowid)
);

const pad = (n) => String(n).padStart(2, '0');

function iso(fecha, horas, minutos) {
  return `${fecha}T${pad(horas)}:${pad(minutos)}:00`;
}

function fechaLocal(fecha) {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

const insertarTurno = db.prepare(
  `INSERT INTO turnos (colaborador_id, fecha, entrada, salida, pausa_minutos, notas)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const ahora = new Date();
let creados = 0;

// Jornadas completas de los últimos 12 días (excepto domingos).
for (let atras = 12; atras >= 1; atras -= 1) {
  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - atras);
  if (dia.getDay() === 0) continue;
  const fecha = fechaLocal(dia);

  ids.slice(0, 4).forEach((id, indice) => {
    if (Math.random() < 0.18) return; // día libre ocasional
    const entradaHora = 8 + ((indice + atras) % 3);
    const entradaMin = (atras * 7 + indice * 13) % 60;
    const horasTrabajo = 7 + ((atras + indice) % 3);
    const salidaHora = entradaHora + horasTrabajo;
    const pausa = 30 + ((indice * 10 + atras) % 3) * 15;
    const notas = indice === 0 && atras === 3 ? 'Apoyo en inventario' : '';

    insertarTurno.run(
      id,
      fecha,
      iso(fecha, entradaHora, entradaMin),
      iso(fecha, salidaHora, entradaMin),
      pausa,
      notas
    );
    creados += 1;
  });
}

// Un turno abierto para ver el estado "En turno" en vivo.
const inicioTurno = new Date(ahora.getTime() - 95 * 60000);
const fechaHoy = fechaLocal(ahora);
insertarTurno.run(
  ids[1],
  fechaHoy,
  `${fechaHoy}T${pad(inicioTurno.getHours())}:${pad(inicioTurno.getMinutes())}:00`,
  null,
  0,
  ''
);
creados += 1;

console.log('');
console.log(`Datos de ejemplo creados: ${colaboradores.length} colaboradores y ${creados} turnos.`);
console.log('Inicia la aplicación con: npm start');
console.log('');
