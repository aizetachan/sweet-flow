# Exportar a editores (Premiere, Resolve, Final Cut, Avid)

> Estado: **análisis de viabilidad** (octubre de 2026). No hay nada implementado.
> Relacionado: `ARCHITECTURE.md` §1 (Media ≠ Toma), §5 (carpeta en disco) y la
> fase 8 (Montaje) de `ROADMAP.md`.

## 1. Qué queremos sacar de Sweet Flow

Para cada escena o secuencia, una línea de tiempo con:

- Los planos en su orden, cada uno con la **versión aprobada** (o la última, si
  no hay aprobada).
- La toma de cada plano: archivo de origen + entrada/salida en segundos (un
  plano puede ser un tramo de un vídeo de escena más largo).
- Duraciones, frecuencia de imagen y, si existe, el audio del archivo.
- Marcadores con los comentarios con código de tiempo, y metadatos del plano
  (código, título, estado, versión).
- Rutas a los archivos que estén en la carpeta compartida
  (`…/SQ010_x/SC010_y/SH0010_z/_media/SH0010_vid_v003.mp4`).

Y, en una segunda fase, el camino de vuelta: comentarios del montador y
sustitución automática cuando un plano tiene una versión aprobada nueva.

## 2. Formatos de intercambio

| Formato | Premiere Pro | DaVinci Resolve | Final Cut Pro | Avid Media Composer |
| --- | --- | --- | --- | --- |
| **OTIO** (`.otio`, JSON) | Importa y exporta de forma oficial desde **26.0** (enero de 2026); antes, solo en beta | Importa y exporta desde **18.5** (2023); 18.6.5 añadió marcadores de clip y clips compuestos | No (solo con conversores de terceros) | No |
| **FCP7 XML** (`xmeml`) | Sí, desde hace años; el formato más fiable para Premiere | Sí ("XML") | No (solo FCPXML) | No |
| **FCPXML** | No | Sí | Sí (formato nativo) | No |
| **EDL CMX3600** | Sí | Sí | No de forma nativa | Sí |
| **AAF** | Sí | Sí | No | Sí (formato nativo) |

Qué lleva cada uno:

- **OTIO.** Pistas, clips con `source_range` (entrada y duración en el
  origen), huecos, marcadores (nombre, color, comentario, duración), `metadata`
  libre por objeto y referencias a medios por URL (`target_url`). En Premiere
  la implementación cubre nombres de clip, orden, entradas y salidas, varias
  pistas, velocidad lineal, código de tiempo inicial, frecuencia, marcadores de
  secuencia y de clip. Adobe avisa de que, al importar OTIO hecho por otras
  aplicaciones, algunos ajustes de secuencia hay que corregirlos a mano.
  `.otioz`/`.otiod` (medios empaquetados) solo los trata Resolve.
- **FCP7 XML.** Clips con in/out, pistas de vídeo y audio, marcadores con
  comentario, rutas como `pathurl` (`file://localhost/…`), frecuencia por
  secuencia y por clip. Es antiguo pero muy estable en Premiere y Resolve.
- **FCPXML.** Modelo distinto (recursos + spine, tiempos racionales tipo
  `1001/24000s`). Lleva marcadores, palabras clave y metadatos. Hace falta solo
  para Final Cut.
- **EDL.** Una pista de vídeo, nombres de cinta de 8 caracteres o comentarios
  `* FROM CLIP NAME`, sin rutas fiables. Útil solo como último recurso o para
  conformado por nombre.
- **AAF.** Binario (contenedor de Microsoft Structured Storage). Imprescindible
  para Avid y para sonido (Pro Tools), pero no es razonable escribirlo a mano
  desde JS.

### Problemas que hay que resolver en cualquier formato

