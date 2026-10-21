# Sweetflow — landing page

Proyecto independiente dentro del repositorio: tiene su propio workspace de
pnpm, su propio `firebase.json` y su propio proyecto de Firebase. Nada de esta
carpeta entra en el `typecheck`, los tests ni el build de la app.

```
landing/
  index.html, src/        la página (Vite + TypeScript, sin framework)
  src/styles.css          estilos a partir del diseño de Figma
  public/img/             capturas, miniaturas e iconos exportados de Figma
  firebase.json           Hosting + reglas de Firestore
  firestore.rules         solo se puede CREAR en waitlist y contacts; nada más
```

Diseño: [Figma › Sweetflow — Landing](https://www.figma.com/design/McLLpbko3e3GbTQpLAex10/Untitled?node-id=3-2).

## Qué hace

Plan **Spark** (gratis): no hay Cloud Functions ni correo. Los formularios
escriben directamente en Firestore y las entradas se leen en la consola de
Firebase (Firestore Database › Datos).

- **Lista de espera** (botones «Waitlist», «Probar»): guarda
  `waitlist/{correo}` con `name`, `email`, `createdAt`, `source`. Si el correo
  ya estaba, las reglas deniegan la escritura y la modal responde «ya estabas
  apuntado».
- **Habla con nosotros** (plan Productora, CTA, pie «Contacto»): guarda
  `contacts/{id}` con `name`, `email`, `message`, `createdAt`, `source`.
- Las reglas de Firestore (`firestore.rules`) son la seguridad: solo permiten
  crear documentos con exactamente esos campos y tamaños, y nadie puede leer,
  modificar ni borrar desde fuera. Un campo oculto `website` hace de
  *honeypot* contra bots.
- Las modales son `<dialog>` nativos (`src/modals.ts`); la validación es la
  misma en el navegador (`src/validate.ts`, con tests) y en las reglas.

## Desarrollo

```bash
cd landing
pnpm install
cp .env.example .env   # datos de la app web de Firebase (ver abajo)
pnpm dev               # http://localhost:5174
pnpm typecheck
pnpm test              # validación de los formularios (node:test, Node ≥ 22.18)
pnpm build             # dist/
```

Sin `.env` la página funciona igual; al enviar un formulario avisa de que
«aún no está conectado».

## Firebase: primera puesta en marcha

Es un proyecto de Firebase distinto al de la app. El id por defecto está en
`.firebaserc` (`sweetflow-landing`); si Google no lo deja libre, cámbialo ahí
y en `.env`.

```bash
firebase login --reauth
firebase projects:create sweetflow-landing --display-name "Sweetflow Landing"
firebase use sweetflow-landing
firebase firestore:databases:create "(default)" --location europe-west1
firebase apps:create web landing          # imprime apiKey, appId…
firebase apps:sdkconfig web               # los mismos datos, para copiarlos a .env
```

Rellena `.env` con `apiKey`, `authDomain`, `projectId` y `appId` (son
identificadores públicos, no secretos). Después:

```bash
pnpm deploy            # build + Hosting + reglas de Firestore
pnpm deploy:hosting    # solo la página
pnpm deploy:rules      # solo las reglas
```

Hosting sirve en `sweetflow-landing.web.app`. Un dominio propio se añade en la
consola (Hosting › Añadir dominio personalizado) y solo pide dos registros DNS.

## Leer las entradas

Consola de Firebase › Firestore Database › colecciones `waitlist` y
`contacts`. Para exportarlas: `firebase firestore:export` o, más simple,
copiar desde la consola.
