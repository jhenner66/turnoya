/**
 * [ETIQUETA: GENERADOR DE DATOS DE DEMOSTRACIÓN]
 * Qué hace: Pobla la base de datos local vacía con 5 colaboradores y turnos
 * de ejemplo (incluyendo un turno abierto hoy) para probar la app.
 * Uso: npm run demo
 */
const { uno, todos, ejecutar, lote } = require('../db');

const imprimir = (linea = '') => process.stdout.write(`${linea}\n`);

async function main() {
  const existentes = await uno('SELECT COUNT(*) AS total FROM colaboradores');
  if (Number(existentes.total) > 0) {
    imprimir('Ya existen colaboradores en la base de datos. No se agregaron datos de ejemplo.');
    imprimir('Si quieres empezar de cero, detén el servidor y elimina la carpeta "data".');
    process.exit(0);
  }

  const colaboradores = [
    { nombre: 'Ana Martínez', puesto: 'Cajera', email: 'ana@tienda.com', telefono: '555 101 2233', activo: 1 },
    { nombre: 'Luis Hernández', puesto: 'Vendedor', email: 'luis@tienda.com', telefono: '555 202 3344', activo: 1 },
    { nombre: 'María López', puesto: 'Supervisora', email: 'maria@tienda.com', telefono: '555 303 4455', activo: 1 },
    { nombre: 'Carlos Ramírez', puesto: 'Almacén', email: 'carlos@tienda.com', telefono: '555 404 5566', activo: 1 },
    { nombre: 'Sofía Torres', puesto: 'Vendedora', email: 'sofia@tienda.com', telefono: '555 505 6677', activo: 0 }
  ];

  const ids = [];
  for (const c of colaboradores) {
    const info = await ejecutar(
      'INSERT INTO colaboradores (nombre, puesto, email, telefono, activo) VALUES (?, ?, ?, ?, ?)',
      [c.nombre, c.puesto, c.email, c.telefono, c.activo]
    );
    ids.push(Number(info.lastInsertRowid));
  }

  const pad = (n) => String(n).padStart(2, '0');

  function iso(fecha, horas, minutos) {
    return `${fecha}T${pad(horas)}:${pad(minutos)}:00`;
  }

  function fechaLocal(fecha) {
    return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
  }

  const ahora = new Date();
  let creados = 0;

  for (let atras = 12; atras >= 1; atras -= 1) {
    const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - atras);
    if (dia.getDay() === 0) continue;
    const fecha = fechaLocal(dia);

    for (let indice = 0; indice < 4; indice++) {
      const id = ids[indice];
      if (Math.random() < 0.18) continue;
      const entradaHora = 8 + ((indice + atras) % 3);
      const entradaMin = (atras * 7 + indice * 13) % 60;
      const horasTrabajo = 7 + ((atras + indice) % 3);
      const salidaHora = entradaHora + horasTrabajo;
      const pausa = 30 + ((indice * 10 + atras) % 3) * 15;
      const notas = indice === 0 && atras === 3 ? 'Apoyo en inventario' : '';

      await ejecutar(
        'INSERT INTO turnos (colaborador_id, fecha, entrada, salida, pausa_minutos, notas) VALUES (?, ?, ?, ?, ?, ?)',
        [id, fecha, iso(fecha, entradaHora, entradaMin), iso(fecha, salidaHora, entradaMin), pausa, notas]
      );
      creados += 1;
    }
  }

  const inicioTurno = new Date(ahora.getTime() - 95 * 60000);
  const fechaHoy = fechaLocal(ahora);
  await ejecutar(
    'INSERT INTO turnos (colaborador_id, fecha, entrada, salida, pausa_minutos, notas) VALUES (?, ?, ?, ?, ?, ?)',
    [ids[1], fechaHoy, `${fechaHoy}T${pad(inicioTurno.getHours())}:${pad(inicioTurno.getMinutes())}:00`, null, 0, '']
  );
  creados += 1;

  imprimir('');
  imprimir(`Datos de ejemplo creados: ${colaboradores.length} colaboradores y ${creados} turnos.`);
  imprimir('Inicia la aplicación con: npm start');
  imprimir('');
}

main().catch((error) => {
  console.error('Error al crear datos de ejemplo:', error.message);
  process.exit(1);
});
