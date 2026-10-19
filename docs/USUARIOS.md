# Usuarios, equipo y revisión del cliente

> Estado (19 oct 2026): **hechos los pasos 1 a 4 del plan** (§6): identidad
> por Magnific, registro del equipo, invitar compartiendo las carpetas y acceso
> en la interfaz. Compartir en Dropbox y Drive está sin probar con cuentas
> reales (se prueba con la app de escritorio). La revisión del cliente (§4–5)
> sigue aparcada. Relacionado: `ARCHITECTURE.md` §2.1 (primero local, sin servidor)
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
5. **Acceso por carpeta, igual en Sweet Flow y en el almacenamiento:** quien
   invita elige a qué carpetas o producciones entra cada miembro, y en
   Dropbox o Drive ese miembro **solo tiene esas carpetas**. No ve el resto ni
   en Sweet Flow ni en el almacenamiento.
6. **El cliente (invitado) no tiene acceso a Dropbox ni Drive**, ni necesita
   cuenta de Magnific. Solo ve una pantalla con el vídeo o el contenido que se
   le comparte, comenta y valida. Ve prácticamente todas las versiones: suele
   ser quien da el visto bueno final.
7. **La revisión del cliente se deja para cuando esté montado lo demás**,
   buscando un servidor mínimo que apenas consuma recursos (§5).
8. **Los vídeos no se copian ni se duplican:** el cliente ve los mismos
   archivos que el equipo, en una pantalla como la de producción pero solo
   para comentar. Lo único que se guarda aparte es quién está invitado y sus
   comentarios.
9. **Tres formas de entrar el cliente**, a elegir al compartir:
   - **Por invitación:** el equipo escribe su correo y le llega una
     invitación; solo entra quien la recibe (lo más seguro, para empresas).
   - **Enlace con nombre:** quien tenga el enlace entra y comenta poniendo su
     nombre.
   - **Enlace con nombre y correo:** igual, pero deja también su correo.
10. **Validar es un comentario:** el cliente marca «Validado» (su visto
    bueno), al equipo le llega el aviso como cualquier comentario, y el equipo
    decide y aprueba. La validación del cliente no aprueba nada por sí sola.

## 1. Identidad del equipo

- Al conectar Magnific, `account_profile` da nombre, email y avatar. Esa es la
  persona en Sweet Flow; el perfil manual queda para quien no tiene Magnific
  (la demo).
- Clave de la persona: el **email de Magnific**, en minúsculas.
- La cuenta de Dropbox/Drive se guarda aparte («cómo llego a la carpeta»).

## 2. El equipo y la carpeta compartida

- El equipo trabaja sobre la carpeta del equipo de Dropbox o Drive, y Sweet
  Flow y el almacenamiento muestran **lo mismo** a cada persona.
- **Invitar a una carpeta o producción la comparte en el almacenamiento**
  con la cuenta de esa persona (Drive: `permissions.create`; Dropbox:
  `sharing/add_folder_member`), con el email de almacenamiento que se indique
  (por defecto, el mismo). Quien tiene una sola carpeta solo ve esa carpeta,
  en Sweet Flow y en Dropbox o Drive. Quitarle el acceso lo quita en los dos.
- Dentro de lo compartido, todo lo que se crea en Sweet Flow aparece en la
  carpeta y todos los que la tienen lo ven al día.
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

**Lo que esto pide por dentro:**
- **El dashboard por carpeta compartida.** Hoy el dashboard es un registro en
  la raíz (`.sweetflow/library/`), que quien solo tiene una carpeta no puede
  leer. Cada carpeta compartida tiene que poder montarse sola: su propio
  registro del dashboard (lo que hay dentro), y quien la recibe la ve como
  raíz de su dashboard (o varias, si le comparten varias).
- **Dropbox no deja compartir una carpeta dentro de otra ya compartida** con
  otras personas (en cuentas normales). Así que la carpeta del equipo no se
  comparte entera: se comparte cada carpeta o producción con quien toque. Si
  alguien necesita todo, se le comparten todas, o se usa una carpeta de equipo
  de Dropbox Business. Drive sí permite permisos en carpetas anidadas.
  Comprobarlo con cuentas reales al montar la app de escritorio.
- **Permisos de la app:** Dropbox necesita además `sharing.read` y
  `sharing.write`.

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

1. **Compartir para revisión** en un plano, una escena o una secuencia, con
   una de las tres formas de entrar (decisión 9). Opciones: caducidad,
   permitir descargar, todas las versiones o solo la elegida.
2. **El cliente entra** (por su invitación o por el enlace): ve los planos en
   orden, el visor con las versiones y los comentarios, como en la pantalla de
   producción pero sin poder editar. Sin cuenta, sin instalar nada.
3. **Comenta** (con código de tiempo y punto en el fotograma) y puede marcar
   **«Validado»**, que es un comentario más. Su nombre (y correo) se recuerda
   en su navegador.
4. **En Sweet Flow**, sus comentarios entran en Revisión con su nombre y
   **avisan al equipo** como cualquier comentario; el «Validado» se ve en el
   plano. El equipo decide y aprueba.
