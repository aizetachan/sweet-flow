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

export function PromptTags({ value, onChange, placeholder, mentions, setMentions }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mentions: Mentions;
  setMentions: (m: Mentions) => void;
}) {
  const snap = useSnap();
  const area = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ text: string; at: number } | null>(null);
  const [hi, setHi] = useState(0);
  const [picking, setPicking] = useState<Id | null>(null);
  // Every group, also those still without images (they show what to do).
  const groups = snap.library.filter((n) => n.lib?.kind === "card");
  const q = query?.text.toLowerCase() ?? "";
  const list = query ? groups.filter((g) => g.title.toLowerCase().includes(q) || libTag(g.title).toLowerCase().includes(q)).slice(0, 8) : [];

  // «@» and what follows it, right before the caret.
  const track = (text: string, caret: number) => {
    const m = /@([\p{L}\p{N}_-]*)$/u.exec(text.slice(0, caret));
    setQuery(m && groups.length ? { text: m[1]!, at: caret - m[0].length } : null);
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
      const imgs = imagesOf(snap.media, g.id);
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
    if (!list.length) return;
    if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => (h + 1) % list.length));
    else if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => (h - 1 + list.length) % list.length));
    else if (e.key === "Enter" || e.key === "Tab") (e.preventDefault(), insert(list[hi]!));
    else if (e.key === "Escape") setQuery(null);
  };

  const called = mentionsIn(value, mentions);
  const pickGroup = picking ? snap.library.find((n) => n.id === picking) : undefined;
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
      {list.length ? (
        <div className="menu ptags__menu" role="listbox">
          <div className="menu__title">Biblioteca</div>
          {list.map((g, i) => {
            const first = imagesOf(snap.media, g.id)[0];
            const type = g.lib?.kind === "card" ? g.lib.type : undefined;
            const kind = type ? LIB_TYPES.find((t) => t.id === type)?.label : undefined;
            return (
              <button key={g.id} role="option" aria-selected={i === hi} className={cx("menu__item ptags__opt", i === hi && "is-on")}
                onMouseDown={(e) => { e.preventDefault(); insert(g); }} onMouseEnter={() => setHi(i)}>
                {first ? <Thumb media={first} badge={false} /> : <IconPhoto size={14} />}
                <span className="menu__label">{g.title}</span>
                <span className="menu__hint">@{libTag(g.title)}{kind ? ` · ${kind}` : ""}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {pickGroup && mentions[pickGroup.id] ? (
        <div className="menu ptags__pick" onMouseDown={(e) => e.preventDefault()}>
          <div className="menu__title">@{mentions[pickGroup.id]!.tag} · imágenes de referencia ({mentions[pickGroup.id]!.mediaIds.length}/{MAX_IMAGES})</div>
          {!imagesOf(snap.media, pickGroup.id).length ? <p className="sf-faint sf-small ptags__empty">Este grupo aún no tiene imágenes: genera en él desde la Biblioteca.</p> : null}
          <div className="ptags__grid">
            {imagesOf(snap.media, pickGroup.id).map((m) => {
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
