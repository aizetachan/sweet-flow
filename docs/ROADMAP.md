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

### Análisis hechos (19 oct 2026)

- **Exportar a Premiere y DaVinci Resolve:** [`EXPORTAR-NLE.md`](EXPORTAR-NLE.md).
  Primero un archivo OTIO + FCP7 XML; después paneles (Premiere UXP, script y
  Workflow Integration de Resolve) para ida y vuelta. **Aparcado** hasta que
  esté montado lo demás (decidido el 19 oct 2026).
- **Usuarios, invitaciones y vista de invitado:** [`USUARIOS.md`](USUARIOS.md).
  Decisiones del 19 oct 2026: identidad del equipo por Magnific, una sola
  carpeta; cada miembro ve en Dropbox o Drive solo las carpetas que se le dan
  en Sweet Flow; invitan el propietario y los miembros (si el propietario lo
  permite). El cliente no entra al almacenamiento ni necesita Magnific: ve los
  mismos vídeos (sin copias), comenta y marca «Validado» (un comentario que
  avisa al equipo, que aprueba). **Revisión del cliente aparcada** hasta tener
  lo demás: buscar un servidor mínimo y barato (opciones en USUARIOS.md §5).

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
4. **Conectar Dropbox y Google Drive — hecho en el navegador (19 oct 2026).**
   **Se prueba con cuentas reales al montar la app de escritorio** (decidido el
   19 oct 2026): registrar la app en cada servicio (`DEVELOPMENT.md`), hacer
   que el inicio de sesión vuelva a la app de escritorio (hoy vuelve a
   `localhost`; también el de Magnific) y probar con dos personas. Requisitos
   que se mantienen:
   Requisito: Sweet Flow se instalará en otras máquinas y cada usuario tiene
   que poder conectar su Dropbox (o Drive) sin saber nada técnico:
   - Una sola app «Sweet Flow» registrada en Dropbox y en Google; su
     identificador va dentro de la app. El usuario solo pulsa «Conectar», inicia
     sesión en el navegador y elige la carpeta del equipo. Sin claves ni
     configuración.
   - En escritorio, el login vuelve a la app por `http://127.0.0.1:<puerto>` o
     por un esquema propio (`sweetflow://`); el token se guarda cifrado
     (`safeStorage`).
   - Dropbox: mientras la app esté en modo desarrollo, solo puede enlazarla un
     número limitado de usuarios; antes de repartirla hay que pedir el paso a
     producción.
   - Google Drive: proyecto en Google Cloud con pantalla de consentimiento; en
     modo de prueba solo entran los usuarios de prueba que se añadan. El permiso
     `drive.file` vale con el selector de Google; el permiso `drive` exige
     verificación (§2.2).

   Detalle técnico (etapa B, decisión 11): `FolderFs` sobre la API de
   Dropbox con OAuth PKCE, desde Ajustes, y copia local opcional. Necesita el
   *App key* de una app de Dropbox (Scoped access, Full Dropbox, permisos
   `files.metadata.*` y `files.content.*`, redirección
   `http://localhost:5180/auth/dropbox`).
5. **Carpetas de los nodos en disco:** `SQ010_…/SC010_…/SH0010_…` con
   `folderName()` (§5.3) y reparación al abrir.
6. **Varias personas:** probar con dos ordenadores sobre la misma carpeta
   compartida.
7. **Google Drive:** el mismo `FolderFs` sobre la API v3.
8. **Escritorio:** probar la carpeta en Electron (o `FolderFs` con Node), y
   ahí **Dropbox y Drive con cuentas reales** (paso 4).

### Fase 2 · Generación

**Hecho (16 oct 2026), en modo local en el navegador:**
- Conectar Magnific por persona en *Ajustes › Integraciones* (OAuth con PKCE,
  registro automático del cliente) y llamar a sus herramientas MCP sin modelo de
  lenguaje en medio. En desarrollo, el servidor de Vite reenvía las llamadas.
- Generar imagen o vídeo desde el panel de una escena o un plano, con el coste
  real (`simulate_cost`) en el botón. El trabajo queda en el registro
  (`media.added` / `media.updated`): en cola, generando, listo o fallido; si se
  recarga la página, se retoma.
