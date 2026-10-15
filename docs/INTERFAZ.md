# Sweet Flow — Interfaz

> Estado: **en definición** (15 oct 2026). Documento vivo: se completa con cada
> ronda de ajustes antes de implementar. Arquitectura en
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

Organización tipo Drive, como Frame.io: aquí están todos los proyectos.

- **Carpetas y producciones.** Una carpeta agrupa (p. ej. la serie `Mareas`);
  una **producción** es un archivo de trabajo (p. ej. `Ep01 · La partida`) que
  se abre en la pantalla de producción.
- **Navegación:** migas de pan (`Estudio › Mareas › Temporada 1`), entrar y
  salir de carpetas, búsqueda.
- **Vistas:** cuadrícula (tarjetas) y lista. Cada producción muestra:
  miniatura, progreso por estados, última modificación y quién trabaja en ella.
- **Acciones:** crear carpeta, crear producción, renombrar, mover arrastrando
  (también varias a la vez), archivar.
- **Relación con Dropbox:** la organización del dashboard **es** la de la
  carpeta de Dropbox.
  - Lo que se crea, renombra o mueve en la app se aplica en Dropbox.
  - Si algo cambia directamente en Dropbox (otra persona, el Finder), la app
    lo refleja de la misma manera.
  - Una carpeta del dashboard es una carpeta real; una producción es una
    carpeta con `.sweetflow/` dentro (ver `ARCHITECTURE.md` §5).
- Primera vez: elegir (o crear) la carpeta raíz, normalmente dentro de Dropbox.

## 2. Producción

Es la pantalla que ya existe: árbol de estructura a la izquierda, tablero en el
centro y panel de trabajo a la derecha.

- El **tablero** es la vista general: se va actualizando solo mientras se genera
  y mientras el equipo trabaja.
- El **panel derecho** aparece al seleccionar un plano o una escena y es donde
  se trabaja (Producir · Cortar y repartir · Revisión · Actividad).
- Volver al dashboard desde la barra superior (las migas de pan sustituyen al
  selector de producción actual).

### 2.1 Reordenar arrastrando

- En el árbol y en las filas del tablero se **selecciona y arrastra** cualquier
  elemento (plano, escena, secuencia) a la posición que se quiera. Selección
  múltiple con ⇧/⌘.
- **El orden es solo visual.** Mover no cambia el código (`SH0030` sigue siendo
  `SH0030`) ni renombra su carpeta. El orden se guarda aparte.
- **Se puede cambiar de padre:** arrastrar un plano a otra escena, o una escena
  a otra secuencia. Su carpeta se mueve en el disco con todo su contenido.
  - Si en el destino ya existe ese código, se le asigna el siguiente libre y se
    avisa (no puede haber dos carpetas con el mismo nombre).
- El usuario podrá **cambiar el código** de un elemento a mano (pendiente de
  concretar, ver abajo).

## 3. Ventanas flotantes

- El panel derecho se puede **soltar como ventana flotante**, y se pueden tener
  varias abiertas a la vez (varios planos o escenas en paralelo).
- **Dentro de la app:** paneles flotantes que se mueven y redimensionan sobre el
  tablero.
- **En escritorio, además:** "sacar a ventana" la convierte en una ventana del
  sistema que se puede llevar a otro monitor.
- Todas muestran el mismo estado: lo que se hace en una se ve en el tablero y en
  las demás al momento.
- Volver a acoplar una ventana la devuelve al panel derecho.

## Mientras estamos en modo local

Generar, tomas, comentarios y presencia todavía no funcionan sin conexión al
proveedor o sin tiempo real. Hasta que lleguen, esos controles se muestran
**desactivados con un aviso "Próximamente"** en lugar de no hacer nada.

## Pendiente de concretar

- [ ] **Cambiar el código a mano:** ¿solo el número (`SH0030` → `SH0035`) o
      también el prefijo? ¿Qué pasa si choca con otro?
- [ ] **Resto de ajustes de interfaz** que estén en la lista (tablero, tarjetas,
      panel, densidad, ajustes, biblioteca, equipo…).
- [ ] Diseño visual del dashboard (referencia: Frame.io).
