// Shows a card face (spotlight, log, inspect window) as a crisp canvas using the engine's texture painter.
import { useEffect, useRef } from 'react';
import { Icon } from './icons';
import { useStrings } from '../i18n';

export function CardCanvas({ world, item, height, maxWidth, className = '', onClick, title }) {
  const ref = useRef(null);
  const key = item ? JSON.stringify([item.face, item.back, item.size, item.faceUp]) : '';
  useEffect(() => {
    const el = ref.current;
    if (!el || !world || !item) return;
    el.innerHTML = '';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = world.thumb(item, Math.round(height * dpr));
    if (!c) return;
    // landscape cards: shrink to fit maxWidth while keeping the aspect ratio
    const k = maxWidth ? Math.min(1, maxWidth / (c.width / dpr)) : 1;
    c.style.height = `${Math.round(height * k)}px`; c.style.width = 'auto'; c.style.display = 'block';
    el.appendChild(c);
  }, [world, key, height, maxWidth]); // eslint-disable-line
  return <div ref={ref} className={`tc-cardcv ${onClick ? 'click' : ''} ${className}`} onClick={onClick} title={title} />;
}

// large card inspect window (on clicking a card / from spotlight / from the log)
export function CardInspector({ world, item, onClose }) {
  const S = useStrings();
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!item) return null;
  const h = Math.min(640, Math.round(window.innerHeight * 0.68));
  return (
    <div className="tc-modal" onClick={onClose}>
      <div className="tc-inspect" onClick={(e) => e.stopPropagation()}>
        {item.canvas ? <CanvasHost canvas={item.canvas} height={h} /> : <CardCanvas world={world} item={item} height={h} />}
        {(item.tip || item.caption) && <div className="tc-inspect-tip">{item.tip || item.caption}</div>}
        <button className="tc-iconbtn tc-inspect-x" onClick={onClose} title={S.closeEsc}><Icon name="close" /></button>
      </div>
    </div>
  );
}

function CanvasHost({ canvas, height }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.innerHTML = '';
    canvas.style.height = `${height}px`; canvas.style.width = 'auto'; canvas.style.maxWidth = '86vw'; canvas.style.objectFit = 'contain';
    el.appendChild(canvas);
  }, [canvas, height]);
  return <div ref={ref} className="tc-cardcv" />;
}
