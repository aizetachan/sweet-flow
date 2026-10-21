# Sweet Flow

Producción audiovisual con IA para piezas largas (series, películas) y equipos
amplios. La pantalla principal es la producción, organizada en carpetas
(Secuencia › Escena › Plano, configurable). Se genera, se corta, se reparte y se
revisa directamente sobre las cards, y todo se replica en la carpeta del
escritorio de cada miembro.

- Arquitectura y decisiones: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Estado y siguientes pasos: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Cómo desarrollar: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

## Desarrollo

```bash
pnpm install
pnpm dev        # UI en http://localhost:5173 (datos de demostración)
pnpm test       # tests del dominio
pnpm typecheck
```

## Estructura

```
packages/domain   modelo y reglas puras (códigos, nombres de carpeta, cortes, roles)
packages/ui       design system (tokens + componentes)
packages/app      la app React (renderer de escritorio)
apps/desktop      shell Electron (macOS + Windows)
landing/          landing page (Firebase Hosting); proyecto aparte, fuera del workspace
```

La UI usa hoy `MockSource`, una implementación en memoria del contrato
`DataSource` (`packages/app/src/data/source.ts`). La implementación con Firebase
cumplirá el mismo contrato, así que las pantallas no cambian.