1. **Rutas absolutas que cambian por máquina.** La carpeta de Dropbox no está
   en la misma ruta en cada equipo (`/Users/ana/Dropbox (Equipo)/…` frente a
   `D:\Dropbox\…`). Los formatos guardan rutas absolutas (OTIO acepta una URL;
   las relativas no están garantizadas en Premiere ni en Resolve). Solución:
   - El archivo se **genera en el equipo de quien lo exporta**, con las rutas
     de ese equipo (la app de escritorio conoce su raíz local).
   - Los nombres de archivo ya son **únicos en toda la producción** (llevan el
     código del plano y la versión). Si alguien abre el archivo en otra
     máquina, "Vincular medios" de Premiere o "Relink clips" de Resolve,
     apuntando a la raíz de la producción, los encuentra por nombre.
   - El archivo exportado se guarda dentro de la producción
     (`_exports/AAAAMMDD_SC010_v001.otio`) para que la ruta relativa al medio
     sea siempre la misma, aunque el editor no la use.
2. **Frecuencia variable (VFR).** Muchos vídeos de IA salen a 24, 25, 30 o 16
   fps, y a veces con marcas de tiempo irregulares. Premiere y Resolve calculan
   mal los in/out con VFR y la sincronía con el audio se desplaza. Hay que
   **detectar con ffprobe** (`r_frame_rate` frente a `avg_frame_rate`) y
   ofrecer un **conformado a frecuencia constante** con ffmpeg hacia la
   frecuencia de la producción, guardado como medio derivado
   (`SH0010_vid_v003_cfr24.mov`).
3. **Frecuencias mezcladas.** Un clip de 30 fps en una secuencia de 24 fps
   funciona, pero los in/out en fotogramas deben calcularse con la frecuencia
   del clip, no la de la secuencia. Conviene guardar segundos en el dominio y
   convertir a fotogramas solo al exportar.
4. **Imágenes fijas.** Un plano que solo tiene imagen necesita duración
   explícita. En OTIO y en FCP7 XML se puede dar, pero cada editor lo trata
   distinto (Premiere usa a veces su duración de fija por defecto). Lo más
   robusto es convertir la imagen en un clip de vídeo corto con ffmpeg al
   exportar, o al menos dar duración y `available_range` coherentes.
5. **Duración real del medio.** OTIO y XML piden el rango disponible del
   archivo. Hay que leerlo con ffprobe, no suponerlo; si la toma excede el
   archivo, el editor la rechaza o la recorta.
6. **Código de tiempo de origen.** Los MP4 de IA no traen timecode; se asume
   `00:00:00:00`. Es lo que esperan Premiere y Resolve para relacionar el
   in/out con el archivo.

## 3. Generarlos desde TypeScript

- **No hay biblioteca oficial de OTIO para JS/TS.** OTIO es C++ con
  bindings de Python; los adaptadores (FCP7 XML, FCPXML, CMX3600, AAF) son
  paquetes de Python separados del núcleo desde la 0.17. Llamar a Python desde
  la app añadiría una dependencia pesada.
- **OTIO JSON es fácil de escribir a mano.** Es JSON con objetos tipados
  (`Timeline.1`, `Stack.1`, `Track.1`, `Clip.2`, `Gap.1`, `ExternalReference.1`,
  `RationalTime.1`, `Marker.2`). Una función pura en `packages/domain` que
  convierta un nodo (escena o secuencia) en OTIO ocupa unos cientos de líneas y
  se puede probar con instantáneas. La referencia de cómo hacerlo es el export
  de Remotion, que escribe `.otio` desde Node con `pathToFileURL()` para las
  rutas.
- **FCP7 XML también se escribe a mano** con plantillas; es más verboso, pero
  está bien documentado y Premiere lo lee en cualquier versión.
- **FCPXML** es viable a mano, pero tiene más reglas (recursos, formatos,
  tiempos racionales, versiones del DTD). Se deja para cuando alguien use Final
  Cut.
- **AAF/Avid:** fuera de alcance para escribir a mano. Si hace falta, se
  convierte desde OTIO con `otio-aaf-adapter` (Python) como herramienta
  externa, o el montador exporta AAF desde Resolve/Premiere.

Formato más simple y robusto para escribir directamente: **OTIO** como formato
principal (Premiere 26+ y Resolve 18.5+ lo leen) y **FCP7 XML** como respaldo
para Premiere anterior a 26 y para casos donde OTIO falle.

## 4. Plugins

