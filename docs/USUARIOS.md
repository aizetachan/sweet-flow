# Usuarios, invitaciones y vista de invitado

> Estado: **análisis** (19 oct 2026). No hay nada implementado aún, salvo el
> perfil manual y la conexión de Magnific, Dropbox y Drive por persona.
> Relacionado: `ARCHITECTURE.md` §2.1 (primero local, sin servidor) y §4
> (roles), `INTERFAZ.md` §1.1.

## 1. Punto de partida

- No hay servidor: todo vive en la carpeta del equipo (Dropbox o Drive) y cada
  persona entra con **su** cuenta del servicio y **su** cuenta de Magnific.
- Hoy la persona se identifica con un perfil escrito a mano (nombre y email) y
  los roles existen en los datos (admin, supervisor, artista, lector), pero la
  app no los comprueba.
- Sin servidor, **la app no puede impedir** que alguien con acceso de escritura
  a la carpeta haga algo: quien manda de verdad es el permiso que da Dropbox o
  Drive. Los roles de la app ordenan la interfaz y dejan constancia (cada
  evento lleva su autor); el control fuerte llega con la etapa C (Firebase).

## 2. Identidad: la cuenta de Magnific

- Al conectar Magnific, `account_profile` da nombre, email y avatar. Esa es la
  identidad en Sweet Flow (el perfil manual queda solo si no hay Magnific).
- Clave de la persona: su **email** en minúsculas. Es lo que se usa para
  invitar y lo que comparten Magnific, Dropbox y Drive.
- Comprobación cruzada: el email de Magnific debería coincidir con el de la
  cuenta de Dropbox/Drive conectada; si no, se avisa (no se bloquea: hay
  quien usa cuentas distintas).
- Entrar exige Magnific conectada para generar, pero no para ver: un invitado
  o un lector puede no tener Magnific.

## 3. Equipo y permisos dentro de la carpeta

- Un registro más, como el del dashboard: `.sweetflow/team/<dispositivo>/<mes>.jsonl`,
  con altas, cambios de rol y bajas: `{ email, nombre, rol, alcance }`.
  - **Rol:** admin, supervisor, artista, lector o **invitado**.
  - **Alcance:** todo el espacio, o una lista de carpetas o producciones del
    dashboard.
- Quien crea la carpeta del equipo es su primer admin. Solo los admin pueden
  cambiar el equipo; si alguien sin permiso escribe una baja, se ignora al
  combinar los registros (regla del dominio, con tests).
- La app aplica el rol en la interfaz: un lector no ve «Generar» ni puede
  mover; un artista solo cambia el estado de lo suyo, etc. (los umbrales de
  `ROADMAP.md`, «Decisiones pendientes»).

## 4. Invitar

Un admin escribe un email, el rol y el alcance. La app hace tres cosas:

1. **Apunta la invitación** en el registro del equipo.
2. **Da acceso a la carpeta** en el servicio, que es lo que de verdad cuenta:
   - **Drive:** `permissions.create` sobre la carpeta del equipo (o solo sobre
     las carpetas del alcance): *writer* para admin, supervisor y artista;
     *reader* para lector e invitado. Drive manda su propio email de aviso.
     Los permisos se heredan y se pueden dar sobre subcarpetas sueltas.
   - **Dropbox:** `sharing/add_folder_member` (*editor* o *viewer*) sobre la
     carpeta compartida. Necesita añadir el permiso `sharing.write` a la app.
     **A comprobar:** Dropbox no deja compartir una subcarpeta de una carpeta
     ya compartida con otras personas en cuentas normales; en Dropbox
     Business las carpetas de equipo admiten subcarpetas con acceso propio.
     Para invitados a una sola producción, Drive es más flexible.
3. **Magnific (opcional):** si el invitado está en la misma **organización**
   de Magnific (`projects_share_candidates`), se comparte el proyecto espejo
   (`projects_share`, editor o viewer) para que vea también allí lo generado.
   Magnific solo comparte dentro de la organización; fuera de ella, el
   invitado ve los archivos descargados en la carpeta, que es lo normal.

El invitado recibe el aviso de Drive o Dropbox, abre Sweet Flow, conecta su
cuenta y elige esa carpeta (le aparece en «Compartido conmigo»). La app
reconoce su email en el registro del equipo y le aplica su rol.

Sin Drive ni Dropbox conectados (carpeta de este ordenador), invitar solo
apunta la invitación: la carpeta se comparte a mano desde el servicio.

## 5. Vista de invitado

Lo que pediste: si a alguien se le da acceso a una carpeta, ve solo lo que hay
dentro.

- **Con Drive (recomendado):** se le da *reader* solo a las carpetas de su
  alcance (p. ej. una producción). Al entrar, la app no ve la raíz del equipo,
  sino esas carpetas: se abre en **modo invitado**, con un dashboard que solo
  lista lo que tiene compartido (cada producción se reconoce por su
  `.sweetflow/production.json`).
- **La interfaz de invitado:** tablero y visor en solo lectura, sin Generar,
  Editar, papelera ni ajustes de la producción, y sin códigos ni rutas.
- **Comentar:** con solo lectura no puede escribir su registro. Opciones:
  1. Darle *writer* solo en `.sweetflow/log/invitado-<email>/` de esa
     producción (Drive lo permite en una subcarpeta). Sus comentarios entran
     como los de cualquiera.
  2. Sin comentarios en la primera versión (solo ver).
- **Ver solo algunas versiones** (p. ej. lo aprobado): los permisos van por
  carpeta o archivo, así que haría falta o compartir archivos sueltos (Drive)
  o copiar lo aprobado a una carpeta `Para-cliente/`. Mejor más adelante.
- **Sin cuenta de Drive o Dropbox:** no es posible sin alojar los archivos en
  un sitio público. Es la «vista previa para invitados sin acceso» de
  `ROADMAP.md` (enlace compartido de Dropbox, compartir de Magnific o página
  de revisión propia).

## 6. Límites (sin servidor)

- Los roles los respeta la app, pero alguien con permiso de escritura en la
  carpeta podría editar los registros a mano. Lo que no puede saltarse es el
  permiso del servicio (*reader* no escribe).
- La lista del equipo se ve en el registro; los emails son visibles para el
  equipo.
- Quitar a alguien: se quita su permiso en el servicio (la app lo hace con la
  API) y se apunta la baja. Lo que ya descargó, lo conserva.

## 7. Plan propuesto

1. **Identidad por Magnific** (perfil desde `account_profile`) y aviso si no
   coincide con la cuenta de la carpeta. Pequeño.
2. **Registro del equipo** en `packages/domain` (altas, roles, alcance, quién
   puede cambiarlos), con tests, y la pantalla Equipo leyendo de él.
3. **Invitar con Drive** (permisos por carpeta) y **con Dropbox** (miembros de
   la carpeta compartida); compartir el proyecto de Magnific si es de la
   organización.
4. **Roles en la interfaz** (qué ve y qué puede hacer cada uno).
5. **Modo invitado** con Drive: dashboard con lo compartido, solo lectura y,
   si se decide, comentarios en su subcarpeta.

## 8. Decisiones que necesito

1. ¿El invitado **comenta** o **solo ve** en la primera versión?
2. ¿Los invitados ven **todas las versiones** o solo lo **aprobado**?
3. ¿Damos prioridad a **Drive** para los invitados (permisos por subcarpeta) y
   dejamos Dropbox para el equipo interno?
4. ¿Los roles del espacio valen para todas las producciones, o se ajustan por
   producción (`ROADMAP.md`, «Permisos por producción»)?