- El archivo se guarda en la carpeta del equipo, en
  `…/SQ010_…/SC010_…/SH0010_…/_media/SH0010_img_v001.png`. Las carpetas de
  los nodos se crean al crearlos y se mueven al renombrar, renumerar o mover.
- En Magnific, lo generado va a la carpeta del nodo (proyecto › carpetas › SQ ›
  SC › SH), creada la primera vez.

**Pendiente:**

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

### Generar: siguientes pasos

- ✅ Catálogo de modelos de Magnific en vivo y elección de modelos en Ajustes › Modelos (19 oct 2026). Pendiente: que la elección sea del equipo (hoy, de cada ordenador).
- ✅ Referencias del ordenador: subir o arrastrar archivos, que se suben a Magnific (19 oct 2026).
- Voz (TTS) con elección de voz; referencia de vídeo para la música; movimiento de cámara y multiplano en Seedance.
- Referencias de personaje, producto y localización de Magnific (su biblioteca), junto con la biblioteca editable.

### Formato de la producción

- Proporción por producción (16:9 por defecto; 9:16 para vertical): miniaturas, tarjetas, visor y la proporción por defecto al generar.

### Revisión: siguientes pasos

- Avisos de todas las producciones en el dashboard (hoy, los de la abierta).
- Aviso del sistema operativo en la app de escritorio; email (necesita un servicio externo).
- Acceso por carpetas o producciones: hoy quien tiene la carpeta del equipo ve todo; limitar quién entra y a quién se puede mencionar.
- Dibujar sobre el fotograma (además del punto).

### Compartir: siguientes pasos

- **Enlace para la app de escritorio:** protocolo `sweetflow://plano/…` registrado por la app, para que el enlace la abra directamente (hoy el enlace es la dirección de la app web).
- **Vista previa para invitados sin acceso** (un enlace que se abre en cualquier navegador). Necesita alojar el archivo en un sitio público. Opciones:
  1. **Enlace compartido de Dropbox** (cuando conectemos su API): el vídeo ya está ahí; «cualquiera con el enlace», con caducidad.
  2. **Magnific:** sus creaciones y proyectos se pueden compartir (`projects_share`); sirve si el invitado tiene cuenta.
  3. **Página de revisión propia** (más adelante, con servidor): vídeo, versión y comentarios del invitado, con caducidad y contraseña.

### Menú contextual: más adelante

- **Compartir el enlace** de un plano o un grupo (abre la producción en ese
  punto), cuando haya equipo conectado.
- Otras opciones posibles: duplicar un plano, moverlo a otra escena, copiar la
  ruta de su carpeta.

### Grupos de planos (pilas) ✅ (INTERFAZ §2.4)

Decidido el 18 oct 2026: dentro de una escena se pueden agrupar planos para
tenerlos juntos (por ejemplo, varios por decidir o por validar). Al arrastrar
un plano sobre otro se crea un grupo con portada, como una carpeta; al abrirlo,
la fila muestra lo que hay dentro.
- Es una **carpeta en disco** dentro de la escena. Los planos de dentro
  **mantienen su código y su nombre**; el grupo no se muestra en su ruta, como
  en Google Drive.
- **Pendiente:** arrastrar la tarjeta del grupo para reordenarlo en la fila.
- **Anotado para más adelante:** el orden de montaje de los planos de un grupo
  (en qué orden entran en el montaje final). De momento no hace falta.

### Fase 3 · Corte y reparto real

- **Tomas sobre vídeo real:** reproducción con entrada y salida. ✅ Los planos
  cortados de un vídeo reproducen solo su tramo (18 oct 2026).
- **Render de cortes:** ffmpeg local en el utility process.
- **Posters y proxies:** fotograma de cada toma y proxies de baja resolución.

### Fase 4 en adelante

- **Revisión:** comentarios con timecode, avisos de cambios y anotación sobre el fotograma.
- **API de Dropbox (etapa B):** `DropboxSource`, sin necesidad del cliente de Dropbox.
- **Tiempo real (etapa C):** Firebase Auth, Firestore, presencia y roles en el servidor. Aquí se retoma el esqueleto de Firebase.
- **Biblioteca:** completa, con creación de assets.
- **Montaje:** timeline de escena o secuencia y export.
- **Más adelante:** web de revisión, firma de apps y política de almacenamiento.
