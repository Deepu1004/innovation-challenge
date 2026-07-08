import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmt, fmtFull, type EntityMeta } from "./lib";

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return ref;
}

export function Card({ title, sub, span = 6, actions, note, children }: Readonly<{
  title: string; sub?: string; span?: number; actions?: ReactNode; note?: string; children: ReactNode;
}>) {
  return (
    <section className={`card col-${span}`}>
      <div className="card-h">
        <div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions}
      </div>
      {children}
      {note && <div className="card-note">{note}</div>}
    </section>
  );
}

export function Kpi({ label, value, sub, color }: Readonly<{ label: string; value: string; sub?: string; color: string }>) {
  return (
    <div className="kpi">
      <div className="k-top"><span className="k-dot" style={{ background: color }} />{label}</div>
      <div className="k-val">{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  );
}


// single-select dropdown
export function Dropdown({ label, value, options, onChange, width }: Readonly<{
  label: string; value: string; options: { v: string; label: string }[]; onChange: (v: string) => void; width?: number;
}>) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const current = options.find((o) => o.v === value)?.label ?? value;
  return (
    <div className="select-wrap" ref={ref}>
      <button className="select-btn compact" onClick={() => setOpen((o) => !o)}>
        <span className="lbl">{label}</span>
        <span className="val">{current}</span>
        <span aria-hidden style={{ color: "var(--muted)" }}>▾</span>
      </button>
      {open && (
        <div className="select-pop" style={{ width: width ?? 200 }}>
          {options.map((o) => (
            <button key={o.v} className={"opt" + (value === o.v ? " sel" : "")} onClick={() => { onChange(o.v); setOpen(false); }}>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// multi-select dropdown (keeps at least one selected)
export function MultiDropdown({ label, values, options, onChange }: Readonly<{
  label: string; values: number[]; options: number[]; onChange: (v: number[]) => void;
}>) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const toggle = (y: number) => {
    const has = values.includes(y);
    if (has && values.length === 1) return;
    onChange(has ? values.filter((x) => x !== y) : [...values, y].sort((a, b) => a - b));
  };
  const summary = values.length === options.length ? "All years" : [...values].sort((a, b) => a - b).join(", ");
  return (
    <div className="select-wrap" ref={ref}>
      <button className="select-btn compact" onClick={() => setOpen((o) => !o)}>
        <span className="lbl">{label}</span>
        <span className="val">{summary}</span>
        <span aria-hidden style={{ color: "var(--muted)" }}>▾</span>
      </button>
      {open && (
        <div className="select-pop" style={{ width: 190 }}>
          {options.map((y) => (
            <button key={y} className={"opt" + (values.includes(y) ? " sel" : "")} onClick={() => toggle(y)}>
              <span className="chk">{values.includes(y) ? "☑" : "☐"}</span><span>{y}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RankedList({ items, metric }: Readonly<{
  items: { name: string; sub?: string; value: number; value2?: string }[]; metric?: string;
}>) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="rank">
      {items.length === 0 && <div className="card-note">No data for this selection.</div>}
      {items.map((it, i) => (
        <div className="row" key={`${it.name}-${it.value}`} title={it.name}>
          <span className="rk">{i + 1}</span>
          <span className="nm">
            {it.name}
            {it.sub && <small>{it.sub}</small>}
            <span className="bar" style={{ width: `${Math.max(4, (it.value / max) * 100)}%` }} />
          </span>
          <span className="mv">{fmt(it.value)}{it.value2 && <small> {it.value2}</small>}{metric && <small> {metric}</small>}</span>
        </div>
      ))}
    </div>
  );
}

export function EntitySelect({ label, current, entities, onSelect, defaultLabel = "All (Taylor & Francis)" }: Readonly<{
  label: string; current: string; entities: EntityMeta[]; onSelect: (id: string) => void; defaultLabel?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutside(() => setOpen(false));
  const currentName = entities.find((e) => e.id === current)?.name ?? (current === "__all__" ? defaultLabel : current);
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return entities.filter((e) => e.name.toLowerCase().includes(ql) || (e.full ?? "").toLowerCase().includes(ql)).slice(0, 80);
  }, [entities, q]);
  const pick = (id: string) => { onSelect(id); setOpen(false); setQ(""); };
  return (
    <div className="select-wrap" ref={ref}>
      <button className="select-btn" onClick={() => setOpen((o) => !o)}>
        <span className="lbl">{label}</span>
        <span className="val">{currentName}</span>
        <span aria-hidden style={{ color: "var(--muted)" }}>▾</span>
      </button>
      {open && (
        <div className="select-pop">
          <input className="select-search" placeholder="Search…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          {filtered.map((e) => (
            <button key={e.id} className={"opt" + (current === e.id ? " sel" : "")} onClick={() => pick(e.id)}>
              <span className="opt-name">{e.name}</span>
              <span className="o-sub">{fmtFull(e.mentions)}m · {fmtFull(e.publications)}p</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="card-note" style={{ padding: 10 }}>No match.</div>}
        </div>
      )}
    </div>
  );
}
