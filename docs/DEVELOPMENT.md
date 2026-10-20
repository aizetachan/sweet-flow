# Sweet Flow — Desarrollo

Requisitos: Node 22 (`.nvmrc`), pnpm 10 (`corepack enable`). Para los
emuladores de Firebase, además, Java 21 o superior.

```bash
pnpm install
```

## Solo la UI (datos de demostración)

```bash
pnpm dev          # http://localhost:5173
```

Demo en memoria: el dashboard trae la carpeta `Mareas › Temporada 1` con el
episodio de ejemplo (`MockSource`). Lo que se crea se pierde al recargar. No
necesita configuración ni red.

## Modo local en el navegador (registro de eventos)

```bash
pnpm dev:local    # http://localhost:5173
```

El dashboard y cada producción se guardan en el `localStorage` del navegador
con `LocalSource` (`docs/ARCHITECTURE.md` §5.0), y se conservan al recargar.
**Cada ventana es un dispositivo:** abre dos, o saca un plano a una ventana
aparte, para ver cómo se combinan los cambios, igual que harán dos personas
sobre la misma carpeta de Dropbox. Por ahora solo cubre la estructura (árbol,
niveles, estados, responsables); generar, tomas y comentarios aparecen como
"Próximamente".

**Carpeta del equipo:** en *Ajustes › Almacenamiento › Elegir carpeta* (Chrome o
Edge) se elige una carpeta de este ordenador y todo pasa a guardarse ahí, en
carpetas legibles (`docs/ARCHITECTURE.md` §5.4). Si la carpeta está dentro de
Dropbox o Drive, su app la sincroniza. Lo que había en el navegador no se copia.
Al volver a abrir el navegador puede pedir permiso otra vez: sale un aviso con
el botón «Abrir». «Dejar de usarla» vuelve al almacenamiento del navegador.

La app de escritorio usa este mismo modo (en su propio almacenamiento) hasta
que se pruebe allí la carpeta.

Para empezar de cero, borra las claves `sweetflow:*` del `localStorage` (en las
herramientas de desarrollo, *Application → Local Storage*).

## Carpeta del equipo en Dropbox o Google Drive

