# Sweet Flow — Arquitectura

> Estado: **borrador para validar**. Fase 0 implementada (ver `ROADMAP.md`).
> Decisiones tomadas: **primero local, sobre una carpeta compartida (Dropbox)**;
> Firebase solo cuando haga falta tiempo real (§2.1) · app de escritorio
> (Electron) para **macOS y Windows** · Magnific con la cuenta de cada usuario.
> Resumen de decisiones en §11.

## 1. Concepto y alcance

Sweet Flow es una herramienta de **producción audiovisual con IA para piezas
largas** (series de 45 min, películas) y equipos amplios. Hereda de Magnific
Studio la pantalla de producción (cards de plano, generación, biblioteca), pero
**elimina las fases previas** (idea, guion, storyboard): la pantalla principal
*es* la producción.

Principios:

1. **Estructura = carpetas, igual en la app y en el disco.** La producción es un
   árbol de niveles configurables. Por defecto `Secuencia › Escena › Plano`,
   con códigos `SQ010 / SC010 / SH0010`. El equipo puede renombrar niveles,
   cambiar prefijos y numeración, y añadir niveles (p. ej. `Episodio`).
2. **El último nivel es la unidad de trabajo** (las cards de plano).
3. **Cualquier nivel puede ser punto de producción**, según configuración. Por
   defecto la **escena** genera: un vídeo largo (≈30 s) que se corta, se edita
   y se reparte a sus planos, o se mantiene entero en la escena. La
   **secuencia** no genera: agrupa y guarda montajes.
4. **Media ≠ Toma.**
   - *Media* es el archivo generado. Es inmutable y está versionado (`v001`, `v002`…).
     Vive en la carpeta del nodo que lo produjo.
   - *Toma* es un corte no destructivo (entrada y salida) de un media, colocado
     en un nodo.
   - Un clip de escena alimenta varios planos, y el corte se puede rehacer sin
     regenerar.
5. **Cada plano contiene muchas versiones**, con estado, responsable, toma
   elegida y comentarios. Todo el equipo ve los avances: primero con unos
   segundos de retraso (lo que tarde Dropbox) y, más adelante, en tiempo real.
6. **Producción en masa.** La generación corre en cola y en lotes (primero
   desde la app de escritorio, después en el servidor). Lo producido aparece en
   la app y se guarda **ordenado en la carpeta de la producción**.

Fuera de alcance en v1: escritura de guion, edición final de color/sonido, y
distribución.

## 2. Vista general

### 2.1 Etapas de almacenamiento

El almacenamiento se monta por etapas. La UI no cambia entre ellas: solo habla
con `DataSource` (`packages/app/src/data/source.ts`) y cada etapa es una
implementación distinta.

| Etapa | Estado de la producción | Archivos (media) | Compartir | `DataSource` |
| --- | --- | --- | --- | --- |
| **A. Prueba de concepto** | Registro de eventos en la carpeta de la producción (§5.0) | En la misma carpeta, ordenados por código (§5.2) | La carpeta vive en una **carpeta compartida de Dropbox**; la sincroniza el cliente de escritorio de Dropbox. Los cambios llegan en segundos | `LocalSource` (escritorio) |
| **B. API de Dropbox / Google Drive** | Igual que A | Igual que A | OAuth del proveedor por usuario; la app lee y escribe por API y detecta cambios (§2.2). No hace falta el cliente de escritorio (web de revisión) | `CloudSource` (un adaptador por proveedor) |
| **C. Tiempo real** | Firestore (§3 y §4): presencia, listeners y roles aplicados en el servidor | **Siguen en Dropbox.** Cloud Storage desaparece del plan | Firebase Auth + Dropbox | `FirebaseSource` |

Por qué Dropbox para los archivos:

- El equipo ya comparte un Dropbox. No hay que gestionar cuentas ni reglas de
  Storage para los archivos.
- El cliente de Dropbox ya hace descarga, subida, sincronización selectiva y
  trabajo sin conexión. Eso cubre buena parte del espejo local (§5.2).
- El vídeo pesa mucho: el almacenamiento y la descarga en la nube cuestan; un
  plan de Dropbox es un coste fijo.
- Los archivos siguen siendo del equipo y se abren con cualquier herramienta.

Lo que Dropbox no da, y por eso se aplaza a la etapa C:

- **Tiempo real.** Sin presencia ni avatares en vivo; los cambios llegan con
  unos segundos de retraso.
- **Roles.** Dropbox solo distingue lectura y edición por carpeta. En A y B los
  roles (§8) se muestran en la UI, pero no se pueden imponer: quien edita la
  carpeta puede cambiarlo todo.

### 2.2 Proveedores: Dropbox y Google Drive

