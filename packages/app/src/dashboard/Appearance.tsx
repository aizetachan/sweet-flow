/**
 * Ajustes › Apariencia (docs/INTERFAZ.md §1.4): one colour, applied only to
 * me (on this computer) or to the whole team when I may change the team's;
 * and, for the owner and the admins, who may change the team's theme and who
 * may use their own.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconCheck, IconPlus, IconRestore } from "@tabler/icons-react";
import { Button, cx, Segmented } from "@sweetflow/ui";
import { contrastWithWhite, DEFAULT_ACCENT } from "@sweetflow/ui/color";
import type { ThemeEditors, ThemeFreedom } from "@sweetflow/domain";
import type { LibraryState } from "../data/library";
import { ColorPicker } from "../components/ColorPicker";
import { Popover } from "../components/Popover";
import { LogoMark } from "../shell/Logo";
import { useStore } from "../state/store";
import { setOwnTheme, shownTheme, useOwnTheme } from "../theme";
import { isDesktop } from "../platform";

/** All but Contanimated read well with white on them (≥ 4.5:1). */
export const SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: DEFAULT_ACCENT, name: "Azul Sweetflow" },
  { hex: "#ef3732", name: "Contanimated" },
  { hex: "#805ed7", name: "Violeta" },
  { hex: "#c93f87", name: "Rosa" },
  { hex: "#a86500", name: "Ámbar" },
  { hex: "#00845e", name: "Verde" },
  { hex: "#007f9e", name: "Turquesa" },
];

const colourName = (hex: string) => SWATCHES.find((s) => s.hex === hex)?.name ?? hex.toUpperCase();

type Target = "me" | "team";

export function Appearance({ lib }: { lib: LibraryState }) {
  const library = useStore((s) => s.library);
  const mine = useOwnTheme();
  const team = lib.team;
  const mayOwn = !team || team.canPersonalizeTheme;
  const mayTeam = !!team?.canSetTheme;
  const [chosen, setChosen] = useState<Target>("me");
  const target: Target = !mayOwn ? "team" : !mayTeam ? "me" : chosen;
  const teamAccent = team?.theme?.accent ?? DEFAULT_ACCENT;
  const shown = shownTheme(lib, mine)?.accent ?? DEFAULT_ACCENT;
  const value = target === "team" ? teamAccent : (mine?.accent ?? shown);
  const editable = target === "team" ? mayTeam : mayOwn;

  const apply = (hex: string) => {
    if (target === "me") return setOwnTheme({ accent: hex });
    library.team?.setTheme(hex === DEFAULT_ACCENT ? null : { accent: hex });
    // Applied to everyone: me too (my own would hide it).
    if (mine) setOwnTheme(null);
  };
  const restore = () => (target === "me" ? setOwnTheme(null) : library.team?.setTheme(null));
  const canRestore = target === "me" ? !!mine : !!team?.theme;

  const hint = `El color sustituye al azul en toda la app${isDesktop() ? " y en el marco del icono de la app" : ""}.`;
  const caption = target === "team"
    ? `El equipo usa ${colourName(teamAccent)}.`
    : mine ? `Usas ${colourName(mine.accent)}, solo tú y en este ordenador.` : team?.theme ? `Ves el tema del equipo (${colourName(teamAccent)}).` : "Usas el azul de Sweetflow.";

  return (
    <>
      <Section title="Tema" hint={hint}>
        {mayTeam && mayOwn ? (
          <div className="theme__line">
            <span className="sf-small">Aplicar a</span>
            <Segmented<Target> value={target} onChange={setChosen} items={[
              { id: "me", label: "Solo a mí", title: "Solo tú, en este ordenador" },
              { id: "team", label: "A todo el equipo", title: "Lo ve todo el equipo" },
            ]} />
          </div>
        ) : null}
        <div className="theme__row">
          <span className="theme__icon" aria-hidden="true"><LogoMark size={34} /></span>
          <div className="theme__pick">
            {editable ? (
              <>
                <Swatches value={value} onPick={apply} />
                <p className="sf-faint sf-small">{caption}</p>
                {contrastWithWhite(value) < 3 ? (
                  <p className="theme__warn sf-small"><IconAlertTriangle size={14} /> Con este color, los textos e iconos blancos se leen peor.</p>
                ) : null}
              </>
            ) : (
              <p className="sf-muted sf-small">{team?.owner?.name ?? "El propietario"} ha fijado el tema del equipo para todos ({colourName(teamAccent)}).</p>
            )}
          </div>
        </div>
        {editable && canRestore ? (
          <Button variant="ghost" onClick={restore}>
            <IconRestore size={15} /> {target === "me" && team?.theme ? "Usar el tema del equipo" : "Restaurar valores por defecto"}
          </Button>
        ) : null}
        {team && !mayTeam && mayOwn ? (
          <p className="sf-faint sf-small theme__note">Tema del equipo: {colourName(teamAccent)}. Lo elige {team.owner?.name ?? "el propietario"}.</p>
        ) : null}
      </Section>

      {team?.isManager ? (
        <Section title="Permisos del tema" hint="Quién puede cambiar el tema del equipo y quién puede usar uno propio. Lo deciden el propietario y los administradores.">
          <div className="theme__line">
            <span className="sf-small">Quién puede cambiar el tema del equipo</span>
            <Segmented<ThemeEditors> value={team.themeEditors} onChange={(v) => library.team?.setThemeEditors(v)} items={[
              { id: "admins", label: "Administradores", title: "El propietario y los administradores" },
              { id: "everyone", label: "Todo el equipo" },
            ]} />
          </div>
          <div className="theme__line">
            <span className="sf-small">Quién puede usar su propio tema</span>
            <Segmented<ThemeFreedom> value={team.themeFreedom} onChange={(v) => library.team?.setThemeFreedom(v)} items={[
              { id: "everyone", label: "Todo el equipo", title: "Cada uno puede elegir el suyo; si no, ve el del equipo" },
              { id: "nobody", label: "Nadie", title: "Todos ven el tema del equipo" },
            ]} />
          </div>
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

/** The swatches and «+»: a colour of your own, in the app's own picker. */
function Swatches({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  // While dragging in the picker: shown at once, saved when it stops a moment.
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const current = draft ?? value;
  const custom = !SWATCHES.some((s) => s.hex === current);
  const live = (hex: string) => {
    setDraft(hex);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      onPick(hex);
      setDraft(null);
    }, 250);
  };
  return (
    <div className="theme__swatches" role="radiogroup" aria-label="Color">
      {SWATCHES.map((s) => (
        <button key={s.hex} role="radio" aria-checked={current === s.hex} title={s.name} aria-label={s.name}
          className={cx("theme__swatch", current === s.hex && "is-on")} style={{ background: s.hex }} onClick={() => onPick(s.hex)}>
          {current === s.hex ? <IconCheck size={15} stroke={2.4} /> : null}
        </button>
      ))}
      <Popover float className="cpick__menu" button={({ open, toggle }) => (
        <button className={cx("theme__swatch theme__swatch--custom", (custom || open) && "is-on", custom && "has-colour")} title="Otro color" aria-label="Otro color"
          style={custom ? { background: current } : undefined} onClick={toggle}>
          {custom ? <IconCheck size={15} stroke={2.4} /> : <IconPlus size={15} stroke={2.4} />}
        </button>
      )}>
        <ColorPicker value={current} onChange={live} />
      </Popover>
    </div>
  );
}
