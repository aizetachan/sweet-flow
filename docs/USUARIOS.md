# Usuarios, equipo y revisión del cliente

> Estado: **análisis con decisiones** (19 oct 2026). No hay nada implementado
> aún, salvo el perfil manual y la conexión de Magnific, Dropbox y Drive por
> persona. Relacionado: `ARCHITECTURE.md` §2.1 (primero local, sin servidor)
> y §4 (roles), `INTERFAZ.md` §1.1.

## Decisiones (19 oct 2026)

1. **Identidad del equipo = la cuenta de Magnific.** Magnific dice quién es
   cada persona; Sweet Flow decide a qué tiene acceso. Si Magnific comparte o
   no proyectos entre organizaciones no importa.
2. **La cuenta de Drive/Dropbox puede ser otra** aunque la persona sea la
   misma, sin fricción: nunca se compara con la de Magnific.
3. **Una sola carpeta para todo el equipo, igual en Sweet Flow y en el
   almacenamiento.** Lo que uno hace en Sweet Flow (crear, renombrar, mover,
   generar) cambia la carpeta de Dropbox o Drive, y todos lo ven igual en los
   dos sitios. Es como funciona ya hoy: Sweet Flow escribe en la carpeta
   compartida y lee lo que escriben los demás.
4. **Quién invita:** el propietario (quien creó el equipo) y los miembros del
   equipo. El propietario decide si los miembros pueden invitar; por defecto,
   sí. No hay «supervisor».
5. **Acceso por producción:** quien invita elige a qué carpetas o producciones
   entra cada miembro.
6. **El cliente (invitado) no tiene acceso a Dropbox ni Drive**, ni necesita
   cuenta de Magnific. Solo ve una pantalla con el vídeo o el contenido que se
   le comparte, comenta y valida. Ve prácticamente todas las versiones: suele
   ser quien da el visto bueno final.
7. **La revisión del cliente se deja para cuando esté montado lo demás**,
   buscando un servidor mínimo que apenas consuma recursos (§5).

## 1. Identidad del equipo

- Al conectar Magnific, `account_profile` da nombre, email y avatar. Esa es la
  persona en Sweet Flow; el perfil manual queda para quien no tiene Magnific
  (la demo).
- Clave de la persona: el **email de Magnific**, en minúsculas.
- La cuenta de Dropbox/Drive se guarda aparte («cómo llego a la carpeta»).

## 2. El equipo y la carpeta compartida

- Toda la gente del equipo trabaja sobre **la misma carpeta** de Dropbox o
  Drive. Para entrar, cada miembro necesita que esa carpeta esté compartida con
  su cuenta de almacenamiento: es una vez, al entrar en el equipo. Sweet Flow
  puede hacerlo al invitar (Drive: `permissions.create`; Dropbox:
  `sharing/add_folder_member`), con el email de almacenamiento que se indique
  (por defecto, el mismo).
- A partir de ahí no se comparte nada más: todo lo que se crea en Sweet Flow
  aparece en la carpeta y todos lo tienen al día.
- **Miembros y roles:** un registro dentro de la carpeta,
  `.sweetflow/team/<dispositivo>/<mes>.jsonl`, con
  `{ email de Magnific, nombre, rol, carpetas o producciones }`.
  - **Propietario:** quien crea el equipo. Gestiona a todos y decide si los
    miembros pueden invitar («Los miembros pueden invitar», activado por
    defecto).
  - **Miembro:** trabaja en las carpetas o producciones que le dan.
  - **Invitado:** el cliente (§4); no está en la carpeta.
- Dónde se gestiona: «Compartir» en una carpeta o producción del dashboard, y
  la ventana Equipo dentro de la producción.

**A confirmar:** como la carpeta es la misma para todos, en Dropbox o Drive
cada miembro ve todas las producciones aunque en Sweet Flow solo tenga acceso a
algunas. ¿En Sweet Flow ocultamos las que no son suyas, o las ve y solo puede
trabajar en las suyas?

## 3. Cómo lo hace Frame.io (referencia)

- El equipo crea un **enlace para compartir** (*Share*) con lo que quiere
  enseñar: un archivo, varios o una carpeta.
