# Sweet Flow — landing page

Proyecto independiente dentro del repositorio: tiene su propio workspace de
pnpm, su propio `firebase.json` y su propio proyecto de Firebase. Nada de esta
carpeta entra en el `typecheck`, los tests ni el build de la app.

```
landing/
  index.html, src/        la página (Vite + TypeScript, sin framework)
  public/                 estáticos (favicon)
  functions/              Cloud Function `api`: lista de espera y contacto
  firebase.json           Hosting (+ rewrite /api/** → función) · Firestore · Functions
  firestore.rules         todo cerrado: solo escribe la función (Admin SDK)
```

## Qué hace

- **Lista de espera** (`POST /api/waitlist`, `{ name, email }`): guarda
  `waitlist/{correo}` en Firestore. Si el correo ya estaba, actualiza el nombre
  y responde `already: true`.
- **Habla con nosotros** (`POST /api/contact`, `{ name, email, message }`):
  guarda `contacts/{id}` y envía el mensaje por correo (SMTP) a `CONTACT_TO`,
  con *Reply-To* al remitente. Si el correo falla, el mensaje queda en Firestore
  con `delivered: false` y el error en los logs.
- Las dos modales son `<dialog>` nativos (`src/modals.ts`); los formularios
  validan en el navegador, envían a `/api` y muestran el estado de éxito
  (`src/forms.ts`). Un campo oculto `website` hace de *honeypot* contra bots.

## Desarrollo

```bash
cd landing
pnpm install
pnpm dev          # http://localhost:5174 — /api va al emulador de Functions
pnpm emulators    # en otra terminal: Functions + Firestore (necesita Java)
pnpm typecheck
pnpm test         # validación de los formularios (node:test)
pnpm build        # dist/
```

Para que el emulador tenga los parámetros, copia `functions/.env.example` a
`functions/.env` y rellénalo; la contraseña SMTP en local va en
`functions/.secret.local` (`SMTP_PASS=...`). Los dos ficheros están ignorados
por git.

## Firebase: primera puesta en marcha

Es un proyecto de Firebase distinto al de la app. El id por defecto está en
`.firebaserc` (`sweetflow-landing`); si Google no lo deja libre, cámbialo ahí
y en `vite.config.ts` (URL del emulador).

```bash
firebase login --reauth
firebase projects:create sweetflow-landing --display-name "Sweet Flow Landing"
firebase use sweetflow-landing
# Firestore en Europa (una sola vez)
firebase firestore:databases:create "(default)" --location europe-west1
```

En la consola de Firebase hay que pasar el proyecto al plan **Blaze** (las
Functions lo exigen; el uso de esta landing cabe en la franja gratuita).

Parámetros y secreto de la función (correo de destino y SMTP):

```bash
cp functions/.env.example functions/.env   # editar CONTACT_TO, CONTACT_FROM, SMTP_*
firebase functions:secrets:set SMTP_PASS   # contraseña (con Gmail: una "contraseña de aplicación")
```

Despliegue:

```bash
pnpm deploy            # build + Hosting + Functions + reglas de Firestore
pnpm deploy:hosting    # solo la página
```

## Dominio

Hosting sirve en `sweetflow-landing.web.app`. Un dominio propio se añade en la
consola (Hosting › Añadir dominio personalizado) y solo pide dos registros DNS.
