# Control de Horas · Tienda

Aplicación web para registrar la entrada, las pausas y la salida de los colaboradores de una tienda. Incluye reportes de horas trabajadas, cálculo de horas extra, exportación a CSV (compatible con Excel) y una app Android (**TurnoYa**) para usar desde el teléfono.

Funciona de dos maneras con el mismo código:

- **En la red local**: Node.js + SQLite en la computadora de la tienda.
- **En línea**: Vercel + Turso (SQLite en la nube), accesible desde cualquier lugar.

## Requisitos

- Node.js 24 o superior.
- No requiere instalar motores de base de datos: usa SQLite (libSQL).

## Instalación y arranque en local

```bash
npm install
npm start
```

Abre el navegador en `http://localhost:3000`.

Para acceder desde otro equipo o tablet dentro de la misma red de la tienda, usa la dirección `Red` que aparece en la consola al iniciar el servidor (por ejemplo `http://192.168.1.50:3000`). Asegúrate de permitir Node.js en el firewall de Windows.

## Poner la app en línea (Vercel + Turso)

GitHub Pages **no puede** ejecutar esta app: solo sirve archivos estáticos y no ejecuta Node.js ni una base de datos. Para tenerla en línea con HTTPS se usa **Vercel** (servidor) y **Turso** (base de datos SQLite en la nube, plan gratuito).

### 1. Crear la base de datos en Turso

1. Crea una cuenta gratuita en <https://turso.tech> (puedes entrar con GitHub).
2. Crea una base de datos, por ejemplo `turnoya`.
3. Copia la **URL** (`libsql://...`) y genera un **token** de acceso.

### 2. Importar el repositorio en Vercel

1. Entra a <https://vercel.com> con tu cuenta de GitHub.
2. **Add New → Project** e importa el repositorio `turnoya`.
3. En **Environment Variables** agrega:

| Variable | Valor | Obligatoria |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | `libsql://turnoya-....turso.io` | Sí |
| `TURSO_AUTH_TOKEN` | token generado en Turso | Sí |
| `TZ` | `America/Caracas` (o tu zona horaria) | Recomendada |

`TZ` es importante: en la nube el servidor usa UTC por defecto y las horas quedarían corridas.

4. Pulsa **Deploy**. Vercel te da una dirección `https://turnoya-....vercel.app` con HTTPS.

Cada vez que subas cambios a GitHub, Vercel vuelve a desplegar automáticamente.

### 3. Conectar la app Android

En **TurnoYa**, abre el menú **Cambiar servidor** y escribe la dirección de Vercel (por ejemplo `https://turnoya.vercel.app`). La app la guarda y la usa en las siguientes aperturas.

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `TURSO_DATABASE_URL` | URL de la base de datos en Turso. Si no existe, se usa el archivo local. |
| `TURSO_AUTH_TOKEN` | Token de Turso. |
| `PORT` | Puerto del servidor (por defecto `3000`). En Vercel lo asigna la plataforma. |
| `HOST` | Interfaz de escucha (por defecto `0.0.0.0`). |
| `DATA_DIR` | Carpeta del archivo SQLite en modo local (por defecto `data/`). |
| `TZ` | Zona horaria del servidor. |

## App para Android (APK)

La app **TurnoYa** es un contenedor de la misma interfaz web, pensado para usarse desde el teléfono o una tablet.

El APK ya compilado está en:

```
dist/TurnoYa.apk
```

### Instalación

1. Copia `dist/TurnoYa.apk` al teléfono (cable USB, Google Drive, correo, etc.).
2. En el teléfono, abre el archivo y permite la instalación desde esa fuente si Android lo solicita.
3. Abre **TurnoYa**.
4. Escribe la dirección del servidor:
   - **En línea**: `https://turnoya.vercel.app` (la que te dio Vercel).
   - **En local**: por ejemplo `http://192.168.1.50:3000`.
   - Si escribes solo una dirección sin `http://`, la app agrega `http://` y el puerto `3000`.
5. Pulsa **Conectar**. La dirección se guarda y se usa en las siguientes aperturas.

Desde el menú de la app puedes **Recargar**, **Cambiar servidor**, **Abrir en el navegador** y consultar **Acerca de**. Los reportes CSV se descargan a la carpeta **Descargas** del teléfono.

Si el servidor no responde, la app muestra una pantalla de error con las opciones **Reintentar** y **Cambiar servidor**, sin perder la dirección guardada. La barra superior indica el servidor al que está conectada.

