/**
 * The AI's answers with their format (paragraphs, headings, lists, tables,
 * bold, italics, code, links), built as elements (never as HTML). The codes of the
 * production (SH0030, SC010…) can be clicked: the main window goes there.
 */

import { Fragment, type ReactNode } from "react";

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*[^*\s][^*\n]*\*|\b_[^_\s][^_\n]*_\b|\b[A-Z]{2,4}\d{3,5}\b)/g;

function inline(text: string, onCode: (code: string) => void, key = ""): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const t = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}${n++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{inline(t.slice(2, -2), onCode, `${k}.`)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      out.push(<a key={k} href={href} target="_blank" rel="noreferrer">{label}</a>);
    } else if (t.startsWith("*") || t.startsWith("_")) out.push(<em key={k}>{inline(t.slice(1, -1), onCode, `${k}.`)}</em>);
    else out.push(<button key={k} className="chat__code" title={`Ver ${t} en Sweetflow`} onClick={() => onCode(t)}>{t}</button>);
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onCode }: { text: string; onCode: (code: string) => void }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), onCode)}</p>);
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      blocks.push(<pre key={`c${blocks.length}`}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    // A table: | a | b | over a | --- | line.
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      flush();
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push(
        <div key={`t${blocks.length}`} className="chat__tablewrap">
          <table>
            <thead><tr>{head.map((c, k) => <th key={k}>{inline(c, onCode, `${k}.`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c, onCode, `${j}.${k}.`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push(<h4 key={`h${blocks.length}`}>{inline(h[2]!, onCode)}</h4>);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
        // A wrapped line of the item goes with it.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) items[items.length - 1] += ` ${lines[i++]!.trim()}`;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`l${blocks.length}`}>{items.map((it, k) => <li key={k}>{inline(it, onCode, `${k}.`)}</li>)}</List>);
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line.trim());
    i++;
  }
  flush();
  return <Fragment>{blocks}</Fragment>;
}
