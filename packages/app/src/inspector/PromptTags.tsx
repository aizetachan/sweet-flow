/**
 * The prompt with library tags (docs/INTERFAZ.md §2.8): «@» lists the
 * library's groups; picking one writes «@Nombre» and opens a small menu with
 * its images to choose the ones used as its reference (up to 6, its chosen
 * ones to start). Under the prompt, a chip per group called, to change them.
 */

import { useRef, useState, type KeyboardEvent } from "react";
import { IconCheck, IconPhoto } from "@tabler/icons-react";
import { libOrder, libTag, type Id, type Media, type ProdNode } from "@sweetflow/domain";
import { cx } from "@sweetflow/ui";
import { useSnap } from "../state/store";
import { useSharedLibraries } from "../library/shared";
import { Thumb } from "../components/media";
import { LIB_TYPES } from "./Inspector";

/** Images a group sends, by group id (the tag is what was written). */
export type Mentions = Record<Id, { tag: string; mediaIds: Id[] }>;

/** Up to this many images per group: what a Magnific library asset takes. */
const MAX_IMAGES = 6;

const imagesOf = (media: Media[], groupId: Id) =>
  media.filter((m) => m.nodeId === groupId && m.kind === "image" && m.status === "ready" && !m.archived).sort((a, b) => libOrder(a) - libOrder(b));

/** The groups called in a prompt: those whose «@tag» is still in the text. */
export function mentionsIn(prompt: string, mentions: Mentions): Array<{ groupId: Id; tag: string; mediaIds: Id[] }> {
  return Object.entries(mentions)
    .filter(([, m]) => m.mediaIds.length && new RegExp(`@${m.tag}(?![A-Za-z0-9_-])`).test(prompt))
    .map(([groupId, m]) => ({ groupId, ...m }));
}

/** A reference of the generate box the prompt can name («@Imagen2»). */
export interface RefTag {
  tag: string;
  label: string;
  media?: Media;
  preview?: string;
}

