# Sweet Flow — Arquitectura

> Estado: **borrador para validar**. Nada de esto está implementado todavía.
> Decisiones tomadas: Firebase como plataforma de partida · app de escritorio
> para **macOS y Windows** · generación con Magnific como primer proveedor.

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
   elegida y comentarios. Todo el equipo ve los avances en tiempo real.
6. **Producción en masa.** La generación corre en el servidor, en cola y en lotes.
   Lo producido aparece en la app y se guarda **ordenado en la carpeta
   del escritorio** de cada miembro.

Fuera de alcance en v1: escritura de guion, edición final de color/sonido, y
distribución.

## 2. Vista general

```
┌──────────────────────────── App de escritorio (Electron, macOS + Windows) ───┐
│  Renderer (React + TS)                Main / utility process (Node)          │
│  - Tablero, árbol, panel de plano     - Motor de espejo local (sync daemon)  │
│  - Cortador, revisión, comentarios    - ffmpeg local (previews/export)       │
│  - Firebase JS SDK (tiempo real,      - Auto-update, IPC tipado              │
│    caché offline)                                                            │
└───────────────┬─────────────────────────────────────────┬────────────────────┘
                │ Firestore / RTDB / Storage              │ descarga ordenada
                ▼                                         ▼
┌──────────────────────────── Firebase / GCP ──────────────┐   <Carpeta elegida>/
│ Auth · Firestore (fuente de verdad) · RTDB (presencia)   │     <Producción>/SQ010/SC010/…
│ Cloud Storage (archivos, por id)                         │
│ Cloud Functions (triggers, API) · Cloud Tasks (cola)     │
│ Cloud Run: worker de generación · render ffmpeg          │
│ Secret Manager (credenciales de proveedores)             │
└───────────────┬──────────────────────────────────────────┘
                ▼
        Proveedores de generación (Magnific MCP/API; extensible)
```

Una **web de revisión** (mismo renderer, sin espejo local) permite que
supervisores o clientes vean y comenten sin instalar nada.

## 3. Modelo de datos (Firestore)

Lección de Magnific Studio: un único JSON por proyecto no escala, porque Firestore
limita cada documento a 1 MB, hay que hacer diff global y gana el último que escribe.
Aquí cada entidad es **un documento**, con listeners finos y reglas por
documento.

```
organizations/{orgId}
  members/{uid}                     { role }
productions/{prodId}                { orgId, name, levels[], statusFlow, settings, createdAt }
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

### 3.2 Nodos

```ts
interface Node {
  id: string;
  parentId: string | null;
  levelId: string;
  depth: number;
  number: number;          // 10, 15, 20…
  code: string;            // "SH0010" (derivado; denormalizado para búsquedas)
  path: string;            // "SQ010/SC010/SH0010" (derivado)
  ancestorIds: string[];   // subárbol con array-contains
  sortKey: string;         // "000010/000010/000010" orden global estable
  title: string;
  notes: string;
  status: string;          // del statusFlow de la producción
  assigneeIds: string[];
  assetIds: string[];      // desglose (reparto/props/localización)
  selectedTakeId?: string;
  stats: { media: number; takes: number; comments: number; durationSec: number };
  updatedAt; updatedBy;
}
```

- `code`, `path`, `sortKey` y `ancestorIds` se recalculan en el servidor al
  renumerar, mover o renombrar niveles.
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
  storagePath: string;              // productions/{prodId}/media/{mediaId}/original.mp4
  proxyPath?: string; thumbPath?: string;
  durationSec?: number; width?: number; height?: number; fps?: number; checksum?: string;
  generation?: { provider; model; prompt; params; references: string[]; sourceMediaId?; providerJobId?; credits? };
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

## 5. Archivos: nube y espejo local

**En la nube, los archivos se guardan por id; en el disco, por código.**

Renumerar o mover un plano no mueve objetos en Storage: solo cambia dónde los
coloca el espejo local.

### 5.1 Cloud Storage

```
productions/{prodId}/media/{mediaId}/original.<ext>
productions/{prodId}/media/{mediaId}/proxy.mp4      (baja resolución para el tablero)
productions/{prodId}/media/{mediaId}/thumb.jpg
productions/{prodId}/takes/{takeId}/render.<ext>
```

Las reglas de Storage comprueban la pertenencia a la producción. Proxies y
miniaturas se generan al subir el archivo (Function + ffmpeg).

### 5.2 Espejo en el escritorio

```
<Carpeta>/<Producción>/
  .sweetflow/manifest.json             id ↔ ruta local, checksums, versión del esquema
  _assets/cast/<Nombre>/…  _assets/props/…  _assets/locations/…
  SQ010/
    SC010/
      _media/SC010_vid_v001.mp4        generado en la escena (clip largo)
      _takes/SC010_tk01.mp4            tramo que se mantiene en la escena
      SH0010/
        _media/SH0010_img_v001.png
        _takes/SH0010_tk01_SC010v001_0000-0042.mp4
        node.json                      título, estado, tomas (EDL), comentarios
