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
| CI (typecheck, tests, reglas, instaladores Mac/Win) | ✅ en verde |

Demo publicada de la UI: <https://claude.ai/artifact/SnnoThJwwjryYfVoYjAkst>

## Cambio de rumbo: primero local, sobre Dropbox (15 oct 2026)

La prueba de concepto **no usa Firebase**. La producción vive en una carpeta
(dentro de una carpeta compartida de Dropbox para trabajar en equipo), con un
registro de eventos por dispositivo. Después llegará la API de Dropbox, y
Firestore solo cuando haga falta tiempo real. Los archivos se quedan en Dropbox:
Cloud Storage sale del plan. Detalle en `ARCHITECTURE.md` §2.1 y §5.

El código de Firebase (`FirebaseSource`, reglas, Functions) se mantiene como
esqueleto para la etapa C, pero no se sigue desarrollando por ahora.

## Primero, en local

1. `pnpm install && pnpm dev` → revisar la UI en <http://localhost:5173>.
2. `pnpm dev:desktop` → **abrir la app de escritorio por primera vez** en Mac
   (y en Windows si hay máquina). No se pudo lanzar en la nube.
3. Descargar del CI los instaladores sin firmar y probarlos.

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
- [ ] `FirebaseSource.linkFolder()` lanza `NotImplemented` (etapa C; en local la carpeta la elige `LocalSource`).
- [ ] Política de almacenamiento para lo archivado — [issue #1](https://github.com/aizetachan/sweet-flow/issues/1).
- [ ] Referencias de biblioteca entre cuentas de Magnific: validar en la fase 2 (§6).

## Siguientes fases

Se avanza poco a poco: cada paso deja la app funcionando.

### Fase 1 · Producción en carpeta (etapa A)

1. **Registro de eventos en `packages/domain`:** tipos de evento, reloj lógico
   híbrido y combinación de registros (puro, con tests: orden estable, último
   que escribe por campo, choques de numeración).
2. **`LocalSource` con estructura:** árbol, niveles y estados. Guarda y carga una
   producción desde una carpeta; la demo del navegador sigue con `MockSource`.
3. **Carpeta desde Electron:** elegir carpeta (`pickFolder()`), escritura
   atómica en el utility process e IPC tipado hacia la UI.
4. **Carpetas en disco:** crear, renombrar y mover carpetas con `folderName()`
   (§5.3) y reparación al abrir.
5. **Varias personas:** vigilar la carpeta (`fs.watch`) para ver los cambios
   que trae Dropbox; probar con dos dispositivos sobre la misma carpeta.
6. **Producciones:** crear, listar y abrir producciones dentro de la carpeta. El
   selector ya existe en la UI.

### Fase 2 · Generación

- **Conexión de Magnific por usuario:** OAuth 2.0 + PKCE desde la app de escritorio; token cifrado con `safeStorage`.
- **Cola en el utility process:** adaptador `GenerationProvider` de Magnific; el resultado se descarga a `_media/` del nodo y se registra el evento.
- **Vídeo de 30 s:** encadenar extend o concatenate si el modelo no llega.
- **Lotes y créditos:** estimación antes de lanzar y registro real por usuario, producción y nodo.
- **Referencias del desglose:** reparto, props y localizaciones en el prompt y como referencias de biblioteca.

### Fase 3 · Corte y reparto real

- **Tomas sobre vídeo real:** reproducción con entrada y salida.
- **Render de cortes:** ffmpeg local en el utility process.
- **Posters y proxies:** fotograma de cada toma y proxies de baja resolución.

### Fase 4 en adelante

- **Revisión:** comentarios con timecode, avisos de cambios y anotación sobre el fotograma.
- **API de Dropbox (etapa B):** `DropboxSource`, sin necesidad del cliente de Dropbox.
- **Tiempo real (etapa C):** Firebase Auth, Firestore, presencia y roles en el servidor. Aquí se retoma el esqueleto de Firebase.
- **Biblioteca:** completa, con creación de assets.
- **Montaje:** timeline de escena o secuencia y export.
- **Más adelante:** web de revisión, firma de apps y política de almacenamiento.
