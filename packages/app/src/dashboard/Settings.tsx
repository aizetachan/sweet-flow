/**
 * Settings, inside the dashboard: profile, storage (Dropbox), integrations
 * (Magnific) and about. Connections that are not built yet are shown with
 * what they will do and a "Próximamente" state, never as working buttons.
 */

import { useEffect, useState, type ReactNode } from "react";
import { IconBolt, IconBrandDropbox, IconCheck, IconBrandGoogleDrive, IconDeviceDesktop, IconFolder, IconFolderOpen, IconFolders, IconInfoCircle, IconPlugConnected, IconUser } from "@tabler/icons-react";
import { Avatar, Button, cx } from "@sweetflow/ui";
import type { LibraryState } from "../data/library";
import { openTeamFolder, storageStatus, switchToBrowserStorage } from "../data";
import * as magnific from "../integrations/magnific/auth";
import { callTool, type ToolResult } from "../integrations/magnific/mcp";
import { forgetLocalFolder, localFoldersSupported, pickLocalFolder, reconnectLocalFolder } from "../data/folder/browserFs";
import { useStore, type SettingsTab } from "../state/store";

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof IconUser }> = [
  { id: "profile", label: "Perfil", icon: IconUser },
  { id: "storage", label: "Almacenamiento", icon: IconFolders },
  { id: "integrations", label: "Integraciones", icon: IconPlugConnected },
  { id: "about", label: "Acerca de", icon: IconInfoCircle },
];

