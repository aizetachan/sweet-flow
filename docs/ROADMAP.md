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

### Interfaz — primera versión ✅

Ver [`INTERFAZ.md`](INTERFAZ.md): pantalla de carga, dashboard tipo Frame.io,
panel de trabajo a la izquierda y estructura a la derecha, ventanas flotantes y
aparte, reordenar y mover arrastrando, número del código editable. Pendiente: la
siguiente ronda de ajustes visuales y conectar el dashboard a la carpeta real
(paso 3).

### Mejoras de interfaz propuestas (sin priorizar)

Anotadas el 15 oct 2026, pendientes de que el usuario elija orden:

1. **Fijados dentro de la producción:** desplegable en la barra superior para
   saltar entre planos fijados sin volver al inicio.
2. **Buscador rápido (⌘K):** escribir un código o parte de un título y saltar a
   ese plano, escena, carpeta o producción.
3. **Atajos en el tablero:** flechas entre tarjetas, Intro abre el panel, Esc lo
   cierra, 1–6 cambian el estado, P fija.
4. **Continuar donde lo dejaste:** al abrir una producción, volver al último
   plano seleccionado.
5. **Menú de clic derecho** en tarjetas, árbol y dashboard: fijar, ventana
   aparte, estado, duplicar, papelera.
6. **Cambios en bloque:** estado o responsable para toda la selección múltiple.
7. **Filtro «Míos»:** solo lo asignado a mí.
8. **Estados vacíos con guía** en el resto de pantallas (el tablero ya la tiene).
9. **Progreso por escena** (3/6 aprobados) en la cabecera de cada fila.

### Fase 1 · Producción en carpeta (etapa A)

1. ✅ **Registro de eventos en `packages/domain`:** tipos de evento, reloj lógico
   híbrido y combinación de registros (puro, con tests: orden estable, último
   que escribe por campo, choques de numeración).
2. ✅ **`LocalSource` con estructura:** árbol, niveles y estados, sobre un
   `LogStore` intercambiable. Se prueba en el navegador con `pnpm dev:local`
   (cada pestaña es un dispositivo); la demo sigue con `MockSource`.
3. ✅ **Carpeta del equipo:** «Carpeta de este ordenador» en Ajustes (Chrome
   y Edge), sobre `FolderFs` (`docs/ARCHITECTURE.md` §5.4). El dashboard y las
   producciones son carpetas reales con su registro; renombrar o mover mueve la
   carpeta. Se revisan los cambios cada 2,5 s.
4. **Conectar Dropbox** (etapa B, decisión 11): `FolderFs` sobre la API de
   Dropbox con OAuth PKCE, desde Ajustes, y copia local opcional. Necesita el
   *App key* de una app de Dropbox (Scoped access, Full Dropbox, permisos
   `files.metadata.*` y `files.content.*`, redirección
   `http://localhost:5180/auth/dropbox`).
5. **Carpetas de los nodos en disco:** `SQ010_…/SC010_…/SH0010_…` con
   `folderName()` (§5.3) y reparación al abrir.
6. **Varias personas:** probar con dos ordenadores sobre la misma carpeta
   compartida.
7. **Google Drive:** el mismo `FolderFs` sobre la API v3.
8. **Escritorio:** probar la carpeta en Electron (o `FolderFs` con Node).

### Fase 2 · Generación

- **Conexión de Magnific por usuario:** OAuth 2.0 + PKCE desde la app de escritorio; token cifrado con `safeStorage`.
- **Carpetas en Magnific:** la estructura se refleja en la cuenta de cada
  usuario **hasta el plano** (proyecto › carpetas del dashboard › SQ › SC ›
  SH). Se crean en la primera generación de cada plano, no al crearlo.
  Renombrar en la app renombra en Magnific; borrar en la app no borra en
  Magnific. Magnific tiene proyectos en la raíz, carpetas anidadas y permite
  mover lo generado a una carpeta (comprobado con su MCP, 16 oct 2026). Falta
  confirmar cómo se conecta una app externa: su servidor MCP con el login de
  cada usuario o su API pública.
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