5. El cliente **nunca ve** la carpeta del equipo, ni rutas, ni códigos.

## 5. El servidor mínimo (para cuando toque)

El cliente no tiene la carpeta del equipo, así que hace falta algo pequeño en
internet. **No guarda vídeos**, solo:
- qué se ha compartido (qué planos y versiones, con qué forma de entrar),
- quién está invitado (correo, nombre) y las invitaciones enviadas,
- los comentarios y «Validado» del cliente, hasta que la app del equipo los
  recoge y los escribe en el registro de la producción.

**Cómo ve el vídeo sin copiarlo:** el archivo sigue en Dropbox o Drive; al
compartir, la app del equipo crea un **enlace de ese archivo** en el servicio
(Dropbox: enlace compartido, que se puede reproducir en la página; Drive:
«cualquiera con el enlace» para ese archivo y lectura por la API con una clave
pública). La página de revisión reproduce ese enlace. El servidor nunca tiene
la cuenta del equipo, y el enlace solo lo conoce la página de revisión.
Dropbox va mejor para vídeo; en Drive hay que comprobar que reproduce bien
archivos grandes.

**Correos de invitación:** hace falta un servicio de envío (con capa gratuita
suficiente al principio).

| Opción | Qué es | Coste aproximado |
| --- | --- | --- |
| **A. Cloudflare** (Workers + D1/KV) | Una función pequeña sirve la página de revisión y guarda invitados y comentarios | Plan gratuito amplio para este uso. Verificar límites al decidir |
| **B. Firebase** (ya hay esqueleto) | Hosting + Firestore para invitados y comentarios; Functions para las invitaciones | Firestore y Hosting tienen capa gratuita; las Functions piden el plan de pago por uso |

Recomendación inicial: **A** (lo más ligero), con los vídeos en enlaces de
Dropbox.

## 6. Plan

1. **Identidad por Magnific** y cuenta de almacenamiento aparte. Sin servidor.
2. **Registro de miembros** en `packages/domain` (propietario, miembros,
   acceso por carpeta o producción, «los miembros pueden invitar»), con tests.
3. **Invitar al equipo:** apuntar al miembro y compartirle en Dropbox o Drive
   las carpetas o producciones que se le dan; quitar el acceso, igual.
   Dashboard montable desde cada carpeta compartida.
4. **Acceso en la interfaz** según el registro.
5. **Más adelante: revisión del cliente** (§4 y §5).

## 6.1 Cómo quedó hecho

- **Identidad:** `integrations/magnific/identity.ts`. El id de la persona sale
  de su email de Magnific (`u_` + hash), el mismo en cualquier ordenador. Quien
  ya trabajaba con el id de su navegador aparece una vez más en las
  producciones antiguas (con el mismo nombre).
- **Reglas del equipo:** `packages/domain/src/team.ts` (`foldTeam`, con tests):
  el primero que reclama la carpeta es propietario; invitan el propietario y,
  si él lo permite, los miembros, a lo que tienen ellos; quita o cambia el
  propietario o quien invitó. Un evento sin derecho se ignora.
- **En la carpeta:** el equipo en `.sweetflow/team/`; cada carpeta o
  producción compartida por separado guarda `.sweetflow/share.json` y su copia
  de los registros del dashboard y del equipo (`data/folder/folderLog.ts`). Cada
  cambio se escribe en la raíz y en las carpetas compartidas que lo contienen.
  Quien abre una carpeta compartida la ve arriba de su dashboard, con lo de
  dentro. El equipo se copia entero a cada carpeta compartida (sus miembros ven
  quién está en el equipo).
- **Compartir en el servicio:** `share`/`unshare` de `FolderFs` (Dropbox:
  carpeta compartida + miembro editor; Drive: permiso de edición). Con una
  carpeta de este ordenador, se avisa de compartirla a mano.
- **Interfaz:** «Equipo» en el menú del dashboard, «Compartir con alguien del
  equipo…» en el menú de carpetas y producciones, y la ventana Equipo de la
  producción con «Invitar a esta producción». La demo tiene un equipo de
  ejemplo en memoria.

## 6.2 Compartir con el cliente: lo que ya está (19 oct 2026)

El lado del equipo, sin servidor: **Compartir** en la producción (cómo entra
el cliente, sus invitados) y **Mostrar al cliente** en el menú de los planos y
grupos. Se guarda en el registro de la producción (`client.entry`,
`client.guest.added/removed`, `forClient` en el plano). Falta la página del
cliente (§4–5): el enlace y los correos de invitación salen como
«Próximamente».

## 7. Decisiones pendientes

1. Para la revisión del cliente: ¿opción A o B? (§5, cuando toque)

## Fuentes (Frame.io)

- [Shares in Frame.io (V4)](https://help.frame.io/en/articles/9105232-shares-in-frame-io)
- [Sharing your files as a review page](https://help.frame.io/en/articles/414306-sharing-your-files-as-a-review-page)
- [Review links explained for clients](https://help.frame.io/en/articles/1161479-review-links-explained-for-clients)