Cada equipo elige dónde guarda: **Dropbox** o **Google Drive** (decisión 10).
El formato en la carpeta es el mismo (§5), así que el resto de la app no
distingue entre ellos.

**Etapa A (carpeta sincronizada).** Los dos tienen cliente de escritorio que
sincroniza una carpeta local, y la app solo escribe en esa carpeta:

| | Dropbox | Google Drive para escritorio |
| --- | --- | --- |
| Carpeta del equipo | Carpeta compartida | Unidad compartida (recomendado) o carpeta compartida |
| Ruta en macOS | `~/Library/CloudStorage/Dropbox…` | `~/Library/CloudStorage/GoogleDrive-<cuenta>/…` (en Windows, una unidad `G:`) |
| Archivos solo en la nube | Opción "solo en línea" | Modo "Transmitir archivos" (por defecto): se descargan al abrirlos |
| Choques al guardar a la vez | Crea una "copia en conflicto" | Crea una copia duplicada |

- El registro por dispositivo (§5.0) evita los choques en los dos: nadie
  escribe nunca en el archivo de otro.
- **A validar con Google Drive:** que la app vea a tiempo los cambios que trae
  el cliente (en macOS las dos usan *File Provider* y `fs.watch` puede
  retrasarse; si hace falta, se relee la carpeta cada pocos segundos), y que
  leer un registro aún no descargado lo descarga sin bloquear la app.
- Para vídeo pesado, conviene marcar la carpeta de la producción como
  "disponible sin conexión" en los dos servicios.

**Etapa B (API).** Un adaptador por proveedor detrás de la misma interfaz
(`LogStore` + archivos):

| | Dropbox API | Google Drive API v3 |
| --- | --- | --- |
| Detectar cambios | `files/list_folder/longpoll`, sin servidor | `changes.list` con *page token* (consultar cada pocos segundos); `changes.watch` necesita un servidor que reciba avisos |
| Añadir eventos | No hay "append": se sube el archivo del dispositivo entero | Igual: nueva revisión del archivo |
| Permisos de la app | Acceso a una carpeta de la app o a todo Dropbox | `drive.file` (solo lo que el usuario elige con el selector de Google) o `drive` (acceso completo: Google exige una verificación de seguridad para apps públicas) |

- **A validar con Google:** si con `drive.file` y el selector de carpetas la
  app puede leer lo que otros miembros crean dentro de la unidad compartida.
  Si no, hará falta el permiso `drive` y su verificación.

El diagrama siguiente es el de la **etapa C**:

```
┌──────────────────────────── App de escritorio (Electron, macOS + Windows) ───┐
│  Renderer (React + TS)                Main / utility process (Node)          │
│  - Tablero, árbol, panel de plano     - Motor de espejo local (sync daemon)  │
│  - Cortador, revisión, comentarios    - ffmpeg local (previews/export)       │
│  - Firebase JS SDK (tiempo real,      - Auto-update, IPC tipado              │
│    caché offline)                                                            │
└───────────────┬─────────────────────────────────────────┬────────────────────┘
                │ Firestore / RTDB                        │ archivos
                ▼                                         ▼
┌──────────────────────────── Firebase / GCP ──────────────┐   Dropbox (carpeta compartida)
│ Auth · Firestore (fuente de verdad) · RTDB (presencia)   │     <Producción>/SQ010/SC010/…
│ Cloud Functions (triggers, API) · Cloud Tasks (cola)     │
│ Cloud Run: worker de generación · render ffmpeg          │
│ Secret Manager (credenciales de proveedores)             │
└───────────────┬──────────────────────────────────────────┘
                ▼
        Proveedores de generación (Magnific MCP/API; extensible)
```

**Prioridad: escritorio.** Una **web de revisión** (mismo renderer, sin espejo
local) para que supervisores o clientes vean y comenten sin instalar nada queda
**anotada para una fase posterior**. La arquitectura no la impide, porque el
renderer no depende de Electron.

## 3. Modelo de datos (Firestore)

> Este modelo es el de la **etapa C** (§2.1). Las entidades (`ProdNode`,
> `Media`, `Take`…) son las mismas en todas las etapas y viven en
> `packages/domain`; lo que cambia es dónde se guardan.

Lección de Magnific Studio: un único JSON por proyecto no escala, porque Firestore
limita cada documento a 1 MB, hay que hacer diff global y gana el último que escribe.
Aquí cada entidad es **un documento**, con listeners finos y reglas por
documento.