export function Settings({ lib }: { lib: LibraryState }) {
  const { settingsTab, set } = useStore();
  return (
    <div className="dash settings">
      <header className="dash__head">
        <h1 className="dash__title">Ajustes</h1>
      </header>
      <div className="settings__layout">
        <nav className="settings__nav">
          {TABS.map((t) => (
            <button key={t.id} className={cx("settings__tab", settingsTab === t.id && "settings__tab--on")} onClick={() => set({ settingsTab: t.id })}>
              <t.icon size={16} stroke={1.6} /> {t.label}
            </button>
          ))}
        </nav>
        <div className="settings__body">
          {settingsTab === "profile" ? <Profile lib={lib} /> : null}
          {settingsTab === "storage" ? <Storage lib={lib} /> : null}
          {settingsTab === "integrations" ? <Integrations /> : null}
          {settingsTab === "about" ? <About lib={lib} /> : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="sset">
      <h2>{title}</h2>
      {hint ? <p className="sf-muted sset__hint">{hint}</p> : null}
      {children}
    </section>
  );
}

function Profile({ lib }: { lib: LibraryState }) {
  const library = useStore((s) => s.library);
  const [name, setName] = useState(lib.me.displayName);
  const [email, setEmail] = useState(lib.me.email);
  useEffect(() => {
    setName(lib.me.displayName);
    setEmail(lib.me.email);
  }, [lib.me.displayName, lib.me.email]);
  const dirty = name.trim() !== lib.me.displayName || email.trim() !== lib.me.email;
  const save = () => dirty && library.setProfile({ displayName: name, email });

  return (
    <Section title="Perfil" hint="Tu nombre aparece en las producciones en las que trabajas: en los responsables, la actividad y el equipo.">
      <div className="sprofile">
        <Avatar name={name || lib.me.displayName} size={64} />
        <div className="sform">
          <label className="sfield">
            <span>Nombre</span>
            <input className="sf-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
          </label>
          <label className="sfield">
            <span>Email</span>
            <input className="sf-input" type="email" value={email} placeholder="tu@estudio.com" onChange={(e) => setEmail(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
          </label>
          {lib.mode === "demo" ? <p className="sf-faint sf-small">En la demo los cambios se pierden al recargar.</p> : null}
        </div>
      </div>
    </Section>
  );
}

function Storage({ lib }: { lib: LibraryState }) {
  return (
    <>
      <Section
        title="Carpeta del equipo"
        hint="Todo se guarda en una carpeta: el dashboard, cada producción y sus carpetas por códigos. Ahora puede ser una carpeta de este ordenador; después, una carpeta de Dropbox o de Google Drive conectada desde aquí."
      >
        {lib.mode === "local" ? <LocalFolder lib={lib} /> : (
          <div className="scard">
            <IconDeviceDesktop size={22} stroke={1.5} />
            <div className="scard__text">
              <strong>{lib.mode === "demo" ? "Demo en memoria" : "Firebase"}</strong>
              <span className="sf-muted">{lib.mode === "demo" ? "Se pierde al recargar. Para usar una carpeta, arranca la app con pnpm dev:local." : "Los datos están en Firebase."}</span>
            </div>
          </div>
        )}
      </Section>
      <Section title="En la nube" hint="Conectar el servicio del equipo: Sweet Flow lee y escribe en la carpeta compartida sin instalar nada más, y puede guardar además una copia en este ordenador.">
        <Connection icon={<IconBrandDropbox size={22} stroke={1.5} />} name="Dropbox" detail="Una carpeta compartida de Dropbox del equipo." />
        <Connection icon={<IconBrandGoogleDrive size={22} stroke={1.5} />} name="Google Drive" detail="Una unidad compartida (o carpeta compartida) de Google Drive." />
      </Section>
    </>
  );
}

/** A folder of this computer as the team folder (browser File System Access). */
function LocalFolder({ lib }: { lib: LibraryState }) {
  const status = storageStatus();
  const storageName = () => (storageStatus() as { name?: string }).name ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = localFoldersSupported();
  const setLibrary = useStore((s) => s.setLibrary);
  const [done, setDone] = useState<string | null>(null);
  const run = (f: () => Promise<string | null>) => async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setDone(await f());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // Switch in place: no reload, the dashboard follows.
  const switchToFolder = async () => {
    const lib = await openTeamFolder();
    if (!lib) throw new Error("No se ha podido abrir la carpeta.");
    setLibrary(lib);
    return `Listo: ahora todo se guarda en «${storageName()}».`;
  };
  const pick = run(async () => ((await pickLocalFolder()) ? switchToFolder() : null));
  const reconnect = run(async () => ((await reconnectLocalFolder()) ? switchToFolder() : null));
  const forget = run(async () => {
    await forgetLocalFolder();
    setLibrary(switchToBrowserStorage());
    return "Ahora se guarda en este navegador.";
  });
  const title = status.status === "folder" ? `Carpeta «${status.name}»` : status.status === "reconnect" ? `Carpeta «${status.name}» (sin permiso)` : "Este navegador";
  const detail =
    status.status === "folder"
      ? "En este ordenador. Si está dentro de Dropbox o Drive, su app la sincroniza con el equipo."
      : status.status === "reconnect"
        ? "El navegador pide permiso otra vez para abrirla. Mientras tanto ves lo guardado en este navegador."
        : "Solo en este navegador. Elige una carpeta para guardar ahí las producciones.";
  return (
    <>
      <div className="scard">
        {status.status === "browser" ? <IconDeviceDesktop size={22} stroke={1.5} /> : <IconFolder size={22} stroke={1.5} />}
        <div className="scard__text">
          <strong>{title}</strong>
          <span className="sf-muted">{detail}</span>
        </div>
        <span className="scard__spacer" />
        {!supported ? <span className="sbadge">Usa Chrome o Edge</span> : status.status === "reconnect" ? (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={reconnect}>Abrir «{status.name}»</Button>
            <Button size="sm" disabled={busy} onClick={pick}>Elegir otra</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant={status.status === "browser" ? "primary" : undefined} disabled={busy} onClick={pick}>
              <IconFolderOpen size={14} /> {busy ? "Abriendo…" : status.status === "folder" ? "Cambiar carpeta" : "Elegir carpeta"}
            </Button>
            {status.status === "folder" ? <Button size="sm" disabled={busy} onClick={forget}>Dejar de usarla</Button> : null}
          </>
        )}
      </div>
      {status.status === "browser" && lib.entries.length ? (
        <p className="sf-faint sf-small">Lo que ya tienes en este navegador no se copia a la carpeta: sigue aquí si dejas de usarla.</p>
      ) : null}
      {done ? <p className="sf-small sdone"><IconCheck size={12} /> {done}</p> : null}
      {error ? <p className="sf-small" style={{ color: "var(--bad)" }}>{error}</p> : null}
    </>
  );
}

function Integrations() {
  return (
    <Section title="Integraciones" hint="Cada persona conecta su propia cuenta: lo que genera gasta sus créditos, y el resultado lo ve todo el equipo.">
      <MagnificCard />
    </Section>
  );
}

/** Connect this person's Magnific account (OAuth in a popup) and show who and how many credits. */
function MagnificCard() {
  const [connected, setConnected] = useState(magnific.isConnected());
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => magnific.onConnectionChange(() => setConnected(magnific.isConnected())), []);
  useEffect(() => {
    if (!connected) return setWho(null);
    let alive = true;
    void Promise.all([callTool("account_profile"), callTool("account_balance")])
      .then(([profile, balance]) => alive && setWho(describeAccount(profile, balance)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [connected]);
  const connect = async () => {
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
  return (
    <>
      <div className="scard">
        <IconBolt size={22} stroke={1.5} />
        <div className="scard__text">
          <strong className="scard__name">
            Magnific
            {connected ? <span className="sok" title="Conectada" aria-label="Conectada"><IconCheck size={10} stroke={3} /></span> : null}
          </strong>
          <span className="sf-muted">{connected ? who ?? "Conectada. Comprobando la cuenta…" : "Generación de imágenes y vídeo con tu cuenta y tus créditos."}</span>
        </div>
        <span className="scard__spacer" />
        {connected ? <Button size="sm" onClick={() => magnific.disconnect()}>Desconectar</Button> : (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void connect()}>{busy ? "Esperando a Magnific…" : "Conectar"}</Button>
        )}
      </div>
      {error ? <p className="sf-small" style={{ color: "var(--bad)" }}>{error}</p> : null}
    </>
  );
}

function describeAccount(profile: ToolResult, balance: ToolResult): string {
  const p = (profile.data ?? {}) as { displayName?: string; name?: string; email?: string };
  const b = (balance.data ?? {}) as { credits?: { available?: number }; plan?: { productName?: string } };
  const name = p.displayName || p.name || p.email || "tu cuenta";
  const credits = b.credits?.available;
  return [`Conectada como ${name}`, b.plan?.productName, credits !== undefined ? `${credits.toLocaleString("es-ES")} créditos` : null].filter(Boolean).join(" · ");
}

/** An account or folder link that is not available yet. */
function Connection({ icon, name, detail }: { icon: ReactNode; name: string; detail: string }) {
  return (
    <div className="scard">
      {icon}
      <div className="scard__text">
        <strong>{name}</strong>
        <span className="sf-muted">{detail}</span>
      </div>
      <span className="scard__spacer" />
      <span className="sbadge">Próximamente</span>
      <Button size="sm" disabled title="Próximamente">Conectar</Button>
    </div>
  );
}

function About({ lib }: { lib: LibraryState }) {
  const version = window.sweetflow?.version;
  return (
    <Section title="Acerca de Sweet Flow">
      <dl className="sabout">
        <dt>Versión</dt>
        <dd>{version ? `${version} (escritorio)` : "Web (desarrollo)"}</dd>
        <dt>Datos</dt>
        <dd>{lib.storage.kind === "folder" ? `Carpeta · ${lib.storage.name}` : lib.mode === "demo" ? "Demo en memoria" : lib.mode === "local" ? "Este navegador" : "Firebase"}</dd>
      </dl>
    </Section>
  );
}
