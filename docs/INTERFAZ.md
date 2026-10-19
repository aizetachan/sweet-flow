# Sweet Flow — Interfaz

> Estado: **primera versión implementada** (15 oct 2026): pantalla de carga,
> dashboard, panel a la izquierda y estructura a la derecha, ventanas flotantes,
> arrastrar y editar el número del código. Documento vivo: se completa con cada
> ronda de ajustes. Arquitectura en
> [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Recorrido

```
Abrir la app ──▶ 0. Pantalla de carga ──▶ 1. Dashboard ──▶ 2. Producción
                    (letras "hormiga")      (carpetas y        (árbol · tablero · panel)
                                             producciones)          │
                                                                    └──▶ 3. Ventanas flotantes
                                                                          (un plano o escena cada una)
```

## 0. Pantalla de carga

- Fondo de la app. Las letras de **Sweet Flow** entran desde fuera de la
  pantalla, cada una por un lado, **como si las llevaran hormigas vistas desde
  arriba** (sin que se vean hormigas):
  - pasos cortos con pequeños tirones, pausas breves y algún rodeo;
  - cada letra gira ligeramente hacia donde avanza y se endereza al llegar;
  - llegan desordenadas y encajan una a una hasta formar el nombre.
- Cuando la app ha cargado (y el nombre está completo), el logo **se desvanece**
  y aparece el dashboard.
- Duración mínima de unos 2 s aunque la carga termine antes; un clic la salta.
- Con "reducir movimiento" activado en el sistema, el nombre aparece con un
  fundido, sin recorrido.
- En escritorio es lo primero que se pinta en la ventana; en el navegador,
  igual al cargar la página.

## 1. Dashboard

Organización tipo Drive, como Frame.io: aquí están todos los proyectos. Es una
aplicación completa con **menú lateral**:

- **Inicio:** las carpetas y producciones, navegando por carpetas. Un clic
  selecciona (⌘ añade); un clic fuera de las tarjetas quita la selección.
- **Recientes:** lo último que has abierto (es personal, no se comparte).
- **Papelera:** lo que se borra va aquí y desaparece del resto del dashboard,
  con su contenido. Se puede **restaurar** (vuelve a su carpeta, o a Inicio si
  esa carpeta ya no está) o **eliminar definitivamente** (doble clic de
  confirmación). No se vacía sola.
- **Fijados:** acceso rápido a lo que más usas, sin entrar en las carpetas.
  Se puede fijar una carpeta, una producción (con la chincheta de su tarjeta o
  arrastrándola a la sección) o una escena o un plano (con la chincheta junto
  al título en su panel). Un clic abre la carpeta, la producción, o la
  producción con esa escena o ese plano ya seleccionado. Es personal (no se
  comparte), se reordena arrastrando y se quita con la chincheta tachada al
  pasar el ratón. Una carpeta fijada sigue aceptando lo que se suelta encima.
  Si lo fijado se ha borrado, desaparece de la lista y se avisa.
- **Ajustes** y, abajo, **tu avatar** con tu nombre (abre tu perfil).

- **Menú de cada carpeta y producción:** un único botón **«⋯»** (al pasar el
  ratón) y el **clic derecho** abren el mismo menú: abrir, **mostrar en la
  carpeta**, **copiar enlace** (`#/abrir/…`: lleva a esa carpeta o abre esa
  producción desde el dashboard), fijar o quitar de Fijados, cambiar el nombre
  (F2) y mover a la papelera. Sustituye a los iconos sueltos. En la papelera: restaurar y
  eliminar definitivamente. El clic derecho sobre algo no seleccionado lo
  selecciona primero, como en el Finder.

### 1.1 Ajustes

En el dashboard están los ajustes generales:

- **Perfil:** nombre y email (el avatar sale del nombre).
- **Almacenamiento:** dónde se guardan las producciones: este navegador, una
  carpeta de este ordenador, o la carpeta del equipo en **Dropbox** o **Google
  Drive**. Cada servicio tiene su tarjeta: **Conectar** (cada persona con su
  cuenta, en una ventana del servicio), luego **Elegir carpeta**: un
  explorador de sus carpetas (en Drive: Mi unidad, Compartido conmigo y las
  unidades compartidas) y **Usar «…»**. La carpeta en uso se ve arriba, con
  **Dejar de usarla**; si la sesión caduca, **Conectar** otra vez. Sin la
  clave de la app en la instalación, la tarjeta dice «Sin configurar».
- **Integraciones:** **Magnific**, con la cuenta de cada persona.
- **Modelos:** qué modelos aparecen al generar, por tipo (imagen, vídeo,
  audio), con lo que admite cada uno y un filtro; en columnas, hasta cuatro
  en pantallas anchas. La lista es el catálogo de
  Magnific leído en vivo (se relee cada 12 h o con **Actualizar**); sin
  Magnific conectada, la copia del 18 oct 2026. Por defecto se ven los que ya
  había; los nuevos se activan aquí. **Restablecer** vuelve a los de por
  defecto. Lo ya generado con un modelo oculto no cambia. Se guarda en este
  ordenador.
- **Acerca de:** versión y origen de los datos.

**Dentro de la producción**, el botón de ajustes del dock abre una ventana
**Ajustes** sin salir de ella, con dos grupos:
- **Esta producción:** Niveles, Estados y Vista («Mostrar códigos»).
- **General:** Perfil, Modelos e Integraciones (los mismos que en el
  dashboard).
- La carpeta del equipo y «Acerca de» siguen en el dashboard (cambiar de
  carpeta cierra la producción); un enlace abajo lleva allí. Los accesos a
  perfil, integraciones, niveles y estados (menú del avatar, «Editar» del
  árbol, «Editar estados…») abren esta misma ventana.

Lo que aún no funciona se muestra con lo que hará y la etiqueta
"Próximamente"; nunca como un botón que no hace nada.

- **Carpetas y producciones.** Una carpeta agrupa (p. ej. la serie `Mareas`);
  una **producción** es un archivo de trabajo (p. ej. `Ep01 · La partida`) que
  se abre en la pantalla de producción.
- **Navegación:** migas de pan (`Estudio › Mareas › Temporada 1`), entrar y
  salir de carpetas, búsqueda.
- **Vistas:** cuadrícula (tarjetas) y lista. Cada producción muestra:
  miniatura, progreso por estados, última modificación y quién trabaja en ella.
- **Acciones:** crear carpeta, crear producción, renombrar, marcar como
  favorito, mover arrastrando (también varias a la vez) y mover a la papelera.
- **Relación con Dropbox:** la organización del dashboard **es** la de la
  carpeta de Dropbox.
  - Lo que se crea, renombra o mueve en la app se aplica en Dropbox.
  - Si algo cambia directamente en Dropbox (otra persona, el Finder), la app
    lo refleja de la misma manera.
  - Una carpeta del dashboard es una carpeta real; una producción es una
    carpeta con `.sweetflow/` dentro (ver `ARCHITECTURE.md` §5).
- Primera vez: elegir (o crear) la carpeta raíz, normalmente dentro de Dropbox.

## 2. Producción

**Columna izquierda con dos pestañas y el tablero a todo el ancho restante**
(así, con muchos planos, el tablero tiene la pantalla ancha):

- **Ancho de la columna:** se arrastra su borde derecho para estrecharla hasta
  un 40 % (el mínimo es el 60 % del ancho de siempre, que es el máximo,
  pero nunca menos de 330 px, lo que necesitan sus pestañas y su cabecera);
  el contenido se adapta. **Un clic en el borde** la lleva de golpe (con una
  transición corta): del máximo al mínimo y del mínimo al máximo; en medio, al
  extremo más cercano. Se recuerda en este ordenador.

- **Producción** (primera pestaña): el panel de trabajo de la escena o el plano
  seleccionado.
- **Explorer** (antes «Estructura», sin número): el árbol. Un clic selecciona sin salir del árbol; doble clic
  (o seleccionar en el tablero) abre la pestaña Producción. **Doble clic en el
  título** (también «Sin título») lo edita ahí mismo. Los **grupos de planos**
  se ven como en el tablero: una fila con su nombre (doble clic para
  cambiarlo) y su número de planos, plegada por defecto; al desplegarla, sus
  planos. Soltar un plano sobre ella lo mete en el grupo.

- El **tablero** es la vista general: se va actualizando solo mientras se genera
  y mientras el equipo trabaja.
- **Cabecera del panel:** el **título** con más peso (se corta con «…» y al
  dejar el ratón encima se ve entero) y, debajo y más discreto, el **código**
  (número editable), con los responsables a la derecha. En la fila del título:
  el estado, papelera, **copiar la ruta** (secuencia, escena y plano,
  para el Finder o para enviarla), ventana aparte y cerrar. La fila de la
  ubicación y la chincheta de Fijados se quitaron el 18 oct 2026 (se fija
  desde el dashboard). **El estado es solo la etiqueta**: al hacer clic se
  despliega la lista. Todo lo nuevo empieza en **Pendiente**.
- **Barra superior:** logo (vuelve al inicio) y, a la izquierda, solo
  **Inicio › nombre de la producción** (con el botón de información). Las
  carpetas intermedias no se muestran: «Inicio» vuelve a la carpeta del
  dashboard donde está la producción. A
  la derecha, el **buscador** (en el tablero), quién está en la producción y
  **tu avatar**.
  - Entre el buscador y el avatar, **mostrar la carpeta** (icono de carpeta con
    flecha): abre la carpeta de la producción en el Finder / Explorador. En la
    app de escritorio la primera vez pide localizar una vez la carpeta del
    equipo en el ordenador (el acceso a carpetas no da su ruta completa) y la
    recuerda. En el navegador no se puede abrir el Finder: copia la ruta y lo
    avisa. Con los datos en el navegador, avisa de que no hay carpeta.
  - El **nombre de la producción** en las migas es el mismo que tiene su
    tarjeta en el dashboard: si se cambia fuera, cambia dentro, y con **doble
    clic** se cambia dentro y fuera a la vez. Al abrirla, si eran distintos
    (renombrada cerrada), manda el del dashboard.
  - Justo a su derecha, el botón de **información** (antes en la cabecera del
    tablero): secuencias, escenas y planos, aprobados, minutos montados y
    planos por estado; de la parte elegida en Explorer, si hay una.
  - El botón de **filtros** va dentro del buscador, a la derecha, con el número
    de filtros activos. Abre un panel estrecho: **estado** (se elige uno; por
    defecto «Seleccionar estado», con una × para quitarlo), **responsable** y
    **desglose** (reparto, props y localizaciones de la Biblioteca).
  - El **avatar abre un menú**: tu nombre; la carpeta del equipo y su estado;
    Magnific (conectada, con tus créditos y un tick verde, o «Conectar tu
    cuenta»); **Equipo**; invitar al equipo; Ajustes; volver al inicio. Elegir
    una opción cierra el menú.
  - **Equipo** se abre en una **ventana modal** (ya no está en la barra de
    abajo ni es una pantalla completa): tu cuenta de Magnific (la real, con
    tus créditos), quién está en la producción con su rol y sus planos
    asignados, y el botón para invitar. Un punto verde en el
    avatar indica que Magnific está conectada. Es la conexión real hecha en
    Ajustes del dashboard (en la demo, la cuenta de ejemplo).
- **Cabecera del tablero:** el título y un contador con el número de planos.
- **Secciones** (Producción, Biblioteca, Papelera, Ajustes): barra **flotante
  centrada abajo**, para que el tablero tenga todo el ancho.
- **Clic en una tarjeta** abre siempre su panel en **Producir** (aunque antes
  se estuviera en Revisión o Actividad, y también al pulsar la misma otra vez).
- **Clic derecho** en una tarjeta abre su menú, titulado «Menú» (sin repetir el
  código ni el título). El estado va como en el panel de la izquierda: la
  etiqueta, y al pulsarla se despliega la lista.
  - **Plano:** además de lo de abajo, sobre la versión elegida del plano:
    **Copiar vídeo / imagen / audio** al portapapeles para pegarlo en otra app:
    la imagen se copia en cualquier sitio; el vídeo o audio se copia como
    archivo desde la app de escritorio. El navegador solo deja poner texto e
    imágenes en el portapapeles: lo intenta igualmente y, si no, copia el enlace
    directo al archivo (el de Magnific) y lo avisa; no descarga nada.
    **Descargar** y **Copiar enlace** (`#/abrir/producción/plano/versión`): abre
    la app en ese plano con esa versión en el visor, para quien tenga la carpeta
    del equipo.
  - **Plano:** estado, cambiar el título
    (lo edita en la tarjeta), abrir en ventana aparte y mover a la papelera.
    Con varias seleccionadas, el estado y la papelera se aplican a todas.
  - **Grupo:** estado de sus planos («Varios» si no es el mismo), cambiar el nombre, abrir el grupo,
    deshacer el grupo (los planos vuelven a la fila) y mover a la papelera
    (con sus planos dentro).
- **Notas** (acción, diálogo, dirección; base del prompt): ya no hay caja en el
  panel. A la derecha del código, un botón **«Notas»** abre una ventana modal
  para escribirlas (se guardan al escribir; resaltado si hay alguna). Si un
  plano tiene notas, su tarjeta muestra el **icono de nota** a la izquierda de
  la duración: al pulsarlo se abren sin abrir el panel.
- **Visor de vídeo:** controles de siempre: reproducir/pausa, la **línea de
  tiempo** para ir a cualquier punto, el tiempo y pantalla completa. En un
  plano hecho de un tramo, la línea recorre solo su tramo.
- **Sin nada seleccionado, la columna muestra Explorer** (al abrir la
  producción, al cerrar el panel, al deseleccionar o al mandar lo abierto a la
  papelera), para que nunca quede vacía. Al seleccionar algo pasa a Producción.
- **Tarjeta de plano:** portada (sin etiqueta de duración encima). Arriba, el
  **título** con peso (se corta con «…»; entero al dejar el ratón encima) y el
  estado (**clic en él** abre la lista para cambiarlo ahí mismo, sin
  seleccionar la tarjeta). Debajo, el **código**, más discreto, y a la derecha
  la **duración del vídeo** (la del tramo si es un plano cortado; «N/A» si es
  una imagen; «—» si aún no tiene nada). En esa misma segunda línea, tras el
  código, los **responsables**, los comentarios, la ventana aparte y quién está
  mirando; a la izquierda de la duración, el **icono de nota**. No hay tercera
  línea: la tarjeta es más baja. No muestra
  el número de versiones (hay un vídeo por plano) ni franja de color arriba
  (quitada el 18 oct 2026; se ajustará de otra forma). Abajo, comentarios,
  ventana aparte, quién está y responsables. El borde de la seleccionada va
  por dentro, para que no se corte al arrastrarla.
- **Junto al título** de una secuencia (y en una escena, después de su
  estado): solo la **duración de lo aprobado**, con un reloj pequeño (suma de
  sus planos aprobados). Mientras no hay nada aprobado, no se muestra nada.
  Ni el número de planos ni el de aprobados: están en la información de la
  producción (botón ⓘ de arriba), que también da la duración aprobada. El
  título del tablero tampoco lleva número.
- **Duraciones:** la de un plano es la de su toma elegida o, si no tiene, la
  de su propio vídeo (una imagen cuenta 0). Una escena suma sus planos y una
  secuencia sus escenas. Si el proveedor no dio la duración de un vídeo, se lee
  del archivo la primera vez que se ve y queda guardada.
- **Renombrar o mover** una secuencia, escena o plano mueve sus carpetas en el
  disco, pero las portadas que se ven no cambian ni se quedan en blanco.
- **Cabecera de escena:** a la izquierda, código, título, estado, planos y
  duración, y la papelera (solo al pasar el ratón). A la derecha, «Ver todos /
  En fila» y «Vídeos editados», con el mismo estilo.
- La **barra de scroll** de una fila solo se ve mientras se desplaza.
- **Títulos, no códigos:** en pantalla todo se nombra por su **título** (en
  tarjetas, cabeceras, Explorer, panel, avisos y menús). Sin título, se ve
  «Sin título» como provisional hasta que se cambie. Los códigos (SQ010,
  SC010, SH0010…) no se ven, ni al pasar el ratón; en la tarjeta del plano, la
  segunda línea queda con los avatares asignados y la duración. En **Ajustes**
  (el botón del menú de abajo) está **«Mostrar códigos»** para quien los
  quiera ver junto a los títulos (y editar el número en el panel). Es un
  ajuste de este ordenador. En el disco y en Magnific las carpetas siempre
  llevan su código. En Explorer el título va en blanco con peso medio y el
  código, si se muestra, más suave.
- **Espacio de trabajo:** sin nada elegido en Explorer, el tablero se titula
  «Espacio de trabajo» (sin número de planos).
- **Estado de la escena** en su cabecera: un clic abre la lista de estados,
  como en las tarjetas (no pliega la fila).
- **Al reordenar arrastrando** una secuencia o una escena, una línea fina y
  suave del azul de marca en el hueco de arriba o de abajo dice dónde caerá.
- **Plegar:** un clic en la cabecera de una secuencia o de una escena la
  pliega (solo queda su cabecera, en el mismo sitio y tamaño, con el fondo y las esquinas
  de las escenas) o la despliega. No pliega al pulsar sus
  botones, el estado o al hacer doble clic en el título. Se recuerda por
  producción en este navegador.
- **Color de marca:** la paleta azul es el color corporativo: azul claro
  `#6cb6ff` (bordes iluminados), azul `#2f7dff` (botones principales,
  selección, foco, avisos) y azul profundo `#1648d8` (resplandores). Viven en el
  kit como `--brand-300/500/700`; `--primary` y `--accent` son el azul de
  marca. **Generar** es un botón azul saturado con texto blanco; el progreso,
  el cabezal de la línea de tiempo, los créditos y el logo también van en
  azul (ya no hay rosa). El hover de las tarjetas usa el mismo azul saturado
  que la selección, más suave; igual en las carpetas y producciones del
  dashboard (en cuadrícula y en lista).
- **Tarjeta con el ratón encima y seleccionada:** el borde es una luz de neón
  suave en los azules de marca (difuminada, con un halo corto), no una línea
  nítida. Seleccionada,
  el borde es un **neón azul**: tan fino como el del ratón encima, pero
  iluminado (azul claro #6cb6ff, nunca blanco), con un resplandor azul
  eléctrico (#2f7dff, #1648d8) fuera y un poco dentro, y la tarjeta con un
  tinte azul muy leve. La fila deja margen para que no se corte.
- **Filas de escena:** se distinguen solo por el fondo (sin borde), algo más
  oscuro que las tarjetas.
- **Ver todos / En fila:** botón en la cabecera de cada escena. Por defecto la
  escena es una fila con scroll horizontal; «Ver todos» la adapta al ancho y
  baja de línea hasta que se ven todas sus tarjetas. Las columnas se calculan
  para **llenar el ancho exacto**, sin hueco a la derecha: las que caben del
  tamaño elegido (S, M o L), redondeando, y las tarjetas se estiran o encogen
  un poco. Si caben todas en una fila, no salta de línea y se ve igual que en
  fila. Pulsado otra vez («En
  fila») vuelve a ser una fila. Se recuerda por escena en este navegador.
  Sustituye a «Keyframes vacíos», quitado el 18 oct 2026.
- **Previsualizar vídeo:** en las tarjetas de plano con vídeo (y en las
  portadas pequeñas de un grupo), el ancho de la portada es la línea de tiempo:
  al mover el ratón a izquierda o derecha se avanza o retrocede por el vídeo,
  sin sonido y sin hacer clic, con una línea fina abajo que marca dónde va. Si
  el plano es un tramo de otro vídeo, solo recorre ese tramo. Al salir, vuelve
  al primer fotograma.
- **Doble clic en el título** de una tarjeta lo edita ahí mismo (Intro o salir
  guarda, Esc cancela). Igual con el nombre de un grupo en su tarjeta; un clic
  simple sigue abriendo el grupo.
- **Sin mano de arrastrar al pasar el ratón:** las tarjetas se arrastran igual,
  pero el cursor solo cambia mientras se arrastra.
- **Crear en el tablero, un sitio por nivel:**
  - **Plano:** el **"+"** al final de cada fila de escena, sin texto. Tiene
    siempre el tamaño y la proporción de una tarjeta de plano (S, M o L),
    también en una fila vacía. La fila crece hacia la derecha; solo crea planos.
  - **Las filas tienen solo planos:** no hay tarjeta de «producción de
    escena» (quitada el 18 oct 2026). Un vídeo largo se genera en un plano y se
    corta en planos desde ahí (§2.3).
  - **Escena:** botón **"+ Escena"** a la derecha de la cabecera de cada
    secuencia; la crea al final de esa secuencia.
  - **Nunca vacío:** una secuencia sin escenas (por ejemplo, si se mandan a la
    papelera) muestra una fila con la tarjeta «+»; al pulsarla se crea su
    primera escena con su primer plano. Crear una secuencia desde Explorer
    también trae ya su primera escena.
  - **Secuencia:** botón **"+" cuadrado** al final del tablero, alineado a la
    izquierda (sin texto; el tooltip lo dice). La secuencia nueva trae ya su
    primera escena (SC010), así nunca hay secuencias vacías. Con la producción
    vacía, una frase que explica qué va dentro y el mismo botón.
  - **Título por defecto:** las secuencias y escenas nuevas se llaman
    «Secuencia 4», «Escena 1»… según su código (una insertada entre SC010 y
    SC020 es «Escena 1,5»). Los planos empiezan sin título. **Doble clic en el
    título** de la cabecera de una secuencia o escena lo cambia.
  - Lo creado se abre en el panel y empieza en Pendiente. Con filtros activos no
    se muestran (no se sabría dónde cae).
- El **panel de trabajo** aparece al seleccionar un plano o una escena y es donde
  se trabaja (Producir · Editar · Revisión · Actividad).
- Volver al dashboard desde la barra superior (las migas de pan sustituyen al
  selector de producción actual).

### 2.0 Generar (pestaña Producir)

Como el generador de Magnific, pero con el visor y las versiones debajo (o a la
derecha en la ventana aparte). De arriba abajo:
- **Imagen · Vídeo · Audio** como tres botones de solo icono (el nombre al
  pasar el ratón) y, en la misma fila a la derecha, el **modelo**: los
  elegidos en Ajustes › Modelos. Cada uno ofrece **solo lo que permite**,
  según el catálogo de Magnific leído en vivo (`integrations/magnific/catalog.ts`;
  sin conexión, la copia de `data/models.ts`). Quedan fuera los modelos
  internos de Magnific y los que necesitan algo que la caja no tiene (un vídeo
  que mover, una pista de voz). El audio no viene en el catálogo: ElevenLabs
  Music v2 y v1, Google Lyria 3 Pro y 3, y efectos de sonido (ElevenLabs).
- **Referencias** (si el modelo las admite), con el contador «n/máx»:
  - Imagen: **Estilo** y **Añadir** (imágenes). Recraft solo admite estilo.
  - Vídeo: **Imagen inicial**, **Imagen final** (con inicial) y, debajo, una
    fila ancha **Añadir media** con los iconos de lo que admite el modelo
    (imagen, vídeo, audio), solo en los modelos con referencias. Los
    fotogramas y las referencias no se combinan: al usar uno, el otro se
    desactiva con el motivo.
  - Se eligen de lo que ya hay en la producción (primero este plano, luego su
    escena, luego el resto) o **del ordenador**, como en Magnific: **Subir del
    ordenador** en la lista de cada hueco, o **arrastrar archivos** sobre un
    hueco (va ahí) o sobre las referencias (cada uno donde lo admite el
    modelo: referencias primero, luego imagen inicial y final).
  - Lo del ordenador se sube a Magnific al momento, a la carpeta del plano
    allí; el hueco lo muestra con un indicador mientras sube y **Generar**
    espera («Subiendo referencias…»). Si falla, el hueco queda marcado y hay
    que quitarlo o cambiarlo. No se guarda en la producción.
  - Lo de la producción que Magnific no tiene (importado del ordenador) se
    sube la primera vez que se elige y guarda su referencia: no se vuelve a
    subir.
- **Prompt.** Vacío usa el de la secuencia, escena y plano.
- **Ajustes del modelo**, en pastillas sin flecha (al pulsarlas se abre la lista): número de versiones (−/+), duración,
  proporción, resolución, sonido ON/OFF (vídeos con sonido), instrumental
  (música ElevenLabs) o bucle (efectos). Cambiar de modelo conserva lo que el
  nuevo permite y ajusta lo demás. La duración de vídeo no pasa del máximo del
  nivel (Ajustes › Niveles; en los planos, 15 s por defecto).
- **Generar** con el coste real en créditos (`simulate_cost`), por el número
  de versiones. Cada versión es un v00N del plano.

### 2.0.2 Importar (Magnific u ordenador)

Para meter algo que ya se tiene, sin generar (no gasta créditos):
- **Plano nuevo:** el «+» de la fila abre un menú con **Plano nuevo** e
  **Importar…**. También se pueden **soltar archivos sobre la fila**: cada uno
  es un plano nuevo justo donde se suelta (con el código del hueco, p. ej.
  SH0015 entre SH0010 y SH0020; dentro del grupo si está abierto).
- **Versión de un plano:** «Importar» junto a «Galería», o **soltar archivos
  sobre el panel** del plano: cada uno entra como su siguiente versión.
- La ventana **Importar** mide lo mismo en sus dos pestañas:
  - **De Magnific:** a la izquierda, arriba, el tipo (iconos de vídeo, imagen
    y audio; vídeo por defecto; otro clic en el elegido muestra todo); debajo,
    un filtro pequeño y una **lista**: «Recientes» y todos los proyectos de
    Magnific; al elegir un proyecto se ve todo lo que
    tiene (también en sus carpetas) y sus carpetas se despliegan debajo. A la
    derecha, la galería. Se eligen una o varias; el número indica el orden en
    que entran.
  - **Del ordenador:** soltar o elegir archivos.
- El archivo se guarda en la carpeta `_media` del plano como su versión
  (`origin: uploaded`). Lo que viene de Magnific guarda además su referencia
  (sirve como referencia o imagen inicial sin subirlo). Lo del ordenador no se
  sube a Magnific. En Actividad: «importó v001 (un vídeo de Magnific)».

### 2.0.1 Galería del plano (bajo Generar)

Una sola **galería** con todo lo que puede ser el plano (ya no hay «Versiones»
y «Tomas» por separado):
- **Versiones** generadas aquí (v001, v002…) y **tramos** de otro vídeo
  colocados aquí («Tramo de SC020», al cortar en planos).
- Clic en una: se ve en el visor, con su modelo y su prompt (y «Cortar» si es
  un vídeo).
- **Todas las miniaturas miden lo mismo** (16:9, el formato de las
  producciones; el texto largo se corta con «…»). En un vídeo, mover el ratón
  por la miniatura lo recorre, como en las tarjetas del tablero.
- Los botones de la miniatura van **los tres arriba a la derecha**: sacar a la
  fila, elegir y quitar. En la elegida, el de elegir se queda **en verde**. La
  que se está viendo en el visor solo lleva un fondo suave (sin borde azul).
- **Sacar a la fila** (flecha): esa
  versión pasa a ser un **plano nuevo justo al lado** de este (con el código
  libre que toque, p. ej. SH0025, y el mismo título), con ella como elegida.
  Un tramo sale como plano con solo su tramo. El archivo no se mueve ni se
  copia, y la versión sigue también aquí. Aviso con «Ver».
- Al pasar el ratón, dos botones en la miniatura:
  - **Elegir (✓):** el plano pasa a ser esa. Es la que cuenta: portada de la
    tarjeta, duración y montaje. La elegida lleva «Elegida» y un borde verde.
  - **Quitar (papelera):** una versión sale de la galería pero **se conserva en
    la carpeta** (aviso con Deshacer; «Ver las quitadas» las enseña y las
    devuelve). Un tramo se quita del plano; el vídeo original no se toca. No se
    puede quitar una versión de la que otros planos usan tramos.
- Por dentro, elegir es la «toma» del plano y quitar es «archivar»: los
  nombres ya no se ven.

### 2.6 Revisión: comentarios, menciones y avisos

- **Pestaña Revisión** del plano: el visor de la versión que se revisa (la
  elegida o la abierta; con varias, un selector «Revisando v00N»), la caja para
  escribir y los comentarios.
- **Comentar rápido desde Producir:** botón de comentario en los controles del
  visor (a la izquierda de pantalla completa; en una imagen, abajo a la
  derecha). Pausa el vídeo y abre una caja debajo, ya con el cursor: el
  comentario va a esa versión y a ese momento; un clic en la imagen señala un
  punto y arrastrar, un área. ⌘↵ envía, Esc cierra; aviso con «Ver en
  Revisión». Las marcas de la línea de tiempo solo se ven en Revisión.
- **En un vídeo, todo comentario queda atado al momento** de la línea de tiempo
  (no se activa ni desactiva; se muestra el tiempo). En Revisión, un clic en la
  imagen marca un **punto** y arrastrar, un **área**, sin pulsar nada antes.
  Al empezar a escribir, el vídeo se pausa.
- **Quien escribió el comentario puede mover su punto o su área** arrastrándolos
  sobre la imagen.
- **Resolver** lo da por hecho y cierra el hilo; **Responder** sigue la
  conversación para aterrizar el feedback. Si se ha trabajado en una versión
  nueva del plano, en la **caja de respuesta** (junto a Enviar) se elige esa
  versión: «En Vídeo v001» abre una ventana de tamaño medio con la galería de
  versiones del plano (miniatura, tipo, modelo, quién y cuándo; la del
  comentario marcada) para elegir viéndola. Las versiones se cuentan por tipo,
  por eso se nombran «Imagen v002», «Vídeo v001». al enviar, el comentario pasa a ella con su
  conversación, su momento y su marca; queda registrado de dónde venía
  («v001 → v002») y se sigue comentando sobre la nueva, para el equipo y para
  el cliente.
- En Revisión se ven **todos los comentarios del plano**, de cualquier versión.
- **Actividad** es el historial completo del plano, sacado del registro:
  versiones generadas, elegidas o quitadas, cortes, estados, notas,
  responsables, comentarios, respuestas, resueltos y comentarios llevados a
  otra versión.
  - Arriba, un **resumen**: versiones, comentarios abiertos y resueltos, y el
    estado actual con desde cuándo.
  - **Categorías** para filtrar (con su número): Todo, Versiones, Revisión,
    Estado y Plano.
  - Lo repetido se **agrupa**: varias acciones iguales de la misma persona en
    poco tiempo son una línea («generó 3 versiones (v001–v003) con Nano Banana
    Pro», «dejó 4 comentarios», «cambió el estado: En curso → Aprobado»).
  - Separado **por días** (Hoy, Ayer, 17 oct…), con la hora en cada línea.
- Los comentarios se muestran **siempre en el orden en que se escribieron**;
  no cambian de posición.
- La etiqueta de un **área** es la misma chincheta; si el área está pegada al
  borde de arriba o de la izquierda, la etiqueta va dentro para no cortarse.
- En la lista, cada comentario lleva **la misma chincheta** que en la imagen
  (tres esquinas redondeadas y la de abajo a la izquierda en pico) con la
  inicial y el color de quien lo dejó, en lugar del avatar.
- **Cancelar** (o Esc) descarta el comentario a medias: ni el texto ni su marca
  se guardan.
- **Sin números:** cada marca (punto, área y su puntito en la línea de tiempo)
  lleva la inicial y el color de quien comentó, así borrar uno no descoloca los
  demás. **Clic en un comentario** (en cualquier parte) lleva el visor a su
  fotograma y resalta su marca; clic en una marca, al revés.
- **Un comentario** va a una versión y, opcionalmente:
  - en un **vídeo**, al **momento** actual (casilla con el tiempo, activada por
    defecto). Se ve como una marca en la línea de tiempo; clic y el visor va ahí.
  - a un **punto** o un **área** de la imagen o del fotograma. Se ve como una
    chincheta o un recuadro con la inicial de quien lo dejó (en vídeo,
    alrededor de su momento).
- **Menciones:** al escribir «@» sale la gente de la producción (quien la ha
  abierto con la carpeta del equipo); flechas e Intro para elegir. El nombre
  queda resaltado y esa persona recibe el aviso.
- **Hilos:** **Responder** (las respuestas cuelgan del comentario) y **Resolver / Reabrir**.
  Los resueltos se ocultan («Ver resueltos»). Quien lo escribió puede borrarlo.
- **Avisos:** campana en la barra superior con el número sin leer: comentarios
  que te mencionan y respuestas a los tuyos, de la producción abierta. Clic y
  lleva al plano, a la versión y al momento. Llegan cuando la carpeta del
  equipo se sincroniza (no al instante). Lo leído se recuerda en este
  ordenador; «Marcar todo como leído».
- La tarjeta del plano muestra el número de comentarios abiertos.

### 2.1 Reordenar arrastrando

- En el árbol y en las filas del tablero se **selecciona y arrastra** cualquier
  elemento (plano, escena, secuencia) a la posición que se quiera. Selección
  múltiple con ⇧/⌘.
- **En una fila del tablero** decide dónde está el ratón al soltar:
  - en el **centro de la portada** de un plano → crea un grupo con los dos;
  - en el **centro de una tarjeta de grupo** → entra en el grupo;
  - en los **bordes** de una tarjeta o en el **hueco entre dos** → se coloca
    ahí (una línea azul marca el sitio). Sobre el «+», al final.
  - Las **tarjetas de grupo se arrastran igual** para cambiarlas de sitio en
    la fila. Con un grupo abierto, se reordena dentro; un plano que se suelta
    en la fila sale de su grupo.
- **El orden es solo visual.** Mover no cambia el código (`SH0030` sigue siendo
  `SH0030`) ni renombra su carpeta. El orden se guarda aparte.
- **Se puede cambiar de padre:** arrastrar un plano a otra escena, o una escena
  a otra secuencia. Su carpeta se mueve en el disco con todo su contenido.
  - Si en el destino ya existe ese código, se le asigna el siguiente libre y se
    avisa (no puede haber dos carpetas con el mismo nombre).
- Se puede **cambiar el número del código** a mano, desde la cabecera del panel
  (clic en el código). **El prefijo del nivel no cambia** (`SH`, `SC`…), para que
  siempre se sepa qué es cada cosa. Si el número ya existe en ese padre, se
  avisa y no se cambia.

### 2.2 Papelera de la producción

- **Quitar del tablero** lo manda a la papelera de la producción, con todo lo
  que contiene. No pide confirmación: avisa abajo («SC020 a la papelera de la
  producción») con **Deshacer**.
- **Dónde se quita:**
  - Papelera en la cabecera del panel (a la izquierda de fijar).
  - Papelera en la cabecera de cada secuencia y de cada escena; aparece al
    pasar el ratón.
  - Tecla **Supr** (o borrar) con lo seleccionado en el tablero o el árbol;
    con selección múltiple, todo lo seleccionado. Nunca mientras se escribe.
  - En el árbol de Explorer.
- **Papelera** en la barra de secciones de abajo, con el número de elementos.
  Lista cada elemento con su código, título, dónde estaba, qué contiene y
  cuándo se quitó:
  - **Restaurar** lo devuelve a su sitio. Si su código se ha usado mientras
    tanto (los códigos de la papelera quedan libres), recibe el siguiente libre
    y lo avisa («SC040 ha vuelto como SC050»), con **Ver** para ir a él.
  - **Eliminar definitivamente** y **Vaciar papelera** piden pulsar dos veces.
    Eso sí borra para siempre.
- No se vacía sola. Si lo quitado estaba en una ventana aparte, se cierra; si
  estaba fijado, al pulsarlo avisa de que está en la papelera.

### 2.3 Cortar en planos y «Vídeos editados»

- **Un plano que ya es un tramo se puede volver a cortar:** la línea de tiempo
  es solo su tramo; se queda con el primer tramo marcado y los demás salen como
  planos justo a su lado. El vídeo original no se toca (sigue en «Vídeos
  editados»).
- La línea de tiempo ocupa **todo el ancho con la duración real del vídeo**
  (5, 20 o 30 s). Si el proveedor no la da, se lee del propio archivo. Las
  marcas se adaptan a la duración (cada 1, 2, 5 o 10 s).
- Cualquier plano con un vídeo se puede **cortar en planos** desde la pestaña
  **Editar** (antes «Cortar y repartir»; la pestaña está siempre en los planos y
  desactivada mientras no hay vídeo). Se marcan los cortes con `C` o «Cortar» y, en la lista
  de tramos, se elige con cuáles quedarse (**Plano**) y cuáles no
  (**Descartar**). Pueden ser varios. «Crear N planos» hace esto:
  - Cada tramo elegido pasa a ser un **plano nuevo en el sitio del original**,
    con ese tramo como toma: un concepto propio, con su estado, notas y
    versiones. El primero recibe el código del original (SH0020) y los demás
    los del hueco que hay detrás (SH0025, o SH0023 y SH0026). Si no hay hueco,
    van al final.
  - **El original sale de la fila** y pasa a **«Vídeos editados»** de su
    escena, con su vídeo completo, para organizarlo o descartarlo. Lo
    descartado no se usa.
  - Aviso abajo con **Deshacer**.
- **«Vídeos editados»** es un botón en la cabecera de cada escena, con el
  número de originales. Solo aparece cuando hay alguno. Lista cada original con
  su duración y en qué planos se cortó:
  - Clic en la miniatura: ver el vídeo completo.
  - **Clic en el resto de la fila:** se abre en el panel de la izquierda, como
    al seleccionar una tarjeta (con un aviso de que está en «Vídeos editados»).
    En **Editar** se marcan tramos y cada uno sale como un **plano nuevo** de
    la escena, después del último plano que ya salió de ese vídeo. El original
    se queda en «Vídeos editados».
  - **Devolver a la fila:** vuelve como plano (si su código se usa ya, recibe
    el siguiente libre y se avisa). Los planos cortados se quedan.
  - **Descartar:** a la papelera de la producción (con Deshacer). Mientras
    esté en la papelera, sus planos lo siguen usando. Si se elimina
    definitivamente, esos planos se quedan sin su tramo.
- **En disco:** el original va a `SC010_…/_editados/SH0020_…/` con su `_media/`.
  Los planos nuevos tienen su carpeta normal. El corte no copia el vídeo: cada
  plano guarda su tramo (entrada y salida) sobre el original. El render real
  del tramo llega en la fase 3.
- El vídeo de una escena o secuencia (en la demo) se sigue **repartiendo** en
  sus planos como antes.

### 2.4 Grupos de planos

- Dentro de una escena se pueden **agrupar planos** para tenerlos juntos (por
  ejemplo, varios por decidir o por terminar de validar).
- **Crear:** se arrastra un plano y se suelta **en el centro** de otro (en los
  bordes, se recoloca como siempre). Se crea «Grupo 1» en el sitio del plano de
  destino. Soltar un plano sobre un grupo lo mete dentro. Un plano de otra
  escena se mueve a esta al meterlo.
- **En la fila,** el grupo es una tarjeta normal (sin cards detrás) con las
  **portadas pequeñas de sus planos**, cada una en 16:9 como la portada de un
  plano, de dos en dos y hasta cuatro. Si hay más, la cuarta lleva encima «+N»
  con los que faltan.
  El mosaico ocupa siempre lo mismo que una portada. Debajo, **la misma
  composición que un plano**: el nombre con el icono (con el peso del título)
  y, en la segunda línea, el número de planos y, a la derecha, su duración
  sumada.
- **Abrir:** clic en el grupo. La fila muestra solo sus planos, con una barra:
  - **← Volver** vuelve a la fila. Soltar un plano ahí lo saca del grupo. Al
    volver, la tarjeta del grupo aparece en vista algo más grande, con un
    borde de neón suave y oscuro, y se encoge a su tamaño mientras la luz se
    apaga (algo más de un segundo).
  - El **nombre** es texto, como los demás títulos: doble clic para cambiarlo.
  - **Deshacer grupo:** los planos vuelven a la fila y el grupo desaparece.
  - El «+» crea el plano nuevo dentro del grupo.
  - Al seleccionar un plano que está dentro (desde Explorer o Fijados), su
    grupo se abre solo; uno de la misma escena que no está en ningún grupo
    vuelve a mostrar la fila. Desde Explorer no se cambia de pestaña: el plano
    se ve seleccionado en el tablero (su escena y su secuencia se despliegan si
    estaban plegadas, y la fila se desplaza hasta él); para trabajar en él, se
    pasa a Producción.
- **Los planos no cambian de código ni de nombre.** En disco, el grupo es una
  carpeta dentro de la escena (`SC010_…/Por-decidir/SH0020_…`), como en Google
  Drive: el nombre del archivo es el mismo y la ruta no se muestra. Al mover un
  plano a otra escena sale de su grupo. Un grupo que se queda vacío desaparece.
- Con filtros activos se ven todos los planos que coinciden, también los que
  están en grupos.
- **Reordenar un grupo:** se arrastra su tarjeta en la fila, o su fila en
  Explorer, antes o después de un plano suelto u otro grupo de la misma escena.
- **Pendiente:** el orden de montaje de sus planos (ver ROADMAP).

## 3. Ventanas aparte

- **Tamaño:** se abre como una pantalla de portátil de 13–14″ (1440×900),
  centrada; más pequeña si la pantalla lo es. Solo crece si el usuario la
  agranda.
- **Diseño ancho** (desde 960 px de ancho): como la pantalla de producción a
  menor escala. **A la izquierda**, el panel (cabecera, pestañas Producir ·
  Editar · Revisión · Actividad y su contenido); **a la derecha**, el
  visor grande con las versiones y sus datos debajo. En Cortar, el visor de la
  derecha es el del corte. Si el plano no tiene nada generado, el visor muestra
  su toma o lo último de su rama. Más estrecha, se ve como el panel lateral.
- El contenido y la estructura de cada pestaña en este formato se irán
  perfilando.

- Cada plano o escena se puede **abrir en una ventana aparte** (botón en la
  cabecera del panel). Es una ventana del navegador o de la app que se puede
  llevar a otro monitor, y se pueden tener varias a la vez.
- Funciona en el navegador y en escritorio, en cualquier modo: la ventana
  aparte trabaja sobre los mismos datos que la ventana principal, así que lo
  que se hace en una se ve en el tablero y en las demás al momento.
- Volver a abrir el mismo plano trae su ventana al frente en lugar de abrir
  otra.
- **Sin duplicados:** si lo seleccionado está abierto en una ventana aparte, la
  pestaña Producción no repite el editor: indica que está abierto aparte, con
  **Ir a la ventana** (la trae al frente y se ilumina con un borde difuminado
  para que se vea cuál es) y **Traer aquí** (cierra esa ventana y lo muestra en
  el panel). Las tarjetas y las filas del árbol abiertas aparte llevan un icono
  que también lleva a su ventana.
- **Solo existen dentro de la producción.** Si hay ventanas aparte abiertas y
  se sale de la producción (migas de pan, logo), se pregunta: «Tienes ventanas
  emergentes abiertas. ¿Estás seguro?». **Sí** las cierra todas y sale; **No**
  se queda en la producción. Recargar o cerrar la ventana principal también
  las cierra.
- **Pendiente:** el panel flotante dentro de la misma ventana existe en el
  código pero está oculto; se retomará para un uso más concreto.

## Mientras estamos en modo local

Comentarios y presencia todavía no funcionan sin tiempo real (generar funciona
con Magnific conectada; tomas y cortes ya funcionan en local). Hasta que lleguen, esos controles se muestran
**desactivados con un aviso "Próximamente"** en lugar de no hacer nada.

## Pendiente de concretar

- [x] **Cambiar el código a mano:** solo el número; el prefijo es fijo.
- [ ] **Resto de ajustes de interfaz** que estén en la lista (tablero, tarjetas,
      panel, densidad, ajustes, biblioteca, equipo…).
- [ ] Diseño visual del dashboard (referencia: Frame.io).
