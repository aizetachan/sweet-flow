# Sweet Flow — Estado y siguientes pasos

> Última actualización: 15 oct 2026. Arquitectura y decisiones en
> [`ARCHITECTURE.md`](ARCHITECTURE.md); cómo arrancar todo en
> [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Dónde estamos

**Fase 0 · Cimientos — hecha (pendiente de validar en Mac/Windows).**

| Pieza | Estado |
| --- | --- |
| Monorepo (pnpm) · `packages/domain` con tests · `packages/ui` | ✅ |
| UI de producción con datos de demo (`MockSource`): tablero, árbol, panel (Producir · Cortar y repartir · Revisión · Actividad), niveles, estados, equipo, biblioteca | ✅ pendiente de feedback visual |
| `FirebaseSource` (mismo contrato `DataSource`; se activa con `VITE_DATA_SOURCE=firebase`) | ✅ esqueleto |
| Firebase: reglas Firestore/RTDB/Storage por rol (49 tests con emuladores), Functions de estructura | ✅ esqueleto |
| Electron sin firmar (dmg universal + NSIS), updater que en macOS solo avisa | ✅ sin probar con interfaz gráfica |
| CI (typecheck, tests, reglas, instaladores Mac/Win) | ✅ primera ejecución pendiente |

Demo publicada de la UI: <https://claude.ai/artifact/SnnoThJwwjryYfVoYjAkst>

## Primero, en local

1. `pnpm install && pnpm dev` → revisar la UI en <http://localhost:5173>.
2. `pnpm dev:desktop` → **abrir la app de escritorio por primera vez** en Mac
   (y en Windows si hay máquina). No se pudo lanzar en la nube.
3. Revisar el primer run de CI y descargar los instaladores sin firmar.
4. Crear los proyectos Firebase `sweetflow-dev` / `sweetflow-prod` (Auth con
   Google, Firestore, Realtime Database, Storage) y rellenar `.env.local`.

## Decisiones pendientes de validar

- [ ] **Umbrales de rol** (implementados en las reglas):
  - El artista crea y mueve nodos, y solo cambia el estado de lo que tiene asignado.
  - El supervisor cambia cualquier estado, asigna, renumera y borra subárboles.
  - El admin cambia los niveles.
- [ ] **Permisos por producción:** los roles del espacio se copian a
      `productions/{id}/members` y ahí se ajustan.
- [ ] **Borrar un subárbol archiva sus media** y borra sus tomas y comentarios.
- [ ] **Feedback visual de la UI** (layout, densidad de las cards, panel derecho).

## Pendientes técnicos conocidos

- [ ] Mover los tipos compartidos de Firestore/callables de `@sweetflow/functions/api` a `@sweetflow/domain`.
- [ ] CSP en el renderer de Electron.
- [ ] La UI aún no usa `window.sweetflow` (elegir carpeta, abrir en Finder/Explorador).
- [ ] Antes de un `firebase deploy` real: quitar la devDependency `workspace:*` de `firebase/functions/package.json`.
- [ ] `FirebaseSource.linkFolder()` lanza `NotImplemented` (llega con la fase 4).
- [ ] Política de almacenamiento para lo archivado — [issue #1](https://github.com/aizetachan/sweet-flow/issues/1).
- [ ] Referencias de biblioteca entre cuentas de Magnific: validar en la fase 2 (§6).

## Siguientes fases

### Fase 1 · Estructura en tiempo real

- **Login:** con Google (Firebase Auth) y pantalla de bienvenida.
- **Espacios de trabajo:**
  - crear un espacio;
  - invitar por email o enlace con aprobación;
  - aceptar la invitación;
  - una Function que copie los roles del espacio a cada producción.
- **Producciones:** crear, listar y cambiar de producción. El selector ya existe en la UI.
- **Árbol y tablero sobre Firestore:** crear, insertar, mover, renombrar y borrar con las Functions ya escritas.
- **Niveles y estados editables:** guardados en Firestore, con historial en `activity`.
- **Presencia:** en RTDB, con avatares en el tablero y en el plano.
- **Pruebas:** e2e con dos usuarios en los emuladores, editando a la vez.

### Fase 2 · Generación

- **Conexión de Magnific por usuario:** OAuth 2.0 + PKCE, con tokens cifrados en el servidor. Hay stubs `magnificAuthStart` y `magnificAuthCallback`.
- **Worker en Cloud Run:** recibe la cola de jobs y usa el token de quien lanza.
  - Adaptador `GenerationProvider` de Magnific.
  - Copia del resultado a Storage.
  - `media` pasa a `ready`.
- **Vídeo de 30 s:** encadenar extend o concatenate si el modelo no llega.
- **Lotes y créditos:** estimación antes de lanzar y registro real por usuario, producción y nodo.
- **Referencias del desglose:** reparto, props y localizaciones en el prompt y como referencias de biblioteca.

### Fase 3 · Corte y reparto real

- **Tomas sobre vídeo real:** reproducción con entrada y salida.
- **Render de cortes:** servicio de ffmpeg en Cloud Run.
- **Posters y proxies:** fotograma de cada toma y proxies de baja resolución.

### Fase 4 · Espejo local

- **Motor de espejo:** en el utility process de Electron. Escucha Firestore, descarga de Storage y escribe con escritura atómica.
- **Rutas en el disco:**
  - manifest id ↔ ruta;
  - `rename` al cambiar títulos o códigos;
  - rutas con `folderName()` (§5.3).
- **Sincronización selectiva:** por secuencia o escena, con aviso si alguien modifica la réplica.

### Fase 5 en adelante

- **Revisión:** notificaciones y anotación sobre el fotograma.
- **Biblioteca:** completa, con creación de assets.
- **Montaje:** timeline de escena o secuencia y export.
- **Más adelante:** web de revisión, firma de apps y política de almacenamiento.
