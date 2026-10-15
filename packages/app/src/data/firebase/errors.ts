/** Thrown by DataSource intents the Firebase backend doesn't support yet. */
export class NotImplemented extends Error {
  constructor(what: string, phase: string) {
    super(`${what}: todavía no está disponible con Firebase (${phase}).`);
    this.name = "NotImplemented";
  }
}
