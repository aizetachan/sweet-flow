/**
 * Settings, inside the dashboard: profile, storage (Dropbox), integrations
 * (Magnific) and about. Connections that are not built yet are shown with
 * what they will do and a "Próximamente" state, never as working buttons.
 */

import { useEffect, useState, type ReactNode } from "react";
import { IconPalette, IconBolt, IconBrandDropbox, IconCheck, IconCpu, IconRefresh, IconBrandGoogleDrive, IconDeviceDesktop, IconFolder, IconFolderOpen, IconFolders, IconInfoCircle, IconPlugConnected, IconUser } from "@tabler/icons-react";
import { Avatar, Button, cx, Modal } from "@sweetflow/ui";
import type { LibraryState } from "../data/library";
import { forgetCloudFolder, openCloudFolder, openTeamFolder, rememberedCloudFolder, storageStatus, switchToBrowserStorage, type CloudFolder, type StorageStatus } from "../data";
import { cloudConfigured, cloudName, connectCloud, disconnectCloud, isCloudConnected, onCloudChange, type CloudProvider } from "../integrations/oauth";
import type { DrivePlace } from "../data/folder/driveFs";
import * as magnific from "../integrations/magnific/auth";
import { callTool, type ToolResult } from "../integrations/magnific/mcp";
import { forgetLocalFolder, localFoldersSupported, pickLocalFolder, reconnectLocalFolder } from "../data/folder/browserFs";
import { useStore, type SettingsTab } from "../state/store";
import { allModelsFor, catalogReadAt, isShown, resetShown, setShown, useModelsVersion, type GenKind, type ModelSpec } from "../data/models";
import { refreshCatalog } from "../integrations/magnific/catalog";
import { readIdentity } from "../integrations/magnific/identity";
import { Appearance } from "./Appearance";

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof IconUser }> = [
  { id: "profile", label: "Perfil", icon: IconUser },
  { id: "appearance", label: "Apariencia", icon: IconPalette },
  { id: "storage", label: "Almacenamiento", icon: IconFolders },
  { id: "integrations", label: "Integraciones", icon: IconPlugConnected },
  { id: "models", label: "Modelos", icon: IconCpu },
  { id: "about", label: "Acerca de", icon: IconInfoCircle },
];

