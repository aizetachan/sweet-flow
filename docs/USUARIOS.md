# Usuarios, invitaciones y vista de invitado

> Estado: **análisis con decisiones** (19 oct 2026). No hay nada implementado
> aún, salvo el perfil manual y la conexión de Magnific, Dropbox y Drive por
> persona. Relacionado: `ARCHITECTURE.md` §2.1 (primero local, sin servidor)
> y §4 (roles), `INTERFAZ.md` §1.1.

## Decisiones (19 oct 2026)

1. **Identidad = la cuenta de Magnific.** No hay otro registro: Magnific
   identifica a la persona (nombre, email, avatar) y Sweet Flow decide a qué
   tiene acceso. Que Magnific comparta o no proyectos entre organizaciones no
   importa.
2. **La cuenta de Drive/Dropbox puede ser otra**, aunque la persona sea la
   misma. No debe crear fricción: la cuenta de almacenamiento es solo cómo
   llega cada uno a la carpeta; nunca se compara con la de Magnific.
3. **El equipo se gestiona dentro y fuera de la producción:** se invita a una
   carpeta del dashboard (vale para lo que hay dentro) o a una producción.
4. **Roles por producción**, los pone quien invita: alguien puede trabajar en
   una carpeta y no en otra.
5. **Todo el equipo tiene que poder entrar a la carpeta** del almacenamiento
   (ahí está el trabajo).
6. **El invitado no entra al almacenamiento:** entra a Sweet Flow, en una
   **vista de invitado** fácil de navegar, sin generar ni crear nada. Ve lo
   que el equipo comparte con él (prácticamente todas las versiones), comenta
   sobre los planos y **valida**: muchas veces es el cliente, y su validación
   es la que permite aprobar.

## 1. Identidad

- Al conectar Magnific, `account_profile` da nombre, email y avatar. Esa es la
  persona en Sweet Flow; el perfil manual queda solo para quien no tiene
  Magnific (la demo).
- Clave de la persona: el **email de Magnific**, en minúsculas.
- La cuenta de Dropbox/Drive conectada se guarda aparte («cómo llego a la
  carpeta»), sin compararla.

## 2. Miembros, alcance y roles

- Un registro más dentro de la carpeta del equipo, como el del dashboard:
  `.sweetflow/team/<dispositivo>/<mes>.jsonl`. Cada entrada:
  `{ email de Magnific, nombre, dónde (carpeta o producción), rol }`.
- **Herencia:** lo que se da en una carpeta del dashboard vale para todo lo que
  hay dentro; en una producción se puede cambiar (subir, bajar o quitar).
- **Roles:** admin, supervisor, artista, lector e invitado. Quien invita elige
  el rol para esa carpeta o producción.
- Quien crea la carpeta del equipo es su primer admin. Solo admin (y
  supervisor en sus producciones, si se decide) cambia miembros; lo que
  escriba otro se ignora al combinar los registros (regla del dominio, con
  tests).
- Dónde se gestiona:
  - **Dashboard:** «Compartir» en una carpeta o producción (menú contextual).
  - **Producción:** la ventana Equipo (avatares de la cabecera), con
    «Invitar» y el rol de cada uno en esa producción.

## 3. Invitar al equipo (con acceso a la carpeta)

Quien invita escribe el **email de Magnific** de la persona, el rol y, si la
carpeta está en Dropbox o Drive, el **email de su cuenta de almacenamiento**
(por defecto, el mismo; se puede cambiar: decisión 2).

1. Se apunta en el registro de miembros.
2. Sweet Flow **comparte la carpeta** con el email de almacenamiento, por API:
   - **Drive:** `permissions.create` (*writer*) sobre la carpeta del equipo.
     Drive manda su aviso.
   - **Dropbox:** `sharing/add_folder_member` (*editor*), añadiendo el permiso
     `sharing.write` a la app.
   - Con una carpeta de este ordenador, se comparte a mano desde Dropbox o
     Drive; la app lo recuerda.