```
workspaces/{wsId}                   espacio de trabajo del equipo
  members/{uid}                     { role, email, displayName, magnificConnected }
  invites/{inviteId}                { email, role, token, expiresAt, status }
productions/{prodId}                { wsId, name, levels[], statuses[], settings, createdAt }
  members/{uid}                     { role: owner|admin|supervisor|artist|viewer }
  nodes/{nodeId}                    árbol (carpetas y planos)
  media/{mediaId}                   archivos generados / subidos
  takes/{takeId}                    cortes colocados en nodos
  comments/{commentId}
  assets/{assetId}                  reparto, props, localizaciones, estilo
  jobs/{jobId}                      cola de generación / render
  activity/{eventId}                registro de actividad (auditoría, feed)
```

### 3.1 Niveles (`productions.levels[]`)

```ts
interface LevelDef {
  id: string;            // estable; los nodos referencian el índice vía levelId
  name: string;          // "Secuencia"
  prefix: string;        // "SQ"
  step: number;          // 10 → 010, 020… (deja huecos para insertar 015)
  pad: number;           // dígitos
  canGenerate: boolean;  // punto de producción
  maxVideoSec: number;   // p. ej. 30 en escena, 15 en plano
}
```

- El último nivel es siempre la unidad.
- Añadir o quitar un nivel superior reestructura el árbol en una transacción
  (Function), sin perder nodos.

### 3.1.b Estados configurables (`productions.statuses[]`)

```ts
interface StatusDef {
  id: string;            // estable; los nodos guardan el id, no el nombre
  name: string;          // "En revisión", "Retake", "Aprobado cliente"…
  color: string;
  category: "todo" | "active" | "review" | "done";  // para progreso y filtros
  order: number;         // posición en el tablero/leyenda
  levelIds?: string[];   // opcional: solo aplica a ciertos niveles
}
```

- Valores por defecto: Pendiente → En curso → En revisión → Aprobado. El equipo
  puede **añadir, renombrar, recolorear, reordenar y archivar** estados en
  cualquier momento, y el tablero se actualiza en vivo.
- **El orden no es un candado:** se puede pasar de cualquier estado a cualquier
  otro, incluido volver atrás (de Aprobado a En curso por un retake). En fases
  posteriores se podrán añadir reglas opcionales, por ejemplo "solo un
  supervisor marca un estado `done`".
- Cada cambio de estado queda registrado (`activity`: quién, cuándo, de qué
  estado a cuál), así que el historial de idas y vueltas de un plano es visible.
- Borrar un estado en uso no está permitido: se archiva y los nodos conservan su
  valor hasta que se reasignen.

### 3.2 Nodos

```ts
interface Node {
  id: string;
  parentId: string | null;
  levelId: string;
  depth: number;
  number: number;          // 10, 15, 20…
  code: string;            // "SH0010" (derivado; denormalizado para búsquedas)
  folderName: string;      // "SH0010_Plano-general" (derivado, ver §5.3)
  path: string;            // "SQ010_Apertura/SC010_Persecucion-en-el-puerto/SH0010_Plano-general"
  ancestorIds: string[];   // subárbol con array-contains
  sortKey: string;         // "000010/000010/000010" orden global estable
  title: string;
  notes: string;
  statusId: string;        // id de productions.statuses[]
  assigneeIds: string[];
  assetIds: string[];      // desglose (reparto/props/localización)
  selectedTakeId?: string;
  stats: { media: number; takes: number; comments: number; durationSec: number };
  updatedAt; updatedBy;
}
```

- `code`, `path`, `sortKey` y `ancestorIds` se recalculan en el servidor al
  renumerar, mover o renombrar niveles.
- **El orden en pantalla es independiente del código** (decisión del 15 oct
  2026, ver `INTERFAZ.md` §2.1). Reordenar arrastrando cambia solo un campo de
  orden visual; el código y la carpeta no cambian. Mover a otro padre sí mueve
  la carpeta, y si el código ya existe allí se asigna el siguiente libre.
- Las renumeraciones van en **lote transaccional**: el cliente nunca reescribe
  cientos de documentos por su cuenta.

### 3.3 Media, tomas y comentarios

```ts
interface Media {
  id; nodeId;                       // carpeta de origen
  kind: "image" | "video" | "audio";
  version: number;                  // por nodo y tipo, asignado en transacción
  origin: "generated" | "uploaded" | "render";
  status: "queued" | "rendering" | "ready" | "failed";
  archived: boolean;                // descartado: oculto, no se replica, se conserva (ver issue #1)
  storagePath: string;              // productions/{prodId}/media/{mediaId}/original.mp4
  proxyPath?: string; thumbPath?: string;
  durationSec?: number; width?: number; height?: number; fps?: number; checksum?: string;
  generation?: {
    provider; model; prompt; params; references: string[]; sourceMediaId?;
    providerJobId?; credits?;
    launchedBy: string;             // uid cuya cuenta de Magnific pagó los créditos
  };
  createdBy; createdAt;
}

interface Take {
  id; nodeId; mediaId;
  inSec: number; outSec: number;    // no destructivo
  render?: { status; storagePath };  // corte físico, cuando se exporta/aprueba
  createdBy; createdAt;
}

interface Comment {
  id; nodeId; mediaId?; takeId?;
  atSec?: number;                   // timecode
  annotation?: object;              // dibujo sobre frame (fase posterior)
  text; authorId; resolved: boolean; createdAt;
}
```