> En modo local, el teléfono y la computadora deben estar en la misma red Wi-Fi y el servidor debe estar en ejecución. Si no conecta, revisa el firewall de Windows y que la IP sea la de la red Wi-Fi (no la de una máquina virtual).

### Compilar el APK (opcional)

Requisitos: Android Studio (SDK 37 y JDK 17 o superior) y conexión a Internet la primera vez.

Con Android Studio: abre la carpeta `android/` y usa **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.

Por consola, desde la carpeta `android/`:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

### Datos de ejemplo (opcional)

```bash
npm run demo
```

Crea 5 colaboradores y turnos de los últimos días para probar la aplicación. Solo funciona si la base de datos está vacía.

## Funciones

- **Inicio**: reloj en vivo y tarjetas por colaborador para marcar entrada, iniciar/finalizar pausas y marcar salida. Muestra cuántas personas están en turno, en pausa y las horas trabajadas hoy (incluye el tiempo transcurrido de los turnos abiertos).
- **Colaboradores**: alta, edición, activación/desactivación y eliminación de integrantes del equipo.
- **Registros**: consulta por rango de fechas y colaborador, totales del periodo, edición y captura manual de turnos (útil para corregir olvidos), y eliminación. Los turnos abiertos se pueden pausar, reanudar o cerrar desde aquí.
- **Reportes**: totales por colaborador y por día, pausas y horas extra. Incluye rangos rápidos (Hoy, Esta semana, Este mes, Mes anterior), impresión y exportación.
- **Ajustes**: nombre de la tienda, jornada diaria, dirección de acceso desde el celular, información del sistema, guía rápida y descarga de respaldo.
- **Exportar CSV**: descarga los registros del rango seleccionado con formato para Excel en español (separador `;` y decimales con coma).
- **Conexión**: si el servidor deja de responder, aparece un aviso con **Reintentar**; la app vuelve a cargar los datos automáticamente al recuperar la conexión.

## Horas extra

Las horas extra se calculan **por colaborador y por día**: si la suma de sus turnos completados en un día supera la jornada diaria configurada, el excedente cuenta como hora extra. Los turnos que aún no tienen salida no se incluyen en los reportes.

## Configuración

En la sección **Ajustes** puedes cambiar:

- El nombre de la tienda.
- La jornada diaria en horas (por defecto 8).

## Base de datos y respaldos

- **En local** los datos se guardan en `data/tienda.db` (archivos `tienda.db`, `tienda.db-wal` y `tienda.db-shm`). El respaldo descarga ese archivo `.db`.
- **En línea** los datos se guardan en Turso y el respaldo descarga un archivo `.sql` con las tablas y los datos, restaurable con la CLI de Turso o con SQLite.

Para restaurar en local: detén el servidor y reemplaza `data/tienda.db` por el archivo descargado. También puedes copiar la carpeta `data` completa con el servidor detenido.

Para reiniciar la información en local, detén el servidor, elimina la carpeta `data` y vuelve a iniciarlo.

## API

| Ruta | Descripción |
| --- | --- |
| `GET /api/salud` | Comprobación rápida de que el servidor responde. |
| `GET /api/info` | Nombre de la tienda, versión, modo (local/nube), puerto, Node.js y direcciones. |
| `GET /api/estado` | Colaboradores en turno, en pausa y resumen del día. |
| `GET /api/colaboradores` | Lista del equipo. |
| `GET /api/turnos` | Turnos filtrados por `desde`, `hasta` y `colaborador_id`. |
| `GET /api/reportes` | Totales por colaborador y por día, con horas extra. |
| `GET /api/reportes/csv` | Exportación CSV del rango solicitado. |
| `GET /api/respaldo` | Descarga la base de datos (`.db` en local, `.sql` en la nube). |

## Estructura del proyecto

```
├─ server.js            API HTTP y reglas de negocio
├─ db.js                Conexión y esquema (SQLite local o Turso)
├─ api/index.js         Entrada para Vercel
├─ vercel.json          Configuración de despliegue
├─ public/
│  ├─ index.html        Interfaz
│  ├─ styles.css        Estilos
│  └─ app.js            Lógica del navegador
├─ scripts/seed-demo.js Datos de ejemplo
├─ android/             Proyecto Android (app TurnoYa)
├─ dist/TurnoYa.apk     APK listo para instalar
└─ data/tienda.db       Base de datos local (se crea al iniciar)
```

## Notas

- La aplicación no tiene inicio de sesión: cualquiera con la dirección puede ver y editar los horarios. En línea, comparte la dirección solo con el personal de la tienda.
- Para cambiar el puerto en local: `PORT=8080 npm start` (en PowerShell: `$env:PORT=8080; npm start`).