3. La persona abre Sweet Flow, conecta Magnific (así se la reconoce) y su
   Dropbox/Drive (así llega a la carpeta), y elige la carpeta compartida.

El acceso a la carpeta es a toda la carpeta del equipo: la separación por
producciones la hace Sweet Flow con los roles. Quien tiene la carpeta podría
abrir los archivos a mano; es el equipo, así que se acepta.

## 4. Vista de invitado (sin acceso al almacenamiento)

**Qué ve:** un dashboard con solo lo compartido con él; dentro, el tablero, el
visor con **las versiones** y sus comentarios. Sin Generar, Editar, papelera,
estructura ni ajustes. Sin códigos ni rutas.

**Qué hace:** comentar (con código de tiempo y punto en el fotograma, como el
equipo) y **validar** un plano o una versión. El equipo ve la validación en el
plano y en Actividad, y lo aprueba (o se aprueba solo: decisión pendiente).

**La consecuencia:** sin acceso a la carpeta, el invitado no puede leer los
archivos ni escribir sus comentarios en ningún sitio que el equipo lea. Hace
falta **una pieza en internet** que los dos alcancen. Es decir, un servidor
pequeño, que hoy el plan deja para la etapa C (`ARCHITECTURE.md` §2.1).

Propuesta (**espacio de revisión**), reutilizando el esqueleto de Firebase:

- **Entrar:** el invitado inicia sesión con Magnific. Una Function comprueba
  su token con Magnific (`account_profile`) y le da una sesión de Sweet Flow
  con su email. Nada de cuentas nuevas.
- **Publicar:** la app del equipo publica lo compartido: la estructura, las
  versiones y sus datos, y por cada archivo un **enlace** creado en Dropbox o
  Drive con la cuenta del equipo (Dropbox: enlace compartido; Drive: «cualquiera
  con el enlace», solo ese archivo). Los archivos siguen en Dropbox o Drive; no
  vuelve Cloud Storage. Se actualiza al haber versiones nuevas.
- **Volver:** comentarios y validaciones del invitado se guardan en
  Firestore; la app del equipo los recoge y los escribe en el registro de la
  producción como eventos del invitado. Así todo queda en la carpeta, como
  siempre.
- **Dónde lo ve el invitado:** en la web (la misma app en modo invitado), sin
  instalar nada. Es la «vista previa para invitados» de `ROADMAP.md`.

## 5. Plan propuesto

1. **Identidad por Magnific:** el perfil sale de `account_profile`; la cuenta
   de almacenamiento, aparte. Pequeño, sin servidor.
2. **Registro de miembros** en `packages/domain` (carpeta/producción, herencia,
   roles, quién puede cambiarlos), con tests. La ventana Equipo y «Compartir»
   en el dashboard leen de él.
3. **Invitar al equipo** y compartir la carpeta por API (Drive y Dropbox),
   con el email de almacenamiento aparte.
4. **Roles en la interfaz** (qué ve y qué hace cada uno en cada producción).
5. **Espacio de revisión para invitados** (Firebase): inicio de sesión con
   Magnific, publicar, comentar y validar, y la vuelta al registro.

Los pasos 1 a 4 funcionan sin servidor. El 5 lo necesita.

## 6. Decisiones que necesito

1. **¿Adelantamos un servidor pequeño solo para invitados** (paso 5)? Cambia
   la regla «sin servidor hasta la etapa C» (`ARCHITECTURE.md` §2.1).
2. **Archivos para el invitado:** ¿enlaces de Dropbox/Drive (no se copia nada,
   pero quien tenga el enlace ve ese archivo) o copias más ligeras (proxies)
   en un almacenamiento propio?
3. **Validar:** ¿la validación del invitado aprueba directamente, o avisa al
   equipo para que apruebe?
4. ¿El **supervisor** puede invitar en sus producciones, o solo el admin?
