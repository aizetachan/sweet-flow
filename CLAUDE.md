# Sweet Flow — notas para Claude

Herramienta de producción audiovisual con IA para piezas largas. Lee primero:

- `docs/ARCHITECTURE.md`: arquitectura y decisiones acordadas. No contradecirlas sin consultar.
- `docs/ROADMAP.md`: estado actual, decisiones pendientes y siguientes fases.
- `docs/DEVELOPMENT.md`: cómo arrancar, emuladores e instaladores.
- `docs/INTERFAZ.md`: definición de la interfaz (pantallas, recorrido, decisiones de UX). Se define antes de implementar.

Reglas de trabajo:

- **Idioma:** la UI y la documentación van en español; el código y sus comentarios, en inglés.
- **Dominio:** las reglas de dominio (códigos, nombres de carpeta, numeración, cortes, roles) viven en `packages/domain`. Son puras y con tests. No dupliques esa lógica en la app ni en las Functions.
- **Datos:** la UI solo habla con `DataSource` (`packages/app/src/data/source.ts`).
  - Cualquier intención nueva se añade al contrato y a todas sus implementaciones (`MockSource`, `LocalSource` cuando exista, `FirebaseSource`).
- **Almacenamiento:** primero local, sobre una carpeta compartida de Dropbox con registro de eventos por dispositivo (`docs/ARCHITECTURE.md` §2.1 y §5). El tiempo real (Firebase) queda para más adelante: no añadas dependencias nuevas de Firebase en la ruta local.
  - `MockSource` es la fuente por defecto: la demo debe seguir funcionando sin configuración.
- **Nombres en disco:** los nombres de carpeta en disco salen siempre de `folderName()`.
- **Comprobaciones:** antes de hacer commit, ejecuta `pnpm -r typecheck`, `pnpm test` y `pnpm --filter @sweetflow/app build`.
- **Landing (`landing/`):** proyecto aparte, con su propio workspace de pnpm y su propio proyecto de Firebase (Hosting + Firestore en plan Spark, sin Functions). No forma parte del monorepo: ni comparte dependencias ni entra en sus comprobaciones. Sus comandos se ejecutan desde `landing/` (ver `landing/README.md`).
