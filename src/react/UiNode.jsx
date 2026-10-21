// Declarative 2D UI nodes used in hud.prompt / hud.panels (and for non-3D views):
// col, row, panel, text, badge, divider, button, form, scores, log, grid, cards. See docs/hud.md.
import { useState } from 'react';

const SIZE = { sm: 12, md: 14, lg: 17, xl: 22 };

function Form({ node, onMove }) {
  const [v, setV] = useState({});
  // submit.move: "moveName" or { name, args } (fixed args are merged with the form values)
  const m = node.submit?.move;
  const name = typeof m === 'string' ? m : m?.name;
  const fixed = typeof m === 'object' && m ? m.args || {} : {};
  return (
    <form className="tc-ui-form" onSubmit={(e) => { e.preventDefault(); onMove({ name, args: { ...fixed, ...v } }); setV({}); }}>
      {(node.fields || []).map((f) => (
        <label key={f.id} className="tc-ui-field" style={{ minWidth: f.kind === 'number' ? 90 : 150 }}>{f.label}
          {f.kind === 'select'
            ? <select value={v[f.id] ?? ''} onChange={(e) => setV({ ...v, [f.id]: e.target.value })}><option value="">—</option>{(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : <input type={f.kind === 'number' ? 'number' : 'text'} min={f.min} max={f.max} placeholder={f.placeholder} value={v[f.id] ?? ''} onChange={(e) => setV({ ...v, [f.id]: e.target.value })} />}
        </label>
      ))}
      <button className="tc-ui-btn primary">{node.submit?.label || 'OK'}</button>
    </form>
  );
}

export default function UiNode({ node, onMove }) {
  if (!node || typeof node !== 'object') return null;
  const kids = (node.children || []).map((c, i) => <UiNode key={i} node={c} onMove={onMove} />);
  switch (node.type) {
    case 'col': return <div className="tc-ui-col" style={{ gap: node.gap ?? 10, alignItems: node.align }}>{kids}</div>;
    case 'row': return <div className="tc-ui-row" style={{ gap: node.gap ?? 10, alignItems: node.align, flexWrap: node.wrap === false ? 'nowrap' : 'wrap' }}>{kids}</div>;
    case 'panel': return <div className="tc-ui-panel" style={{ borderTop: node.accent ? `4px solid ${node.accent}` : undefined }}>{node.title && <h3>{node.title}</h3>}<div className="tc-ui-col">{kids}</div></div>;
    case 'text': return <div className="tc-ui-text" style={{ fontSize: SIZE[node.size] || 14, fontWeight: node.bold ? 700 : 400, color: node.muted ? undefined : node.color, opacity: node.muted ? 0.65 : 1 }}>{node.text}</div>;
    case 'badge': return <span className="tc-ui-badge" style={{ background: node.bg, color: node.color }}>{node.text}</span>;
    case 'divider': return <div className="tc-ui-hr" />;
    case 'button': return <button className={`tc-ui-btn ${node.variant === 'danger' ? 'danger' : node.variant === 'ghost' ? '' : 'primary'}`} disabled={node.disabled} onClick={() => node.move && onMove(node.move)}>{node.label}</button>;
    case 'form': return <Form node={node} onMove={onMove} />;
    case 'scores': return <div className="tc-ui-scores">{(node.items || []).map((s, i) => <div key={i} className="tc-ui-score" style={{ background: s.color || '#475569' }}>{s.label}<b>{s.value}</b></div>)}</div>;
    case 'log': return <div className="tc-ui-log" style={{ maxHeight: 200 }}>{(node.entries || []).map((e, i) => <div key={i}>{e}</div>)}</div>;
    case 'grid': return (
      <div className="tc-ui-grid" style={{ gridTemplateColumns: `repeat(${node.cols || 5}, minmax(0,1fr))` }}>
        {(node.cells || []).map((c, i) => (
          <div key={i} className={`tc-ui-cell ${c.move && !c.disabled ? 'click' : ''}`} onClick={() => c.move && !c.disabled && onMove(c.move)}
            style={{ background: c.bg || '#fff', color: c.color || '#1f2328', borderColor: c.border || 'transparent', opacity: c.faded ? 0.82 : 1, minHeight: node.cellHeight || 60 }}>
            {c.badge && <span className="tc-ui-bdg">{c.badge}</span>}
            <div>{c.label}{c.sub && <div className="tc-ui-sub">{c.sub}</div>}</div>
          </div>
        ))}
      </div>
    );
    case 'cards': return (
      <div className="tc-ui-cards">
        {(node.cards || []).map((c, i) => (
          <div key={i} className={`tc-ui-card ${c.move && !c.disabled ? 'click' : ''} ${c.selected ? 'selected' : ''}`} onClick={() => c.move && !c.disabled && onMove(c.move)} style={{ background: c.bg, color: c.color }}>
            <b>{c.title}</b><div className="tc-ui-small" style={{ flex: 1 }}>{c.text}</div>{c.footer && <div className="tc-ui-small tc-ui-muted">{c.footer}</div>}
          </div>
        ))}
      </div>
    );
    default: return <pre className="tc-ui-pre">{JSON.stringify(node)}</pre>;
  }
}
