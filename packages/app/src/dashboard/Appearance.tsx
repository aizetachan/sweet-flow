/**
 * Ajustes › Apariencia (docs/INTERFAZ.md §1.4): my theme, on this computer,
 * and the team's, which only the owner sets, deciding whether members may use
 * their own.
 */

import { IconCheck, IconRestore } from "@tabler/icons-react";
import { Button, cx, Segmented } from "@sweetflow/ui";
import { DEFAULT_ACCENT, normHex } from "@sweetflow/ui/color";
import type { Theme, ThemeFreedom } from "@sweetflow/domain";
import type { LibraryState } from "../data/library";
import { LogoMark } from "../shell/Logo";
import { useStore } from "../state/store";
import { setOwnTheme, shownTheme, useOwnTheme } from "../theme";
import { isDesktop } from "../platform";
import { useEffect, useRef, useState, type ReactNode } from "react";

const SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: DEFAULT_ACCENT, name: "Azul Sweetflow" },
  { hex: "#8f6ee8", name: "Violeta" },
  { hex: "#e0559b", name: "Rosa" },
  { hex: "#ec6a4f", name: "Coral" },
  { hex: "#d8913f", name: "Ámbar" },
  { hex: "#2fb38a", name: "Verde" },
  { hex: "#2aa9c9", name: "Turquesa" },
];

const colourName = (hex: string) => SWATCHES.find((s) => s.hex === hex)?.name ?? hex.toUpperCase();

export function Appearance({ lib }: { lib: LibraryState }) {
  const library = useStore((s) => s.library);
  const mine = useOwnTheme();
  const team = lib.team;
  const mayOwn = !team || team.canPersonalizeTheme;
  const shown = shownTheme(lib, mine)?.accent ?? DEFAULT_ACCENT;
  const teamAccent = team?.theme?.accent ?? DEFAULT_ACCENT;

  return (
    <>
      <Section title="Tu tema" hint={`Solo para ti, en este ordenador. El color que elijas sustituye al azul en toda la app${isDesktop() ? " y en el marco del icono del Dock mientras la app está abierta" : ""}.`}>
        <div className="theme__row">
          <IconPreview />
          <div className="theme__pick">
            {mayOwn ? (
              <>
                <Picker value={mine?.accent ?? null} fallback={shown} onPick={(hex) => setOwnTheme({ accent: hex })} />
                <p className="sf-faint sf-small">
                  {mine ? `Usas ${colourName(mine.accent)}.` : team?.theme ? `Ves el tema del equipo (${colourName(teamAccent)}).` : "Usas el azul de Sweetflow."}
                </p>
              </>
            ) : (
              <p className="sf-muted sf-small">{team?.owner?.name ?? "El propietario"} ha fijado el tema del equipo para todos ({colourName(teamAccent)}).</p>
            )}
          </div>
        </div>
        {mayOwn && mine ? (
          <Button variant="ghost" onClick={() => setOwnTheme(null)}>
            <IconRestore size={15} /> {team?.theme ? "Usar el tema del equipo" : "Restaurar valores por defecto"}
          </Button>
        ) : null}
      </Section>

      {team ? (
        <Section title="Tema del equipo" hint={team.canSetTheme ? "Cómo ve la app todo el equipo. Lo eliges tú, como propietario." : `Lo elige ${team.owner?.name ?? "el propietario del equipo"}.`}>
          {team.canSetTheme ? (
            <>
              <Picker value={team.theme?.accent ?? null} fallback={DEFAULT_ACCENT} onPick={(hex) => library.team?.setTheme(hex === DEFAULT_ACCENT ? null : ({ accent: hex } satisfies Theme))} />
              <div className="theme__freedom">
                <span className="sf-small">Quién puede usar su propio tema</span>
                <Segmented<ThemeFreedom>
                  value={team.themeFreedom}
                  onChange={(v) => library.team?.setThemeFreedom(v)}
                  items={[
                    { id: "everyone", label: "Todo el equipo", title: "Cada miembro puede elegir el suyo; si no, ve el del equipo" },
                    { id: "nobody", label: "Nadie", title: "Todos ven el tema del equipo" },
                  ]}
                />
              </div>
              {team.theme || team.themeFreedom !== "everyone" ? (
                <Button variant="ghost" onClick={() => {
                  library.team?.setTheme(null);
                  library.team?.setThemeFreedom("everyone");
                }}>
                  <IconRestore size={15} /> Restaurar valores por defecto
                </Button>
              ) : null}
            </>
          ) : (
            <div className="theme__team">
              <span className="theme__dot" style={{ background: teamAccent }} />
              <span className="sf-small">{colourName(teamAccent)} · {team.themeFreedom === "everyone" ? "cada miembro puede usar el suyo" : "fijado para todos"}</span>
            </div>
          )}
        </Section>
      ) : null}
    </>
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

/** The swatches and a colour of your own. `value` null: nothing chosen (`fallback` is what shows). */
function Picker({ value, fallback, onPick }: { value: string | null; fallback: string; onPick: (hex: string) => void }) {
  // Dragging in the system's colour picker: shown at once, saved when it stops a moment.
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const current = draft ?? value ?? fallback;
  const custom = !SWATCHES.some((s) => s.hex === current);
  return (
    <div className="theme__swatches" role="radiogroup" aria-label="Color">
      {SWATCHES.map((s) => (
        <button key={s.hex} role="radio" aria-checked={current === s.hex} title={s.name} aria-label={s.name}
          className={cx("theme__swatch", current === s.hex && "is-on")} style={{ background: s.hex }} onClick={() => onPick(s.hex)}>
          {current === s.hex ? <IconCheck size={15} stroke={2.4} /> : null}
        </button>
      ))}
      <label className={cx("theme__swatch theme__swatch--custom", custom && "is-on")} title="Otro color" style={custom ? { background: current } : undefined}>
        {custom ? <IconCheck size={15} stroke={2.4} /> : <span aria-hidden="true">+</span>}
        <input type="color" aria-label="Otro color" value={current} onChange={(e) => {
          const hex = normHex(e.target.value);
          if (!hex) return;
          setDraft(hex);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            onPick(hex);
            setDraft(null);
          }, 300);
        }} />
      </label>
    </div>
  );
}

/** The app's icon with the colour shown now (its frame follows the theme). */
function IconPreview() {
  return (
    <span className="theme__icon" aria-hidden="true">
      <LogoMark size={34} />
    </span>
  );
}