- **El cliente no necesita cuenta.** Abre el enlace en el navegador y ve el
  contenido. Al dejar su **primer comentario**, se le pide **nombre y email**,
  que solo duran esa sesión.
- **Ajustes del enlace:** público o seguro (solo personas añadidas; Enterprise),
  contraseña, fecha de caducidad, permitir o no comentarios y descargas, y ver
  todas las versiones o solo la última.
- **Aprobación:** en la versión anterior, el revisor marcaba un estado
  (Aprobado, En curso, Necesita revisión) y el equipo recibía un aviso.
- **Avisos:** email al cliente cuando le comparten algo y cuando le responden.
- Vistas: cuadrícula, lista o carrete.

## 4. La revisión del cliente en Sweet Flow (propuesta)

Lo mismo que Frame.io, con los pasos mínimos:

1. **Compartir para revisión** en un plano, una escena o una secuencia: Sweet
   Flow crea un enlace. Opciones: contraseña, caducidad, permitir descargar,
   todas las versiones o solo la elegida.
2. **El cliente abre el enlace**: ve los planos en orden, el visor con las
   versiones y los comentarios. Sin cuenta, sin instalar nada.
3. **Comenta** (con código de tiempo y punto en el fotograma) y **valida**.
   La primera vez escribe su nombre (y su email, si quiere avisos); se recuerda
   en su navegador.
4. **En Sweet Flow**, los comentarios entran en Revisión con su nombre y la
   validación se ve en el plano y en Actividad. El equipo aprueba (o se aprueba
   solo: a decidir).
5. El cliente **nunca ve** la carpeta del equipo, ni rutas, ni códigos.

## 5. El servidor mínimo (para cuando toque)

El cliente no puede leer la carpeta del equipo, así que hace falta algo en
internet que guarde lo compartido y sus comentarios. Opciones de bajo coste:

| Opción | Qué es | Coste aproximado |
| --- | --- | --- |
| **A. Cloudflare** (Workers + R2 + D1/KV) | Una función pequeña sirve la página de revisión y guarda comentarios; R2 guarda copias ligeras de los vídeos (proxies) | Plan gratuito amplio para este uso; R2 no cobra la salida de datos. Verificar límites al decidir |
| **B. Firebase** (ya hay esqueleto) | Hosting + Firestore para comentarios; Functions para crear enlaces | Firestore y Hosting tienen capa gratuita; las Functions piden el plan de pago por uso |
| **C. Enlaces de Dropbox/Drive + almacén de comentarios** | Sin copiar vídeos: cada versión compartida usa un enlace del servicio; solo los comentarios van al servidor | Lo más barato, pero el vídeo vive en un enlace público del servicio y Drive no sirve bien vídeo en una página |

Recomendación inicial: **A o C con Dropbox**. Se suben (o enlazan) solo las
versiones que se comparten, en calidad de revisión; los comentarios y
validaciones se guardan en una base pequeña, y la app del equipo los recoge y
los escribe en el registro de la producción. El enlace lleva un identificador
imposible de adivinar; con contraseña y caducidad opcionales.

## 6. Plan

1. **Identidad por Magnific** y cuenta de almacenamiento aparte. Sin servidor.
2. **Registro de miembros** en `packages/domain` (propietario, miembros,
   acceso por carpeta o producción, «los miembros pueden invitar»), con tests.
3. **Invitar al equipo:** apuntar al miembro y compartirle la carpeta del
   equipo por API (una vez).
4. **Acceso en la interfaz** según el registro.
5. **Más adelante: revisión del cliente** (§4 y §5).

## 7. Decisiones pendientes

1. ¿Las producciones sin acceso se **ocultan** en Sweet Flow o se ven sin
   poder trabajar en ellas? (§2)
2. La validación del cliente: ¿**aprueba** directamente o **avisa** al equipo?
3. Para la revisión del cliente: ¿opción A, B o C? (§5, cuando toque)

## Fuentes (Frame.io)

- [Shares in Frame.io (V4)](https://help.frame.io/en/articles/9105232-shares-in-frame-io)
- [Sharing your files as a review page](https://help.frame.io/en/articles/414306-sharing-your-files-as-a-review-page)
- [Review links explained for clients](https://help.frame.io/en/articles/1161479-review-links-explained-for-clients)
