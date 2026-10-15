/**
 * Settings, inside the dashboard: profile, storage (Dropbox), integrations
 * (Magnific) and about. Connections that are not built yet are shown with
 * what they will do and a "Próximamente" state, never as working buttons.
 */

import { useEffect, useState, type ReactNode } from "react";
import { IconBolt, IconBrandDropbox, IconBrandGoogleDrive, IconDeviceDesktop, IconFolders, IconInfoCircle, IconPlugConnected, IconUser } from "@tabler/icons-react";
import { Avatar, Button, cx } from "@sweetflow/ui";
import type { LibraryState } from "../data/library";
import { isDesktop } from "../platform";
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
  const where = lib.mode === "demo" ? "En memoria (demo): se pierde al recargar." : lib.mode === "local" ? (isDesktop() ? "En este equipo, dentro de la app." : "En este navegador.") : "Firebase.";
  return (
    <>
      <Section title="Dónde se guardan las producciones">
        <div className="scard">
          <IconDeviceDesktop size={22} stroke={1.5} />
          <div className="scard__text">
            <strong>Ahora: {lib.label}</strong>
            <span className="sf-muted">{where}</span>
          </div>
        </div>
      </Section>
      <Section
        title="Almacenamiento del equipo"
        hint="Una carpeta compartida en la nube será el almacenamiento: el dashboard mostrará sus carpetas y cada producción se guardará en ella, ordenada por códigos. Todo el que tenga acceso a esa carpeta verá lo mismo. Cada equipo elige su servicio."
      >
        <Connection
          icon={<IconBrandDropbox size={22} stroke={1.5} />}
          name="Dropbox"
          detail={isDesktop() ? "Una carpeta compartida de Dropbox del equipo." : "Una carpeta compartida de Dropbox del equipo. En la app de escritorio."}
        />
        <Connection
          icon={<IconBrandGoogleDrive size={22} stroke={1.5} />}
          name="Google Drive"
          detail={isDesktop() ? "Una unidad compartida (o carpeta compartida) de Google Drive." : "Una unidad compartida de Google Drive. En la app de escritorio."}
        />
      </Section>
    </>
  );
}

function Integrations() {
  return (
    <Section title="Integraciones" hint="Cada persona conecta su propia cuenta: lo que genera gasta sus créditos, y el resultado lo ve todo el equipo.">
      <Connection icon={<IconBolt size={22} stroke={1.5} />} name="Magnific" detail="Generación de imágenes y vídeo con tu cuenta y tus créditos." />
    </Section>
  );
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
        <dd>{lib.mode === "demo" ? "Demo en memoria" : lib.mode === "local" ? `Local · ${lib.label}` : "Firebase"}</dd>
      </dl>
    </Section>
  );
}
