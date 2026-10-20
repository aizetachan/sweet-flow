/**
 * First run (docs/INTERFAZ.md §1.0a): someone who hasn't connected Magnific
 * has no user yet, so no avatar or name; «Conectarse» stands in their place.
 * Until Magnific and the team folder are set, Inicio shows the two steps.
 */

import { useState } from "react";
import { IconBolt, IconCheck, IconFolder, IconLogin2 } from "@tabler/icons-react";
import { Button, cx } from "@sweetflow/ui";
import type { Member } from "@sweetflow/domain";
import { openTeamFolder } from "../data";
import { pickLocalFolder } from "../data/folder/browserFs";
import type { LibraryState } from "../data/library";
import * as magnific from "../integrations/magnific/auth";
import { useStore } from "../state/store";

/** No Magnific account behind this person yet (the demo has its pretend one). */
export const isGuest = (me: Pick<Member, "email">, mode: LibraryState["mode"]) => mode === "local" && !me.email;

/** Opens Magnific's sign-in; the identity follows once connected. */
export function useSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await magnific.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, signIn };
}

/** In the side menu, where the avatar goes once connected. */
export function SignInButton({ className }: { className?: string }) {
  const { busy, error, signIn } = useSignIn();
  return (
    <button className={cx("signin", className)} disabled={busy} title={error ?? "Entrar con tu cuenta de Magnific"} onClick={() => void signIn()}>
      <span className="signin__icon"><IconLogin2 size={16} stroke={1.7} /></span>
      <span className="signin__text">
        <span className="signin__label">{busy ? "Esperando a Magnific…" : "Conectarse"}</span>
        <span className={cx("signin__hint", error && "is-error")}>{error ?? "Con tu cuenta de Magnific"}</span>
      </span>
    </button>
  );
}

/** Inicio before anything is set: connect Magnific, then choose the team folder. */
export function FirstRun({ lib }: { lib: LibraryState }) {
  const setLibrary = useStore((s) => s.setLibrary);
  const { busy, error, signIn } = useSignIn();
  const [picking, setPicking] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const connected = !isGuest(lib.me, lib.mode);
  const folder = lib.storage.kind === "folder" ? lib.storage.name : null;
  if (lib.mode !== "local" || (connected && folder)) return null;

  const pick = async () => {
    setPicking(true);
    setFolderError(null);
    try {
      if (await pickLocalFolder()) {
        const next = await openTeamFolder();
        if (!next) throw new Error("No se ha podido abrir la carpeta.");
        setLibrary(next);
      }
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  };

  return (
    <section className="welcome">
      <h2 className="welcome__title">Bienvenido a Sweetflow</h2>
      <p className="sf-muted">Dos pasos para empezar a trabajar.</p>
      <ol className="welcome__steps">
        <li className={cx("welcome__step", connected && "is-done")}>
          <span className="welcome__num">{connected ? <IconCheck size={14} stroke={3} /> : 1}</span>
          <span className="welcome__text">
            <strong>Conéctate con Magnific</strong>
            <span className="sf-muted sf-small">
              {connected ? `Conectado como ${lib.me.displayName}.` : "Tu cuenta de Magnific es tu usuario: tu nombre para el equipo y tus créditos para generar."}
            </span>
            {error ? <span className="welcome__error sf-small">{error}</span> : null}
          </span>
          {connected ? null : (
            <Button variant="primary" disabled={busy} onClick={() => void signIn()}>
              <IconBolt size={14} /> {busy ? "Esperando a Magnific…" : "Conectarse"}
            </Button>
          )}
        </li>
        <li className={cx("welcome__step", folder && "is-done")}>
          <span className="welcome__num">{folder ? <IconCheck size={14} stroke={3} /> : 2}</span>
          <span className="welcome__text">
            <strong>Elige la carpeta del equipo</strong>
            <span className="sf-muted sf-small">
              {folder ? `Todo se guarda en «${folder}».` : "Donde se guarda todo: producciones, versiones y vídeos. Si está dentro de Dropbox o Drive, el equipo la comparte."}
            </span>
            {folderError ? <span className="welcome__error sf-small">{folderError}</span> : null}
          </span>
          {folder ? null : (
            <Button variant={connected ? "primary" : undefined} disabled={picking} onClick={() => void pick()}>
              <IconFolder size={14} /> {picking ? "Abriendo…" : "Elegir carpeta"}
            </Button>
          )}
        </li>
      </ol>
    </section>
  );
}