En modo local (`pnpm dev:local`, <http://localhost:5180>), Ajustes ›
Almacenamiento conecta Dropbox o Google Drive por su API y deja elegir la
carpeta compartida del equipo. Sweet Flow necesita estar registrada **una vez**
en cada servicio (no por usuario): su identificador va en
`packages/app/.env.local` (ver `packages/app/.env.example`). Sin él, la tarjeta
dice «Sin configurar». Cada persona conecta después su propia cuenta con
«Conectar».

### Dropbox

1. <https://www.dropbox.com/developers/apps> › **Create app** › *Scoped
   access* › *Full Dropbox* › nombre (p. ej. «Sweet Flow»).
2. Pestaña **Permissions**: marcar `account_info.read`,
   `files.metadata.read`, `files.metadata.write`, `files.content.read`,
   `files.content.write`, `sharing.read` y `sharing.write` (para compartir
   carpetas al invitar), y **Submit**. Si se cambian después de conectar,
   hay que desconectar Dropbox en Ajustes y volver a conectarlo: la conexión
   guarda los permisos que había al entrar.
3. Pestaña **Settings**:
   - *OAuth 2 › Redirect URIs*: `http://localhost:5180/auth/dropbox` (y
     `http://localhost:5173/auth/dropbox` si se usa ese puerto). Para la app de
     escritorio, también `http://127.0.0.1:53134/auth/dropbox`.
   - *Allow public clients (Implicit Grant & PKCE)*: **Allow**. No hace falta el
     *App secret*.
4. Copiar el **App key** a `VITE_DROPBOX_APP_KEY`.

Mientras la app esté en *Development*, solo pueden enlazarla un número
limitado de cuentas (lo indica la consola); antes de repartirla hay que pedir
el paso a *Production*. Las carpetas de equipo de Dropbox Business se ven
junto a las propias.

### Google Drive

1. <https://console.cloud.google.com> › proyecto nuevo (p. ej. «Sweet Flow»).
2. **APIs y servicios › Biblioteca** › *Google Drive API* › **Habilitar**.
3. **Pantalla de consentimiento de OAuth** (Google Auth Platform): tipo
   *Externo*, nombre de la app y email de soporte. En *Público*, añadir como
   **usuarios de prueba** las cuentas del equipo (hasta 100 mientras esté en
   pruebas).
4. **Credenciales › Crear credenciales › ID de cliente de OAuth** ›
   *Aplicación web*:
   - *Orígenes de JavaScript autorizados*: `http://localhost:5180`.
   - *URI de redirección autorizados*: `http://localhost:5180/auth/google` y,
     para la app de escritorio, `http://127.0.0.1:53134/auth/google`.
5. Copiar el **ID de cliente** a `VITE_GOOGLE_CLIENT_ID` y el **secreto** a
   `GOOGLE_CLIENT_SECRET` (sin `VITE_`: nunca llega a la página). En el
   navegador lo añade el servidor de desarrollo al pedir los tokens
   (`/google/token` en `vite.config.ts`); en la app de escritorio lo añade el
   proceso principal, que lo lleva dentro al construirla
   (`apps/desktop/scripts/bundle.mjs` lo toma de `GOOGLE_CLIENT_SECRET` en el
   entorno o de `packages/app/.env.local`).

Se pide el permiso `drive` (todo Drive), porque la carpeta del equipo ya existe
y otros la comparten. Es un permiso «restringido»: en modo de pruebas funciona
con los usuarios de prueba; para abrirla a cualquiera, Google exige
verificar la app (y una evaluación de seguridad). El token de Google caduca
cada hora y se renueva solo.

Tras cambiar `.env.local`, reiniciar `pnpm dev:local`.

## App de escritorio en desarrollo

```bash
pnpm dev:desktop
```

Arranca el servidor de Vite de la UI y abre Electron cargándolo desde
`http://localhost:5173` (con recarga en caliente). Los cambios en
`apps/desktop/src` (main, preload, utility process) reconstruyen el bundle y
reabren la ventana. Cerrar la ventana termina la sesión.

El renderer recibe una API mínima en `window.sweetflow`
(`apps/desktop/src/shared/api.ts`): versión, plataforma, `pickFolder()` y
`revealInFolder(path)`. En el navegador no existe, así que la UI la trata como
opcional.

## Firebase en local (emuladores)

```bash
pnpm emulators    # Auth, Firestore, RTDB, Storage y Functions · UI en http://127.0.0.1:4000
pnpm test:rules   # tests de reglas (Firestore, RTDB, Storage) contra los emuladores
```

`pnpm test:rules` arranca y para los emuladores solo (`firebase emulators:exec`)
y no forma parte de `pnpm test`. La primera vez descarga los emuladores
(~100 MB). El proyecto `demo-sweetflow` no existe en la nube: nada sale de tu
máquina. Antes de `pnpm emulators`, compila las Functions con
`pnpm --filter @sweetflow/functions build`.

Para que la UI use Firebase en vez de la demo, crea `packages/app/.env.local`:

```bash
VITE_DATA_SOURCE=firebase
VITE_FIREBASE_EMULATORS=true          # con emuladores no hace falta nada más
# Con un proyecto real (dev/prod), en lugar de lo anterior:
# VITE_FIREBASE_API_KEY=…
# VITE_FIREBASE_AUTH_DOMAIN=…
# VITE_FIREBASE_PROJECT_ID=sweetflow-dev
# VITE_FIREBASE_STORAGE_BUCKET=…
# VITE_FIREBASE_DATABASE_URL=…
# VITE_FIREBASE_APP_ID=…
```

Sin `VITE_DATA_SOURCE=firebase`, la app sigue usando la demo.

Proyectos: `.firebaserc` define los alias `dev` (`sweetflow-dev`) y `prod`
(`sweetflow-prod`). Todavía no hay despliegue.

### Cómo se reparten los permisos

- Firestore decide el acceso con `productions/{id}/members/{uid}`. Las
  Functions copian ahí el rol del espacio de trabajo y permiten ajustarlo por
  producción.
- La presencia (Realtime Database) se protege con `access/{prodId}/{uid}`,
  que mantiene la Function `onProductionMemberWritten`.
- Crear, numerar, mover y borrar nodos, y cambiar niveles, solo se hace con
  Functions (`createNode`, `moveNode`, `renumberSiblings`, `deleteSubtree`,
  `updateLevels`).

## Instaladores sin firmar

```bash
pnpm dist:mac     # en un Mac: .dmg universal (Apple Silicon + Intel)
pnpm dist:win     # en Windows: instalador NSIS x64
```

Salen en `apps/desktop/release/`. `pnpm build:desktop` solo genera el bundle
(`apps/desktop/out/`) sin empaquetar.

La CI (`.github/workflows/ci.yml`) construye los dos en cada push y en cada PR.
Los instaladores se descargan desde la ejecución, en *Artifacts*.

Las claves de Dropbox y Google se meten en la app al construirla: un instalador
hecho en un ordenador con `packages/app/.env.local` relleno las lleva; los de la
CI, no (no tiene ese archivo).

La app instalada carga la interfaz desde `sf-app://app/`
(`apps/desktop/src/main/appProtocol.ts`), no desde `file://`. Así tiene un
origen propio y estable, y el proceso principal hace de relevo para lo mismo
que el servidor de desarrollo: el MCP, los tokens y los archivos de Magnific, y
los tokens de Google con el secreto.

### Pasar el instalador a un compañero

1. En el Mac con `packages/app/.env.local` relleno: `pnpm dist:mac`.
2. Pasarle `apps/desktop/release/Sweetflow-<versión>-mac-universal.dmg`. Vale
   para Apple Silicon y para Intel.
3. Él lo instala como se explica más abajo y, en la app:
   - se conecta con **su** cuenta de Magnific;
   - en Ajustes › Almacenamiento, conecta **su** Dropbox o Drive, o elige una
     carpeta de su ordenador.
4. Para trabajar sobre la misma carpeta del equipo, compártesela antes desde
   Dropbox o Drive.

### Instalar en macOS

1. Abre el `.dmg` y arrastra **Sweetflow** a *Aplicaciones*.
2. La primera vez, haz clic derecho sobre la app → **Abrir** → **Abrir**. También
   puedes ir a *Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente*.
3. Si macOS dice que la app «está dañada», quita la cuarentena:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Sweetflow.app"
   ```

Mientras la app no esté firmada, macOS no permite actualizarla sola. La app
avisa cuando hay una versión nueva y abre la página de descarga.

### Instalar en Windows

1. Ejecuta `Sweetflow-<versión>-win-x64.exe`.
2. Si aparece SmartScreen («Windows protegió su PC»), pulsa **Más información →
   Ejecutar de todos modos**.

En Windows, las actualizaciones se descargan solas y se instalan al cerrar la
app.