export function Settings({ lib }: { lib: LibraryState }) {
  const { settingsTab, set } = useStore();
  return (
    <div className="dash settings">
      <header className="dash__head">
        <h1 className="dash__title">Ajustes</h1>
      </header>
      <div className={cx("settings__layout", settingsTab === "models" && "settings__layout--wide")}>
        <nav className="settings__nav">
          {TABS.map((t) => (
            <button key={t.id} className={cx("settings__tab", settingsTab === t.id && "settings__tab--on")} onClick={() => set({ settingsTab: t.id })}>
              <t.icon size={16} stroke={1.6} /> {t.label}
            </button>
          ))}
        </nav>
        <div className="settings__body">
          {settingsTab === "profile" ? <Profile lib={lib} /> : null}
          {settingsTab === "appearance" ? <Appearance lib={lib} /> : null}
          {settingsTab === "storage" ? <Storage lib={lib} /> : null}
          {settingsTab === "integrations" ? <Integrations /> : null}
          {settingsTab === "models" ? <ModelsSettings /> : null}
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

export function Profile({ lib }: { lib: LibraryState }) {
  const library = useStore((s) => s.library);
  const [identity, setIdentity] = useState(readIdentity);
  const [name, setName] = useState(lib.me.displayName);
  const [email, setEmail] = useState(lib.me.email);
  useEffect(() => {
    setName(lib.me.displayName);
    setEmail(lib.me.email);
    setIdentity(readIdentity());
  }, [lib.me.displayName, lib.me.email]);
  const dirty = name.trim() !== lib.me.displayName || email.trim() !== lib.me.email;
  const save = () => dirty && library.setProfile({ displayName: name, email });

  // With Magnific connected, the person is their Magnific account (docs/USUARIOS.md §1).
  if (identity && lib.mode !== "demo") {
    return (
      <Section title="Perfil" hint="Tu cuenta de Magnific es quien eres en Sweetflow: con ella te reconoce el equipo en cualquier ordenador. Tu cuenta de Dropbox o Drive puede ser otra.">
        <div className="sprofile">
          <Avatar name={identity.name} size={64} src={identity.avatarUrl} />
          <div className="sform">
            <div className="sfield"><span>Nombre</span><div className="sprofile__value">{identity.name}</div></div>
            <div className="sfield"><span>Email</span><div className="sprofile__value">{identity.email}</div></div>
            <p className="sf-faint sf-small">Se cambian en tu cuenta de Magnific.</p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Perfil" hint="Tu nombre aparece en las producciones en las que trabajas. Al conectar Magnific (Integraciones), tu cuenta de Magnific pasa a ser tu identidad en Sweetflow.">
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
        hint="Todo se guarda en una carpeta: el dashboard, cada producción y sus carpetas por códigos. Puede ser una carpeta de este ordenador o una carpeta de Dropbox o de Google Drive conectada desde aquí (abajo)."
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
      <Section title="En la nube" hint="Conecta el servicio del equipo y elige la carpeta compartida: Sweetflow lee y escribe en ella directamente, sin instalar nada más. Quien tenga acceso a esa carpeta y conecte su cuenta ve lo mismo y trabaja a la vez.">
        <CloudCard provider="dropbox" lib={lib} />
        <CloudCard provider="google" lib={lib} />
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
  if (status.status === "cloud" || status.status === "cloud-reconnect") return <CloudCurrent status={status} />;
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
            <Button variant="primary" disabled={busy} onClick={reconnect}>Abrir «{status.name}»</Button>
            <Button disabled={busy} onClick={pick}>Elegir otra</Button>
          </>
        ) : (
          <>
            <Button variant={status.status === "browser" ? "primary" : undefined} disabled={busy} onClick={pick}>
              <IconFolderOpen size={14} /> {busy ? "Abriendo…" : status.status === "folder" ? "Cambiar carpeta" : "Elegir carpeta"}
            </Button>
            {status.status === "folder" ? <Button disabled={busy} onClick={forget}>Dejar de usarla</Button> : null}
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

export function Integrations() {
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
        {connected ? <Button onClick={() => magnific.disconnect()}>Desconectar</Button> : (
          <Button variant="primary" disabled={busy} onClick={() => void connect()}>{busy ? "Esperando a Magnific…" : "Conectar"}</Button>
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

const CLOUD_ICON: Record<CloudProvider, typeof IconBrandDropbox> = { dropbox: IconBrandDropbox, google: IconBrandGoogleDrive };

/** Who is signed in to a cloud service (Settings). */
async function cloudAccount(p: CloudProvider): Promise<{ name: string; email: string }> {
  if (p === "dropbox") return (await import("../data/folder/dropboxFs")).dropboxAccount();
  return (await import("../data/folder/driveFs")).driveAccount();
}

/** The team folder in use is in Dropbox or Drive. */
function CloudCurrent({ status }: { status: Extract<StorageStatus, { status: "cloud" | "cloud-reconnect" }> }) {
  const setLibrary = useStore((s) => s.setLibrary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = CLOUD_ICON[status.provider];
  const name = cloudName(status.provider);
  const reconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectCloud(status.provider);
      const c = rememberedCloudFolder();
      if (c) setLibrary(await openCloudFolder(c));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="scard">
        <Icon size={22} stroke={1.5} />
        <div className="scard__text">
          <strong>{name} · «{status.name}»{status.status === "cloud-reconnect" ? " (sin conexión)" : ""}</strong>
          <span className="sf-muted">
            {status.status === "cloud"
              ? `Todo se guarda en esta carpeta de ${name}. Lo ve quien tenga acceso a ella y conecte su cuenta.`
              : `Esta carpeta es la del equipo, pero este navegador ya no tiene acceso a ${name}. Mientras tanto ves lo guardado en este navegador.`}
          </span>
        </div>
        <span className="scard__spacer" />
        {status.status === "cloud-reconnect" ? <Button variant="primary" disabled={busy} onClick={() => void reconnect()}>{busy ? "Conectando…" : `Conectar ${name}`}</Button> : null}
        <Button disabled={busy} onClick={() => setLibrary(forgetCloudFolder())}>Dejar de usarla</Button>
      </div>
      {error ? <p className="sf-small" style={{ color: "var(--bad)" }}>{error}</p> : null}
    </>
  );
}

/** Connect Dropbox or Google Drive with this person's account and choose the team folder in it. */
function CloudCard({ provider, lib }: { provider: CloudProvider; lib: LibraryState }) {
  const [connected, setConnected] = useState(isCloudConnected(provider));
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const setLibrary = useStore((s) => s.setLibrary);
  const Icon = CLOUD_ICON[provider];
  const name = cloudName(provider);
  const configured = cloudConfigured(provider);
  const status = storageStatus();
  const inUse = (status.status === "cloud" || status.status === "cloud-reconnect") && status.provider === provider ? status.name : null;
  useEffect(() => onCloudChange(() => setConnected(isCloudConnected(provider))), [provider]);
  useEffect(() => {
    if (!connected) return setWho(null);
    let alive = true;
    void cloudAccount(provider)
      .then((a) => alive && setWho(`Conectada como ${a.name || a.email}${a.name && a.email ? ` (${a.email})` : ""}`))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [connected, provider]);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectCloud(provider);
      setPicking(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const use = async (c: CloudFolder) => {
    setPicking(false);
    setBusy(true);
    setError(null);
    try {
      setLibrary(await openCloudFolder(c));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="scard">
        <Icon size={22} stroke={1.5} />
        <div className="scard__text">
          <strong className="scard__name">
            {name}
            {connected ? <span className="sok" title="Conectada" aria-label="Conectada"><IconCheck size={10} stroke={3} /></span> : null}
          </strong>
          <span className="sf-muted">
            {!configured
              ? `Falta registrar Sweetflow en ${name} y poner su clave en esta instalación (docs/DEVELOPMENT.md).`
              : connected
                ? [who ?? "Conectada. Comprobando la cuenta…", inUse ? `En uso: «${inUse}»` : null].filter(Boolean).join(" · ")
                : provider === "dropbox" ? "Una carpeta compartida de Dropbox del equipo (también las carpetas de equipo)." : "Una carpeta de Mi unidad, compartida contigo o de una unidad compartida."}
          </span>
        </div>
        <span className="scard__spacer" />
        {!configured ? <span className="sbadge">Sin configurar</span> : connected ? (
          <>
            <Button variant={inUse ? undefined : "primary"} disabled={busy} onClick={() => setPicking(true)}><IconFolderOpen size={14} /> {inUse ? "Cambiar carpeta" : "Elegir carpeta"}</Button>
            <Button disabled={busy} onClick={() => { if (inUse) setLibrary(forgetCloudFolder()); disconnectCloud(provider); }}>Desconectar</Button>
          </>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => void connect()}>{busy ? `Esperando a ${name}…` : "Conectar"}</Button>
        )}
      </div>
      {error ? <p className="sf-small" style={{ color: "var(--bad)" }}>{error}</p> : null}
      {picking ? <CloudFolderPicker provider={provider} hasLocal={lib.entries.length > 0 && lib.storage.kind === "browser"} onPick={(c) => void use(c)} onClose={() => setPicking(false)} /> : null}
    </>
  );
}

/** A level of the folder browser: where we are and how to name it. */
type Place = { name: string; dropbox?: string; drive?: DrivePlace | null };

/**
 * Choose the team folder in Dropbox or Drive: go into folders, then «Usar esta
 * carpeta». The top of Drive (Mi unidad, Compartido conmigo, unidades
 * compartidas) and the top of Dropbox can't be the team folder themselves.
 */
function CloudFolderPicker({ provider, hasLocal, onPick, onClose }: { provider: CloudProvider; hasLocal: boolean; onPick: (c: CloudFolder) => void; onClose: () => void }) {
  const top: Place = provider === "dropbox" ? { name: "Dropbox", dropbox: "" } : { name: "Google Drive", drive: null };
  const [trail, setTrail] = useState<Place[]>([top]);
  const [items, setItems] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = trail.at(-1)!;
  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    const load = async (): Promise<Place[]> => {
      if (provider === "dropbox") {
        const { browseDropbox } = await import("../data/folder/dropboxFs");
        return (await browseDropbox(here.dropbox ?? "")).map((f) => ({ name: f.name, dropbox: f.path }));
      }
      const { browseDrive } = await import("../data/folder/driveFs");
      return (await browseDrive(here.drive ?? null)).map((f) => ({ name: f.name, drive: f }));
    };
    load().then((l) => alive && setItems(l), (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [here, provider]);
  // Drive: a real folder (not the top list, not «Compartido conmigo» itself); Dropbox: not its root.
  const usable = provider === "dropbox" ? !!here.dropbox : !!here.drive && here.drive.root.id !== "shared" && trail.length > 1;
  const choose = () => {
    if (provider === "dropbox" && here.dropbox) onPick({ provider, name: here.name, path: here.dropbox });
    if (provider === "google" && here.drive) onPick({ provider, name: here.name, root: here.drive.root });
  };
  return (
    <Modal title={`Carpeta del equipo en ${cloudName(provider)}`} onClose={onClose} width={560}>
      <div className="cpick__trail">
        {trail.map((t, i) => (
          <span key={i}>
            {i > 0 ? <span className="sf-faint"> › </span> : null}
            <button className="link" disabled={i === trail.length - 1} onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button>
          </span>
        ))}
      </div>
      <div className="cpick__list">
        {error ? <p className="sf-small" style={{ color: "var(--bad)" }}>{error}</p> : items === null ? <p className="sf-faint sf-small">Cargando…</p> : items.length ? items.map((f, i) => (
          <button key={i} className="cpick__item" onClick={() => setTrail([...trail, f])}>
            <IconFolder size={16} stroke={1.5} /> <span>{f.name}</span>
          </button>
        )) : <p className="sf-faint sf-small">No hay carpetas aquí.</p>}
      </div>
      <p className="sf-faint sf-small">
        Elige la carpeta compartida con el equipo. Si está vacía, Sweetflow empieza ahí un dashboard nuevo; si ya la usa el equipo, verás sus producciones.
        {hasLocal ? " Lo que ya tienes en este navegador no se copia." : ""}
      </p>
      <div className="modal-foot">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!usable} onClick={choose}>Usar «{here.name}»</Button>
      </div>
    </Modal>
  );
}

const KINDS: Array<{ id: GenKind; label: string }> = [
  { id: "image", label: "Imagen" },
  { id: "video", label: "Vídeo" },
  { id: "audio", label: "Audio" },
];

/** What a model allows, in a few words. */
function modelFacts(m: ModelSpec): string {
  const d = m.durations;
  return [
    d?.length ? (d.length === 1 ? `${d[0]} s` : `${d[0]}–${d.at(-1)} s`) : null,
    m.resolutions?.join(" · "),
    m.references ? `hasta ${m.references.max} referencias` : null,
    m.startFrame ? (m.endFrame ? "imagen inicial y final" : "imagen inicial") : null,
    m.sound ? "sonido" : null,
  ].filter(Boolean).join(" · ");
}

/**
 * Which models show when generating (docs/INTERFAZ.md §1.1). The list comes
 * from Magnific's catalog when it is connected; a setting of this computer.
 */
export function ModelsSettings() {
  useModelsVersion();
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = magnific.isConnected();
  const at = catalogReadAt();
  useEffect(() => {
    refreshCatalog().catch(() => undefined);
  }, []);
  const update = async () => {
    setBusy(true);
    setError(null);
    try {
      await refreshCatalog(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const q = filter.trim().toLowerCase();
  return (
    <Section title="Modelos" hint="Elige qué modelos aparecen al generar. Los que no marques siguen disponibles aquí; lo que ya se generó con ellos no cambia. Se guarda en este ordenador.">
      <div className="smodels__bar">
        <span className="sf-muted sf-small">
          {at ? `Catálogo de Magnific leído el ${new Date(at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : connected ? "Leyendo el catálogo de Magnific…" : "Copia del catálogo de Magnific del 18 oct 2026. Conecta Magnific para leerlo en vivo."}
        </span>
        <span className="scard__spacer" />
        <input className="sf-input smodels__filter" placeholder="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {connected ? <Button disabled={busy} onClick={() => void update()}><IconRefresh size={14} /> {busy ? "Actualizando…" : "Actualizar"}</Button> : null}
        <Button variant="ghost" onClick={resetShown} title="Volver a los modelos que se muestran por defecto">Restablecer</Button>
      </div>
      {error ? <p className="sf-small" style={{ color: "var(--bad)" }}>{error}</p> : null}
      {KINDS.map((k) => {
        const all = allModelsFor(k.id);
        const list = all.filter((m) => !q || m.name.toLowerCase().includes(q) || (m.slug ?? "").includes(q));
        if (!list.length) return null;
        return (
          <div key={k.id} className="smodels__kind">
            <h3>{k.label} <span className="sf-faint">{all.filter(isShown).length} de {all.length}</span></h3>
            <div className="smodels__list">
              {list.map((m) => (
                <label key={m.slug ?? m.name} className="smodels__row">
                  <input type="checkbox" checked={isShown(m)} onChange={(e) => setShown(m, e.target.checked)} />
                  <span className="smodels__name">{m.name}</span>
                  <span className="sf-faint sf-small smodels__facts">{modelFacts(m)}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function About({ lib }: { lib: LibraryState }) {
  const version = window.sweetflow?.version;
  return (
    <Section title="Acerca de Sweetflow">
      <dl className="sabout">
        <dt>Versión</dt>
        <dd>{version ? `${version} (escritorio)` : "Web (desarrollo)"}</dd>
        <dt>Datos</dt>
        <dd>{lib.storage.kind === "folder" ? `Carpeta · ${lib.storage.name}` : lib.mode === "demo" ? "Demo en memoria" : lib.mode === "local" ? "Este navegador" : "Firebase"}</dd>
      </dl>
    </Section>
  );
}