```

- Lo ejecuta el **utility process** de Electron (Node), sin depender de la
  ventana. Escucha Firestore, descarga desde Storage y escribe con escritura
  atómica (temporal + renombrado).
- **Renombrar, renumerar o mover** un nodo se traduce en mover carpetas en el disco,
  usando el manifest.
- **Sincronización selectiva:** cada miembro elige qué secuencias o escenas replica.
  Una serie puede ocupar cientos de GB.
- La carpeta es **una réplica**. En v1 es de solo lectura por convención; si
  alguien modifica un archivo, se detecta y se avisa. Una fase posterior podrá
  **importar** lo que se deje en una carpeta (subirlo como media).
- Compatibilidad entre sistemas: nombres saneados, sin distinción de
  mayúsculas, rutas cortas por el límite de 260 caracteres de Windows (por eso
  se usan códigos y no títulos en las carpetas).

## 6. Generación y render

```
Cliente ──crea──▶ jobs/{id} (queued)
                      │  Function onCreate
                      ▼
                Cloud Tasks (cola con límites por proveedor/cuenta)
                      ▼
           Cloud Run worker ──▶ Adaptador de proveedor (Magnific MCP/API)
                      │  polling / webhook
                      ▼
           Descarga el resultado → Storage → media/{id} = ready
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
- **Credenciales:** cuenta del proveedor a nivel de organización, con tokens
  cifrados en Secret Manager. Opcionalmente, cuenta por usuario mediante OAuth, como en Studio.
- **Render de cortes:** cuando una toma se aprueba o se exporta, se crea un job de render
  (Cloud Run con ffmpeg) que genera el archivo físico. En la app, la reproducción
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
- **Distribución:**
  - **macOS:** binario universal (arm64 + x64), firmado con Developer ID y notarizado.
  - **Windows:** instalador NSIS firmado (Azure Trusted Signing o certificado EV).
  - Actualizaciones automáticas desde GitHub Releases o desde un bucket.

## 8. Seguridad y roles

| Rol | Puede |
| --- | --- |
| owner / admin | Todo, incluidos miembros, niveles y facturación |
| supervisor | Aprobar y rechazar, asignar, cambiar estados |
| artist | Generar, cortar y colocar tomas, comentar, mover sus tareas a revisión |
| viewer (cliente) | Ver y comentar |

- Firestore Rules y Storage Rules aplican estos roles por producción.
- Las operaciones sensibles (renumerar, borrar subárboles, cambiar niveles) solo
  se hacen mediante Functions.
- Las reglas se testean con el Emulator Suite.

## 9. Stack y estructura del repo

Monorepo con **pnpm workspaces + Turborepo**, todo en TypeScript.

```
apps/
  desktop/          Electron (main, preload, utility); empaqueta packages/app
  web/              build web del renderer (revisión, sin espejo)
packages/
  app/              React: tablero, árbol, panel, cortador, revisión
  ui/               design system (tokens, componentes)
  domain/           modelo y reglas puras (códigos, numeración, cortes, permisos) + tests
  data/             acceso a Firebase: repositorios, conversores, hooks de suscripción
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
| 0. Cimientos | Monorepo, Firebase dev/prod, Auth, reglas + emuladores, CI, shell de Electron firmado para Mac/Win | La app se instala y permite iniciar sesión |
| 1. Estructura | Producciones, niveles, árbol y tablero en tiempo real, presencia | El equipo construye la estructura a la vez |
| 2. Generación | Cola de jobs, adaptador de Magnific, versiones, lotes, créditos | Se genera en escenas y planos |
| 3. Corte y reparto | Cortador, tomas, render ffmpeg | Un clip de 30 s de escena se reparte a sus planos |
| 4. Espejo local | Motor de espejo, manifest, sincronización selectiva | La carpeta del escritorio refleja la producción |
| 5. Revisión | Estados, comentarios con timecode, asignaciones, notificaciones | Flujo de validación del equipo |
| 6. Desglose | Reparto, props y localizaciones como referencias de generación | Consistencia visual a escala |
| 7. Montaje | Timeline de escena y secuencia desde las tomas elegidas, export | Montajes de referencia |

**Primera versión utilizable (MVP): fases 0 a 4, más comentarios básicos.**

## 11. Decisiones abiertas

1. **Cuenta de Magnific:** de organización (recomendado para producción en
   masa), por usuario, o ambas.
2. **Flujo de estados:** fijo en v1 (Pendiente → En curso → En revisión →
   Aprobado) o configurable por producción.
3. **Web de revisión en el MVP**, o solo escritorio al principio.
4. **Retención y costes de Storage:** política para versiones descartadas
   (archivar o borrar a los N días).
5. **Certificados de firma:** Apple Developer ID y firma de Windows (quién los
   gestiona).
6. **Nombre de carpetas:** solo códigos (recomendado, por el límite de rutas de Windows) o
   código + título (`SC010_Persecucion`).