### 4.1 Premiere Pro: UXP

- **UXP es oficial desde Premiere 25.6** (diciembre de 2025). Se desarrolla con
  UXP Developer Tools; la distribución pública pasa por Adobe Marketplace
  (también se puede instalar un `.ccx` a mano en el equipo).
- **CEP sigue funcionando**, pero Adobe ha dicho que lo mantendrá un año más
  tras UXP. No hay fecha oficial de fin de ExtendScript (en foros se habla de
  septiembre de 2026, sin confirmar). Un plugin nuevo debe ser UXP.
- La API UXP de Premiere (desde 25.6) cubre lo que necesitamos:
  - `project.importFiles(paths, suppressUI, targetBin)` para importar medios.
  - `project.createSequence(name)` / `createSequenceWithPresetPath` (26.3) y
    `createSequenceFromMedia(name, items, bin)`.
  - `SequenceEditor.createInsertProjectItemAction` y
    `createOverwriteItemAction` para colocar clips en una pista y un tiempo.
  - `ClipProjectItem.createSetInOutPointsAction` para el in/out de cada toma.
  - `Markers.createAddMarkerAction(name, type, start, duration, comments)` en
    secuencias y clips; `getMarkers` para leerlos.
  - `ClipProjectItem.changeMediaFilePath(newPath)` para **cambiar la versión**
    sin tocar el montaje, y `attachProxy` para proxies.
  - Las acciones se ejecutan dentro de `project.executeTransaction()` (deshacer
    en un paso). En foros se citan huecos frente a ExtendScript y errores en
    `createInsertProjectItemAction` si no se usa así.
- Acceso a disco: el manifiesto pide permiso `localFileSystem`. El panel puede
  leer directamente la carpeta de la producción (el registro de eventos y los
  medios) sin pasar por la app.
- Alternativa sin plugin: el panel puede limitarse a importar el `.otio` que
  genere la app (`importFiles` con un `.otio` crea la secuencia).

### 4.2 DaVinci Resolve: scripting y Workflow Integration

- **API de scripting** (Python 3 o Lua) con `Resolve > ProjectManager >
  Project > MediaPool / Timeline`:
  - `MediaStorage.AddItemListToMediaPool` / `MediaPool.ImportMedia` para
    importar.
  - `MediaPool.CreateTimelineFromClips(name, [clipInfo])` y
    `AppendToTimeline([{mediaPoolItem, startFrame, endFrame, trackIndex,
    recordFrame}])` para montar con in/out en fotogramas.
  - `MediaPool.ImportTimelineFromFile(path, options)` importa AAF, EDL, XML,
    FCPXML u OTIO; `Timeline.Export(path, resolve.EXPORT_OTIO / EXPORT_FCPXML
    / EXPORT_AAF / EXPORT_EDL)`.
  - `Timeline.AddMarker` y `TimelineItem.AddMarker(frame, color, name, note,
    duration, customData)`; `GetMarkers` para leerlos.
  - `TimelineItem.AddTake` / `SelectTakeByIndex`: las versiones de un plano
    pueden ir como **tomas** en el mismo clip del timeline, y el montador elige.
  - `MediaPoolItem.ReplaceClip(path)` y `SetMetadata` / `SetClipProperty`.
    Resolve 20 añadió "reemplazar medio conservando los límites del subclip".
  - Firmas a confirmar contra el `README.txt` que trae cada instalación
    (`Developer/Scripting`). Hay informes de clips que quedan sin enlazar al
    importar timelines por API; hay que probarlo.
- **Free frente a Studio:**
  - Resolve **gratuito** solo ejecuta scripts **desde dentro** de Resolve
    (menú Workspace > Scripts y consola). Sin scripting externo y sin paneles
    con interfaz propia.
  - **Studio** (pago único, unos 295 USD) permite scripting externo (un
    proceso como la app de Sweet Flow puede controlar Resolve) y los
    **Workflow Integration Plugins**: paneles HTML/JS sobre Electron con el
    módulo `WorkflowIntegration.node`, que da el mismo objeto `resolve`. Solo
    macOS y Windows. Carpetas: macOS
    `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`,
    Windows `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`.