Las **reglas de dominio** (códigos, numeración con huecos, segmentos de corte,
duración de nodo, permisos por rol) viven en un paquete TypeScript **puro y
testeado** (`packages/domain`). Lo usan el cliente, las Functions y el motor de
espejo.

## 4. Colaboración en tiempo real

> Etapa C (§2.1). En las etapas A y B la colaboración es **casi en tiempo
> real**: cada miembro escribe en su propio registro de eventos y la app combina
> los de todos (§5.0). Las escrituras por campo y "gana el último que escribe"
> funcionan igual; la presencia no existe todavía.

- **Firestore es la fuente de verdad.** Cada cliente escucha los nodos de la
  producción (miles de docs pequeños, asumible) y carga **bajo demanda** media,
  tomas y comentarios de lo visible (la escena abierta, el plano seleccionado).
- **Escrituras a nivel de campo** (`update` parcial). Dos personas en planos
  distintos nunca chocan. En el mismo plano gana el último que escribe por campo, y la
  presencia lo hace visible.
- **Operaciones estructurales** (crear con número, mover, renumerar, asignar
  versión) van por transacciones o Functions, para evitar duplicados de código o versión.
- **Presencia** en Realtime Database con `onDisconnect`: quién está en qué escena o
  plano y quién está editando un campo (bloqueo suave, como en Studio).
- **Caché offline** del SDK (IndexedDB en el renderer): la app se abre y
  navega sin conexión. Las escrituras se encolan.
- **Actividad**: cada cambio relevante genera un evento (`activity`) para el feed
  y las notificaciones.

## 5. Archivos: la carpeta de la producción

**La carpeta de la producción es el almacenamiento.** Vive en una carpeta
compartida de Dropbox (o en cualquier carpeta local, para trabajar solo). Los
archivos se ordenan por código (§5.2) y el estado de la producción se guarda en
un registro de eventos dentro de la misma carpeta (§5.0).

### 5.0 Registro de eventos (etapas A y B)

Un único JSON con toda la producción no sirve: si dos personas lo guardan a la
vez, Dropbox crea una "copia en conflicto" y se pierden cambios. Por eso **cada
dispositivo escribe solo en sus propios archivos**, y nadie escribe nunca en
los de otro.

```
<Produccion>/.sweetflow/
  production.json                   id, nombre, versión del esquema (se escribe al crearla)
  log/<deviceId>/<AAAA-MM>.jsonl    eventos de ese dispositivo; solo se añaden líneas
```

- **Un evento por línea:** `{ id, at, deviceId, userId, type, payload }`. Cada
  intención de `DataSource` (crear nodo, cambiar estado, comentar…) es un evento.
- **`at` es un reloj lógico híbrido** (hora + contador), para ordenar los
  eventos de todos los dispositivos de forma estable aunque sus relojes no
  coincidan del todo.
- **Estado = combinar todos los registros** en orden `(at, deviceId)`. Por
  campo, gana el último que escribe, igual que en §4. Las reglas de la
  combinación son puras y viven en `packages/domain`, con tests.
- **Choques estructurales:** si dos personas crean a la vez el mismo número
  (`SH0020`), la combinación lo resuelve de forma determinista (el segundo pasa
  al siguiente hueco libre) y los dos ven lo mismo.
- **Detección de cambios:** en la etapa A, la app vigila la carpeta (`fs.watch`)
  y vuelve a leer lo que Dropbox haya traído; en la B, *long-polling* de la API.
- **Caché:** la instantánea combinada se guarda en los datos de la app
  (fuera de Dropbox) para abrir rápido; se reconstruye desde el registro si falta.
- **Compactación (más adelante):** cuando los registros crezcan, una instantánea
  firmada por fecha sustituye a los meses antiguos.

### 5.1 Descartes