export function PromptTags({ value, onChange, placeholder, mentions, setMentions, refs = [] }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mentions: Mentions;
  setMentions: (m: Mentions) => void;
  refs?: RefTag[];
}) {
  const snap = useSnap();
  const shared = useSharedLibraries();
  const area = useRef<HTMLTextAreaElement>(null);
  // This production's groups and those other productions share with it (§2.8.1).
  const fromOf = new Map<Id, string>();
  const media: Media[] = [...snap.media];
  for (const l of shared) {
    for (const g of l.groups) fromOf.set(g.id, l.name);
    media.push(...l.media);
  }
  const [query, setQuery] = useState<{ text: string; at: number } | null>(null);
  const [hi, setHi] = useState(0);
  const [picking, setPicking] = useState<Id | null>(null);
  // Every group, also those still without images (they show what to do).
  const groups = [...snap.library.filter((n) => n.lib?.kind === "card"), ...shared.flatMap((l) => l.groups)];
  const q = query?.text.toLowerCase() ?? "";
  const list = query ? groups.filter((g) => g.title.toLowerCase().includes(q) || libTag(g.title).toLowerCase().includes(q)).slice(0, 8) : [];
  const refList = query ? refs.filter((r) => r.tag.toLowerCase().includes(q.replace(/\s+/g, "")) || r.label.toLowerCase().includes(q)) : [];
  // One list for the keyboard: the references first, then the library's groups.
  const options: Array<{ ref: RefTag } | { group: ProdNode }> = [...refList.map((r) => ({ ref: r })), ...list.map((g) => ({ group: g }))];

  /** «@Imagen2»: names one of the references above. */
  const insertRef = (r: RefTag) => {
    if (!query) return;
    const caret = area.current?.selectionStart ?? value.length;
    onChange(`${value.slice(0, query.at)}@${r.tag} ${value.slice(caret)}`);
    setQuery(null);
    requestAnimationFrame(() => {
      const at = query.at + r.tag.length + 2;
      area.current?.focus();
      area.current?.setSelectionRange(at, at);
    });
  };
  const choose = (o: (typeof options)[number]) => ("ref" in o ? insertRef(o.ref) : insert(o.group));

  // «@» and what follows it, right before the caret.
  const track = (text: string, caret: number) => {
    const m = /@([\p{L}\p{N}_-]*)$/u.exec(text.slice(0, caret));
    setQuery(m && (groups.length || refs.length) ? { text: m[1]!, at: caret - m[0].length } : null);
    setHi(0);
  };

  const insert = (g: ProdNode) => {
    if (!query) return;
    const tag = libTag(g.title);
    const caret = area.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.at)}@${tag} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    if (!mentions[g.id]) {
      const imgs = imagesOf(media, g.id);
      const chosen = imgs.filter((m) => m.chosen);
      setMentions({ ...mentions, [g.id]: { tag, mediaIds: (chosen.length ? chosen : imgs).slice(0, MAX_IMAGES).map((m) => m.id) } });
    } else if (mentions[g.id]!.tag !== tag) setMentions({ ...mentions, [g.id]: { ...mentions[g.id]!, tag } });
    setPicking(g.id);
    requestAnimationFrame(() => {
      const at = query.at + tag.length + 2;
      area.current?.focus();
      area.current?.setSelectionRange(at, at);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!options.length) return;
    if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => (h + 1) % options.length));
    else if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => (h - 1 + options.length) % options.length));
    else if (e.key === "Enter" || e.key === "Tab") (e.preventDefault(), choose(options[hi]!));
    else if (e.key === "Escape") setQuery(null);
  };

  const called = mentionsIn(value, mentions);
  const pickGroup = picking ? groups.find((n) => n.id === picking) : undefined;
  const toggle = (id: Id) => {
    if (!picking) return;
    const cur = mentions[picking];
    if (!cur) return;
    const has = cur.mediaIds.includes(id);
    if (!has && cur.mediaIds.length >= MAX_IMAGES) return;
    setMentions({ ...mentions, [picking]: { ...cur, mediaIds: has ? cur.mediaIds.filter((x) => x !== id) : [...cur.mediaIds, id] } });
  };

  return (
    <div className="ptags">
      <textarea ref={area} className="sf-textarea" rows={4} placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value); track(e.target.value, e.target.selectionStart); }}
        onKeyDown={onKey}
        onClick={(e) => track(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)} />
      {options.length ? (
        <div className="menu ptags__menu" role="listbox">
          {refList.length ? <div className="menu__title">Referencias</div> : null}
          {refList.map((r, i) => (
            <button key={r.tag} role="option" aria-selected={i === hi} className={cx("menu__item ptags__opt", i === hi && "is-on")}
              onMouseDown={(e) => { e.preventDefault(); insertRef(r); }} onMouseEnter={() => setHi(i)}>
              {r.media ? <Thumb media={r.media} badge={false} /> : r.preview ? <img className="ptags__thumb" src={r.preview} alt="" /> : <IconPhoto size={14} />}
              <span className="menu__label">{r.label}</span>
            </button>
          ))}
          {list.length ? <div className="menu__title">Biblioteca</div> : null}
          {list.map((g, j) => {
            const i = refList.length + j;
            const first = imagesOf(media, g.id)[0];
            const type = g.lib?.kind === "card" ? g.lib.type : undefined;
            const kind = type ? LIB_TYPES.find((t) => t.id === type)?.label : undefined;
            return (
              <button key={g.id} role="option" aria-selected={i === hi} className={cx("menu__item ptags__opt", i === hi && "is-on")}
                onMouseDown={(e) => { e.preventDefault(); insert(g); }} onMouseEnter={() => setHi(i)}>
                {first ? <Thumb media={first} badge={false} /> : <IconPhoto size={14} />}
                <span className="menu__label">{g.title}</span>
                {kind || fromOf.has(g.id) ? <span className="menu__hint">{[kind, fromOf.has(g.id) ? `de ${fromOf.get(g.id)}` : null].filter(Boolean).join(" · ")}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {pickGroup && mentions[pickGroup.id] ? (
        <div className="menu ptags__pick" onMouseDown={(e) => e.preventDefault()}>
          <div className="menu__title">@{mentions[pickGroup.id]!.tag} · imágenes de referencia ({mentions[pickGroup.id]!.mediaIds.length}/{MAX_IMAGES})</div>
          {!imagesOf(media, pickGroup.id).length ? <p className="sf-faint sf-small ptags__empty">Este grupo aún no tiene imágenes: genera en él desde la Biblioteca.</p> : null}
          <div className="ptags__grid">
            {imagesOf(media, pickGroup.id).map((m) => {
              const on = mentions[pickGroup.id]!.mediaIds.includes(m.id);
              return (
                <button key={m.id} className={cx("ptags__img", on && "is-on")} onClick={() => toggle(m.id)} title={on ? "Quitar" : "Usar como referencia"}>
                  <Thumb media={m} badge={false} />
                  {on ? <span className="ptags__check"><IconCheck size={12} stroke={3} /></span> : null}
                </button>
              );
            })}
          </div>
          <div className="ptags__foot">
            <span className="sf-faint sf-small grow">{pickGroup.lib?.kind === "card" && ["cast", "prop", "location"].includes(pickGroup.lib.type ?? "") ? "Magnific la reconocerá por su nombre." : "Se mandan como imágenes de referencia."}</span>
            <button className="link" onClick={() => setPicking(null)}>Listo</button>
          </div>
        </div>
      ) : null}
      {called.length ? (
        <div className="ptags__chips">
          {called.map((m) => (
            <button key={m.groupId} className={cx("ptags__chip", picking === m.groupId && "is-on")} title="Elegir sus imágenes de referencia" onClick={() => setPicking(picking === m.groupId ? null : m.groupId)}>
              @{m.tag} <span className="sf-faint">· {m.mediaIds.length}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