- Consecuencia: para usuarios de Resolve gratuito, la integración es un
  **script de Python** que se copia a la carpeta de scripts y se lanza desde el
  menú. Para Studio, un panel.

### 4.3 Final Cut Pro y Avid (extra)

- **Final Cut:** solo FCPXML (importar con doble clic o arrastrar). Las
  extensiones de flujo de trabajo (Workflow Extensions) son apps de macOS en
  Swift; no compensan ahora.
- **Avid:** AAF o EDL. Su SDK es cerrado y de C++. Si algún cliente lo pide, se
  pasa por Resolve o Premiere (que exportan AAF) o por `otio-aaf-adapter`.

### 4.4 Ida y vuelta

- **Comentarios de vuelta.** El montador pone marcadores en el NLE; el plugin
  (o un `.otio` exportado desde el NLE) los lee y los convierte en comentarios
  con código de tiempo del plano. Hace falta saber a qué plano pertenece cada
  clip: se guarda el id del plano en `metadata` (OTIO), en el nombre del clip o
  en un campo de metadatos, y se usa el nombre de archivo como respaldo.
- **Versión nueva.** Cuando un plano tiene otra versión aprobada, el panel lo
  detecta leyendo el registro de eventos y ofrece "Actualizar a v004":
  Premiere `changeMediaFilePath`, Resolve `ReplaceClip` o `AddTake`. Se
  conserva el in/out si el nuevo archivo tiene la misma duración; si no, se
  avisa. Resolve no refresca un archivo que cambia en disco con el mismo
  nombre, pero nuestras versiones siempre tienen nombre nuevo.
- **Sin plugin:** re-exportar el `.otio` e importarlo crea una secuencia
  nueva; el montador pierde lo que haya hecho encima. Por eso el ida y vuelta
  real necesita plugin.

## 5. Plan recomendado

### Fase 1: exportar archivo (2-3 semanas)

1. **Dominio** (`packages/domain`): `buildTimeline(nodo)` puro y con tests.
   Produce un modelo neutro: pistas, clips (id de plano, archivo, in/out en
   segundos, frecuencia, duración disponible), marcadores y metadatos. Desde
   ese modelo, dos escritores: `toOtio()` y `toFcp7Xml()`.
2. **App de escritorio:** botón "Exportar a editor" en escena y secuencia.
   Lee duración y frecuencia de cada medio con ffprobe (ya está previsto
   ffmpeg local), resuelve rutas locales y escribe en `_exports/` de la
   producción con nombre de `folderName()`/códigos.
3. **Manifiesto** `timeline.json` junto al `.otio`: modelo neutro con rutas
   **relativas a la raíz** de la producción e ids de plano. Lo usarán los
   plugins.
4. **Conformado opcional:** si detecta VFR, frecuencias distintas o fijas,
   ofrece generar derivados a frecuencia constante (ProRes o H.264 intra) y
   proxies. Queda como medio derivado, no como versión nueva.
5. **Pruebas manuales** en Premiere 26.x, Premiere 25.x (con XML), Resolve 20
   gratuito y Studio, en macOS y Windows.

Formatos: **OTIO + FCP7 XML** en la fase 1. FCPXML cuando haya un usuario de
Final Cut (más 1 semana). AAF/EDL no.

### Fase 2: paneles (4-8 semanas en total)

- **Resolve, script de Python** (1-2 semanas): lee `timeline.json` y el
  registro de eventos de la carpeta, crea o actualiza el timeline con
  `AppendToTimeline`, añade marcadores, sube versiones con `AddTake`/
  `ReplaceClip` y escribe los marcadores nuevos como eventos de comentario.
  Funciona en el gratuito (desde el menú).
- **Resolve Studio, Workflow Integration** (1-2 semanas más): la misma lógica
  en un panel HTML/JS; puede reutilizar código TypeScript de la app.
- **Premiere UXP** (2-4 semanas): panel con lista de planos, estados y
  "Actualizar versiones"; importa medios, crea secuencia, coloca clips con
  in/out, marcadores, `changeMediaFilePath`. Publicar en Marketplace o
  distribuir el `.ccx`.