**Se archivan, no se borran (v1).** Un media descartado se marca `archived`:
desaparece del tablero (se puede ver con un filtro y recuperar) y el archivo se
conserva en la carpeta. Nunca se archiva un media que tenga tomas colocadas o
sea la toma elegida de un nodo. La política para que lo archivado no siga
ocupando (moverlo a otra carpeta, borrado definitivo) está pendiente en el
[issue #1](https://github.com/aizetachan/sweet-flow/issues/1).

### 5.2 Estructura de carpetas

```
<Carpeta de Dropbox>/<Produccion>/
  .sweetflow/                          production.json, log/ (§5.0)
  _assets/cast/<Nombre>/…  _assets/props/…  _assets/locations/…
  SQ010_Apertura/
    SC010_Persecucion-en-el-puerto/
      _media/SC010_vid_v001.mp4        generado en la escena (clip largo)
      _takes/SC010_tk01.mp4            tramo que se mantiene en la escena
      SH0010_Plano-general/
        _media/SH0010_img_v001.png
        _takes/SH0010_tk01.mp4
```

Las carpetas llevan **código + título** (ver §5.3). Los archivos llevan solo el
código, la versión y el tipo: ya son reconocibles por la carpeta en la que están, y
así renombrar un título no obliga a renombrar cientos de archivos.

- **El árbol de carpetas es una proyección del registro.** Cada media guarda en
  su evento su id y su nombre de archivo; la ruta sale del estado actual del
  nodo con `folderName()`.
- **Escritura atómica** (temporal + renombrado), siempre desde el **utility
  process** de Electron (Node), sin depender de la ventana.
- **Renombrar, renumerar o mover** un nodo lo hace el dispositivo que hace el
  cambio: mueve la carpeta y Dropbox lo propaga al resto.
- **Reparación al abrir:** si la carpeta no coincide con el registro (dos
  movimientos a la vez, una copia en conflicto de Dropbox), la app recoloca las
  carpetas según el registro y avisa de lo que no sabe resolver. El registro
  manda.
- **Sincronización selectiva:** la del propio cliente de Dropbox. Una serie
  puede ocupar cientos de GB; cada miembro elige qué secuencias se descarga.
- La carpeta es **de solo lectura por convención** fuera de `_media` y
  `_takes`: los archivos se añaden desde la app. Una fase posterior podrá
  **importar** lo que se deje en una carpeta (añadirlo como media).
### 5.3 Nombres unificados: app ↔ disco

Lo que se ve en la app y lo que hay en el disco salen de **una única función**
del paquete `domain` (`folderName(code, title)`). Por construcción, nunca pueden
divergir. En la app el nodo se ve como **SC010 · Persecución en el puerto**, y
el panel muestra su carpeta: `SC010_Persecucion-en-el-puerto`.

Reglas para que el mismo nombre funcione en macOS y Windows:

| Problema | Regla |
| --- | --- |
| Caracteres prohibidos en Windows `< > : " / \ \| ? *` | Se eliminan |
| Espacios | Se convierten en `-` (mejor para scripts, ffmpeg y editores) |
| Tildes y ñ (`ó`, `ñ`) | Se transliteran (`o`, `n`). macOS y Windows codifican los acentos de forma distinta (NFD/NFC) y eso rompe la sincronización y algunas herramientas |
| Nombres reservados de Windows (`CON`, `NUL`, `COM1`…) y punto o espacio final | No pueden darse, porque el nombre siempre empieza por el código |
| Mayúsculas y minúsculas (Windows y macOS no las distinguen) | El código ya hace único cada nombre, así que no hay colisiones |
| Límite de ruta de Windows (260 caracteres, que también afecta al Explorador y a Premiere) | Título recortado a 32 caracteres en la carpeta. Con 4 niveles, la ruta dentro de la producción queda por debajo de unos 170 caracteres. La app avisa si la carpeta raíz elegida es demasiado larga |

- El título completo, con tildes, se conserva en la app y en el registro. Solo
  la carpeta usa la versión adaptada.
- **Renombrar un título o renumerar un nodo renombra su carpeta en el
  disco** con un `rename`: Dropbox lo sincroniza como un movimiento y no vuelve
  a subir ni a descargar los archivos.

### 5.4 La carpeta del equipo en el código (`FolderFs`)

Todo lo que se guarda en la carpeta del equipo pasa por una interfaz mínima,
`FolderFs` (`packages/app/src/data/folder/fs.ts`): listar, leer, escribir,
crear carpeta, mover y borrar. Encima, escrito una sola vez:

- **`FolderLogStore`:** el registro de una producción (§5.0) dentro de su
  carpeta. La ruta se calcula en cada operación, porque la carpeta cambia al
  renombrar o mover la producción.
- **El dashboard:** también es un registro por dispositivo, en
  `<carpeta del equipo>/.sweetflow/library/<deviceId>/<AAAA-MM>.jsonl`. Por
  entrada y campo gana el último que escribe. Cada carpeta del dashboard y cada
  producción es una carpeta real, con el nombre de `entryFolderNames()`
  (`safeTitle`, y `-2`, `-3`… si dos hermanas coinciden). Quien renombra o mueve
  algo mueve su carpeta; la sincronización lo lleva al resto.
- **Detectar cambios:** se revisan tamaño y fecha de los archivos de registro
  cada 2,5 s (ni el navegador ni las API avisan de cambios en archivos).
- **Lo personal** (perfil, fijados, recientes) se queda en el navegador.

Implementaciones:

| `FolderFs` | Estado |
| --- | --- |
| Carpeta de este ordenador (API *File System Access* de Chrome y Edge; el permiso se recuerda y a veces el navegador lo vuelve a pedir con un clic) | Hecha |
| Dropbox (API HTTP, OAuth con PKCE, sin secreto) | Siguiente |
| Google Drive (API v3) | Después |
| Memoria (tests) | Hecha |

## 6. Generación y render

**Etapas A y B: desde la app de escritorio.** Sin servidor, la cola vive en el
utility process de Electron:

- Cada usuario conecta su cuenta de Magnific (OAuth 2.0 + PKCE). El token se
  guarda cifrado en su máquina (`safeStorage` de Electron), nunca en la carpeta
  compartida.
- La app lanza los jobs, espera el resultado, lo descarga a la carpeta del
  nodo (`_media/`) y registra el evento. Dropbox lo reparte al equipo.
- Si se cierra la app, los jobs pendientes se retoman al abrirla (el id del
  job del proveedor queda en el registro).

**Etapa C: en el servidor**, como describe el diagrama. El resultado se guarda
en Dropbox, no en Cloud Storage.

```
Cliente ──crea──▶ jobs/{id} (queued)
                      │  Function onCreate
                      ▼
                Cloud Tasks (cola con límites por proveedor/cuenta)
                      ▼
           Cloud Run worker ──▶ Adaptador de proveedor (Magnific MCP/API)
                      │  polling / webhook
                      ▼
           Descarga el resultado → Dropbox → media/{id} = ready
                      ▼
           Clientes (tiempo real) + espejo local (descarga)
```

- **Proveedores intercambiables** detrás de una interfaz `GenerationProvider`
  (`generateImage`, `generateVideo`, `extendVideo`, `capabilities`).
  Magnific es el primero. Se reutiliza la experiencia del
  `GenerationBlock` de Studio, pero ejecutado en el servidor.
- **30 s de vídeo:** si el modelo no llega a esa duración, el worker encadena
  `extend` o `concatenate` y entrega un único media.
- **Lotes:** "generar keyframes de todos los planos vacíos de SC010" crea N jobs.
  La cola controla la concurrencia, los reintentos y el coste.
- **Créditos:** antes de lanzar se estima el coste; al terminar se registra el consumo
  real por job, usuario y producción.
- **Cuenta de Magnific por usuario, como en Studio.** Cada miembro conecta
  *su* cuenta con OAuth 2.0 + PKCE desde Ajustes, y **cada generación consume los
  créditos de quien la lanza**.
  - Los tokens (access y refresh) se guardan cifrados y se refrescan solos: en
    la máquina del usuario en las etapas A y B, y en el servidor en la etapa C.
    Nunca en la carpeta compartida.
  - El job lleva el `uid` de quien lo lanzó, y el worker usa el token de ese usuario.
- **Mismo espacio, cuentas distintas.** Lo que cada uno genera se copia a
  la carpeta de la producción, así que todo el equipo ve lo mismo aunque se
  haya pagado con cuentas diferentes.
  - Unirse a un espacio de trabajo es independiente de Magnific: invitación por
    email o enlace, con un rol.
  - Un miembro sin Magnific conectado puede ver, cortar, comentar y aprobar,
    pero no generar.
- **Consumo:** se registra por job (usuario, producción y nodo), de modo que cada
  uno ve sus créditos y la producción ve el total.
- **Referencias de biblioteca entre cuentas.** Un personaje registrado en la
  biblioteca de Magnific de un usuario no es accesible desde la cuenta de otro.
  Por eso la imagen de referencia se guarda en la carpeta (`_assets/`), y la entrada de
  biblioteca se registra bajo demanda en la cuenta de quien genera, cacheando el
  identificador por usuario. Hay que validarlo con Magnific en la fase 2.
- **Render de cortes:** cuando una toma se aprueba o se exporta, se crea un job de render
  (ffmpeg local en el utility process; en la etapa C, Cloud Run) que genera el archivo físico. En la app, la reproducción
  usa el media original con entrada y salida, sin esperar a ese render.

## 7. App de escritorio

### 7.1 Por qué Electron (y no Tauri)

| Criterio | Electron | Tauri |
| --- | --- | --- |
| Motor en macOS y Windows | **Chromium idéntico en ambos** | WKWebView (Safari) en macOS, WebView2 (Chromium) en Windows |
| Vídeo (códecs, `requestVideoFrameCallback`, scrubbing preciso) | Igual en los dos sistemas | Comportamiento distinto según el sistema; hay que probar el doble |
| Lenguaje del motor de espejo y ffmpeg | TypeScript/Node, el mismo que el resto | Rust (otro lenguaje que mantener) |
| Firebase SDK, ecosistema | Maduro | Funciona, con menos recorrido |
| Firma, notarización y auto-update | electron-builder + electron-updater, muy probados | Disponibles, menos maduros |
| Tamaño y memoria | ~150 MB y más RAM | Mucho más ligero |

Para una herramienta profesional centrada en vídeo y que debe comportarse igual en
Mac y en Windows, **pesa más que el motor sea idéntico que el tamaño de la app**.

### 7.2 Estructura y seguridad

- **Main:** ventanas, menús, auto-update y deep links (`sweetflow://prod/…/node/…`).
- **Utility process:** motor de espejo y ffmpeg local (incluido por plataforma).
- **Renderer:** la app React, con `contextIsolation` activado, sin `nodeIntegration`
  y con IPC tipado a través de `preload`/`contextBridge`.
- **Distribución durante la validación: sin firmar.** Los builds se instalan
  aceptando apps no verificadas. El pipeline queda preparado para añadir la firma
  después, sin cambiar la arquitectura.
  - **macOS** (`.dmg`, universal arm64 + x64): clic derecho → Abrir, o
    *Ajustes → Privacidad y seguridad → Abrir igualmente*. Si macOS dice que la
    app "está dañada": `xattr -dr com.apple.quarantine "/Applications/Sweet Flow.app"`.
  - **Windows** (instalador NSIS): en SmartScreen, *Más información →
    Ejecutar de todos modos*.
  - **Actualizaciones:** en Windows, el auto-update funciona sin firma. En macOS
    no: el sistema exige firma para actualizarse solo, así que mientras no firmemos,
    la app avisa de que hay versión nueva y se descarga a mano.
- **Más adelante:** firma con Developer ID + notarización en macOS y Azure
  Trusted Signing o certificado EV en Windows. Con eso, auto-update completo en
  los dos sistemas.

## 8. Seguridad y roles

Los roles se asignan por **espacio de trabajo** y se pueden ajustar por
producción.

| Rol | Puede |
| --- | --- |
| owner / admin | Todo, incluidos miembros, niveles y facturación |
| supervisor | Aprobar y rechazar, asignar, cambiar estados |
| artist | Generar, cortar y colocar tomas, comentar, mover sus tareas a revisión |
| viewer (cliente) | Ver y comentar |

- **Etapas A y B:** los roles se guardan en el registro y la UI los respeta,
  pero no se pueden imponer: cualquiera con permiso de edición en la carpeta de
  Dropbox puede cambiarlo todo. Para un equipo de confianza es suficiente; quien
  solo deba ver, recibe la carpeta compartida como solo lectura.
- **Etapa C:** las Firestore Rules aplican estos roles por producción.
- Las operaciones sensibles (renumerar, borrar subárboles, cambiar niveles) solo
  se hacen mediante Functions.
- Las reglas se testean con el Emulator Suite.

## 9. Stack y estructura del repo

Monorepo con **pnpm workspaces + Turborepo**, todo en TypeScript.

```
apps/
  desktop/          Electron (main, preload, utility); empaqueta packages/app
  web/              (fase posterior) build web del renderer para revisión
packages/
  app/              React: tablero, árbol, panel, cortador, revisión
  ui/               design system (tokens, componentes)
  domain/           modelo y reglas puras (códigos, numeración, cortes, permisos) + tests
  data/             implementaciones de DataSource (local, Dropbox, Firebase)
  providers/        adaptadores de generación (magnific, …)
  mirror/           motor de espejo local (Node)
firebase/
  functions/        triggers, callable API, orquestación de jobs
  firestore.rules · storage.rules · database.rules.json · firestore.indexes.json
services/
  worker/           Cloud Run: ejecución de generación
  render/           Cloud Run: ffmpeg (cortes, proxies, montajes)
docs/
```

- **Frontend:** React 18, Vite y TypeScript estricto. Estado del servidor mediante suscripciones
  Firestore con una capa de caché; estado de la UI local.
- **Calidad:**
  - Vitest para `domain`, `data` y `mirror`.
  - Emulator Suite para reglas y Functions.
  - Playwright (con soporte Electron) para e2e.
  - CI en GitHub Actions con builds de macOS y Windows.
- **Entornos:** proyectos Firebase `dev` y `prod` separados.

## 10. Fases

| Fase | Contenido | Resultado |
| --- | --- | --- |
| 0. Cimientos | Monorepo, dominio, UI con datos de demo, esqueleto de Firebase, CI, shell de Electron sin firmar para Mac/Win | La app se instala y se ve la UI |
| 1. Producción en carpeta (etapa A) | `LocalSource`: elegir carpeta, crear y abrir producciones, registro de eventos y combinación, niveles y estados, árbol y tablero, carpetas en disco con `folderName()`, reparación al abrir | Varias personas trabajan sobre la misma carpeta de Dropbox |
| 2. Generación | OAuth de Magnific por usuario, cola en el escritorio, versiones, lotes, créditos por usuario | Cada uno genera con su cuenta en escenas y planos |
| 3. Corte y reparto | Cortador, tomas, render con ffmpeg local | Un clip de 30 s de escena se reparte a sus planos |
| 4. Revisión | Comentarios con timecode, asignaciones, avisos de cambios | Flujo de validación del equipo |
| 5. API de Dropbox (etapa B) | `DropboxSource`, OAuth de Dropbox, *long-polling* | Funciona sin el cliente de Dropbox; base para la web de revisión |
| 6. Tiempo real (etapa C) | Firebase Auth, Firestore, presencia, roles en el servidor, worker de generación | El equipo ve los cambios al instante |
| 7. Desglose | Reparto, props y localizaciones como referencias de generación | Consistencia visual a escala |
| 8. Montaje | Timeline de escena y secuencia desde las tomas elegidas, export | Montajes de referencia |
| Posterior | Web de revisión · firma de apps · política de almacenamiento (issue #1) | — |

**Primera versión utilizable (MVP): fases 0 a 3, más comentarios básicos**, todo
sobre una carpeta compartida de Dropbox.

## 11. Decisiones

| # | Tema | Decisión | Dónde |
| --- | --- | --- | --- |
| 1 | Cuenta de Magnific | Por usuario (OAuth, como en Studio). Cada uno gasta sus créditos; el equipo comparte el espacio de trabajo y ve lo mismo | §6 |
| 2 | Flujo de estados | Configurable por producción, en vivo. Se puede pasar de cualquier estado a cualquier otro (también volver atrás) y queda el historial | §3.1.b |
| 3 | Web de revisión | Anotada para después. Prioridad: escritorio y trabajo simultáneo del equipo | §2, §10 |
| 4 | Descartes | Se archivan (ocultos, no se borran). Política de espacio y borrado pendiente | §5.1, [issue #1](https://github.com/aizetachan/sweet-flow/issues/1) |
| 5 | Firma de apps | Sin firma durante la validación (instalación como app no verificada). Se integra cuando la app esté validada | §7.2 |
| 6 | Nombres de carpeta | Código + título adaptado (`SC010_Persecucion-en-el-puerto`), generado por la misma función que usa la app y compatible con macOS y Windows | §5.3 |
| 7 | Almacenamiento | Primero local, sobre una carpeta compartida de Dropbox, con registro de eventos por dispositivo. Después, API de Dropbox. Firestore solo para el tiempo real, más adelante. Los archivos se quedan en Dropbox; no se usa Cloud Storage (15 oct 2026) | §2.1, §5 |
| 8 | Orden y códigos | El orden en pantalla es visual y no cambia el código ni la carpeta. Arrastrar a otro padre mueve la carpeta | §3.2, `INTERFAZ.md` §2.1 |
| 9 | Dashboard | Refleja la carpeta de Dropbox en los dos sentidos: lo que se organiza en la app se aplica en Dropbox y lo que cambia en Dropbox se ve en la app | `INTERFAZ.md` §1 |
| 10 | Proveedores de almacenamiento | Dropbox o Google Drive, a elegir por equipo, con el mismo formato de carpeta. Primero mediante su cliente de escritorio; después por API (§2.2) | §2.2 |
| 11 | Conexión con Dropbox y Drive | El objetivo es la **etapa B**: conectar Dropbox (y después Drive) desde Ajustes, por API, sin cliente de escritorio, con copia local opcional. Mientras tanto, «Carpeta de este ordenador» con el mismo formato y el mismo código (`FolderFs`, §5.4) (16 oct 2026) | §2.1, §5.4 |

### Pendiente de validar

- Que Magnific permita usar una referencia de biblioteca creada en una cuenta
  desde otra, o confirmar el registro bajo demanda por usuario (§6).
