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

Usa `MockSource`, en memoria. No necesita configuración ni red.

## Modo local en el navegador (registro de eventos)

```bash
pnpm dev:local    # http://localhost:5173
```

Usa `LocalSource` (`docs/ARCHITECTURE.md` §5.0) con el registro guardado en el
`localStorage` del navegador. Arranca con una producción vacía que se conserva
al recargar. **Cada pestaña es un dispositivo:** abre dos para ver cómo se
combinan los cambios, igual que harán dos personas sobre la misma carpeta de
Dropbox. Por ahora solo cubre la estructura (árbol, niveles y estados); generar,
tomas y comentarios avisan en la consola de que aún no están disponibles.

Para empezar de cero, borra las claves `sweetflow:*` del `localStorage` (en las
herramientas de desarrollo, *Application → Local Storage*).

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

### Instalar en macOS

1. Abre el `.dmg` y arrastra **Sweet Flow** a *Aplicaciones*.
2. La primera vez, haz clic derecho sobre la app → **Abrir** → **Abrir**. También
   puedes ir a *Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente*.
3. Si macOS dice que la app «está dañada», quita la cuarentena:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Sweet Flow.app"
   ```

Mientras la app no esté firmada, macOS no permite actualizarla sola. La app
avisa cuando hay una versión nueva y abre la página de descarga.

### Instalar en Windows

1. Ejecuta `Sweet Flow-<versión>-win-x64.exe`.
2. Si aparece SmartScreen («Windows protegió su PC»), pulsa **Más información →
   Ejecutar de todos modos**.

En Windows, las actualizaciones se descargan solas y se instalan al cerrar la
app.