- Escribir en el registro de eventos desde un plugin obliga a que el plugin
  respete el formato por dispositivo (`ARCHITECTURE.md` §5.0). Conviene que la
  lectura y escritura del registro esté en un paquete sin dependencias de la
  app, que puedan usar los paneles JS (y una versión mínima en Python para
  Resolve).

### Riesgos

- Diferencias entre editores al leer OTIO hecho por terceros (ajustes de
  secuencia, marcadores, metadatos). Mitigación: probar con cada versión y
  mantener FCP7 XML como respaldo.
- API de Premiere UXP joven: huecos y cambios entre versiones (algunas
  funciones son de 26.3).
- Resolve: firmas del API poco documentadas; fallos de enlace al importar por
  API; el gratuito no admite paneles ni control externo.
- Rutas largas en Windows (`ARCHITECTURE.md` §5) y Dropbox con sincronización
  selectiva o archivos "solo en línea": el editor ve el archivo pero no puede
  leerlo hasta que se descarga. El panel debería avisar.
- Medios VFR sin conformar: desajustes de in/out y sincronía.

### Licencias y plataformas

- OTIO es Apache 2.0; escribir el formato no requiere licencia.
- Premiere: suscripción de Creative Cloud; los plugins UXP no tienen coste
  propio. Marketplace exige revisión de Adobe.
- Resolve: el script funciona en el gratuito; panel y control externo exigen
  Studio.
- Todo lo propuesto funciona en macOS y Windows. Final Cut solo en macOS.

## Fuentes

- Premiere, notas de versión (OTIO en 26.0): https://helpx.adobe.com/premiere-pro/kb/fixed-issues.html
- Premiere, OTIO en beta y lo que cubre: https://community.adobe.com/t5/premiere-pro-beta-discussions/now-in-beta-otio-import-and-export/m-p/14985932
- Adobe, OTIO en Premiere 25.6+ (Firefly Services): https://developer.adobe.com/audio-video-firefly-services/guides/otio
- UXP en Premiere 25.6: https://blog.developer.adobe.com/en/publish/2025/12/uxp-arrives-in-premiere-a-new-era-for-plugin-development
- Migración CEP a UXP: https://www.adobevideopartner.com/customer-stories/extensibility-update/
- Huecos UXP frente a CEP: https://forums.creativeclouddeveloper.com/t/premierepro-migrating-from-cep-to-uxp-community-api-gap-issue-summary/11373
- UXP Project: https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/project
- UXP SequenceEditor: https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/sequenceeditor
- UXP ClipProjectItem: https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/clipprojectitem
- UXP Markers: https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/markers
- Resolve 18.5 (OTIO): https://www.newsshooter.com/2023/05/04/davinci-resolve-18-5-beta/
- Resolve 18.6.5 (marcadores en OTIO): https://www.newsshooter.com/2024/02/06/blackmagic-design-davinci-resolve-18-6-5-update/
- Resolve 20.2, novedades: https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20.2_New_Features_Guide.pdf
- API de Resolve (copia no oficial del README): https://deric.github.io/DaVinciResolve-API-Docs/
- Importar AAF/OTIO/FCPXML por API: https://forum.blackmagicdesign.com/viewtopic.php?p=1151748
- Workflow Integration Plugins: https://github.com/CommandPost/ResolveCafe/blob/main/docs/developers/workflowintegrations.md
- Scripting en Resolve gratuito: https://wiki.archlinux.org/title/Davinci y https://forum.blackmagicdesign.com/viewtopic.php?p=1147620
- OTIO: https://github.com/AcademySoftwareFoundation/OpenTimelineIO
- OTIO, especificación del formato: https://opentimelineio.readthedocs.io/en/v0.15/tutorials/otio-file-format-specification.html
- Adaptadores OTIO: https://pypi.org/project/otio-fcp-adapter y https://pypi.org/project/otio-fcpx-xml-adapter
- Remotion, export a OTIO desde Node: https://www.remotion.dev/docs/export-opentimeline
