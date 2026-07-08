import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmt, fmtFull, type EntityMeta } from "./lib";

export function Card({ title, sub, span = 6, actions, note, children }: {
  title: string; sub?: string; span?: number; actions?: ReactNode; note?: string; children: ReactNode;
}) {
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

export function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="kpi">
      <div className="k-top"><span className="k-dot" style={{ background: color }} />{label}</div>
      <div className="k-val">{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  );
}

export function YearMulti({ years, selected, onChange }: {
  years: number[]; selected: number[]; onChange: (y: number[]) => void;
}) {
  const toggle = (y: number) => {
    const has = selected.includes(y);
    if (has && selected.length === 1) return; // keep at least one
    onChange(has ? selected.filter((x) => x !== y) : [...selected, y].sort());
  };
  return (
    <div className="yearsel" title="Publication year — pick any combination">
      <span className="yearsel-lbl">Publication&nbsp;year</span>
      {years.map((y) => (
        <button key={y} className={"yr" + (selected.includes(y) ? " on" : "")} onClick={() => toggle(y)}>
          {selected.includes(y) && <span className="yr-check">✓</span>}{y}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

export function RankedList({ items, metric }: {
  items: { name: string; sub?: string; value: number; value2?: string }[]; metric?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="rank">
      {items.length === 0 && <div className="card-note">No data for this selection.</div>}
      {items.map((it, i) => (
        <div className="row" key={i} title={it.name}>
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

export function EntitySelect({ label, current, entities, onSelect }: {
  label: string; current: string; entities: EntityMeta[]; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const currentName = current === "__all__" ? "All (Taylor & Francis)" : current;
  const filtered = useMemo(
    () => entities.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())),
    [entities, q]
  );
  return (
    <div className="select-wrap" ref={ref}>
      <button className="select-btn" onClick={() => setOpen((o) => !o)}>
        <span className="lbl">{label}</span>
        <span className="val">{currentName}</span>
        <span style={{ color: "var(--muted)" }}>▾</span>
      </button>
      {open && (
        <div className="select-pop">
          <input className="select-search" placeholder="Search…" value={q} autoFocus
            onChange={(e) => setQ(e.target.value)} />
          <div className={"opt" + (current === "__all__" ? " sel" : "")}
            onClick={() => { onSelect("__all__"); setOpen(false); }}>
            <span>All (Taylor & Francis)</span>
          </div>
          {filtered.map((e) => (
            <div key={e.id} className={"opt" + (current === e.id ? " sel" : "")}
              onClick={() => { onSelect(e.id); setOpen(false); }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              <span className="o-sub">{fmtFull(e.mentions)} mentions</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
