// Code editor for the playground. CodeMirror 6 is loaded at runtime from esm.sh (exact versions, shared deps pinned
// so there is one copy of @codemirror/state) — the npm package gains no dependency. If the CDN is unreachable, a
// small textarea editor with line numbers and the site's highlighter takes over.
//
// API: { getValue(), setValue(text), focus(), setError(line | null), goTo(line), kind }
import { highlight } from '../highlight.js';

const V = {
  state: '@codemirror/state@6.7.5',
  view: '@codemirror/view@6.43.12',
  language: '@codemirror/language@6.12.4',
  commands: '@codemirror/commands@6.11.1',
  autocomplete: '@codemirror/autocomplete@6.20.3',
  search: '@codemirror/search@6.7.2',
  lint: '@codemirror/lint@6.9.7',
  highlight: '@lezer/highlight@1.2.3',
  common: '@lezer/common@1.5.2',
  lr: '@lezer/lr@1.4.10',
  lezerJs: '@lezer/javascript@1.5.4',
  js: '@codemirror/lang-javascript@6.2.5',
};
// esm.sh builds each package against the pinned versions of its (transitive) dependencies and names the build after
// that list, so every import below passes exactly its own closure: then the URL we load is the very URL the other
// packages import internally, and the browser evaluates one copy of each.
const DIRECT = {
  state: [], common: [], view: ['state'], highlight: ['common'], lr: ['common'], lezerJs: ['common', 'highlight', 'lr'],
  language: ['state', 'view', 'common', 'highlight', 'lr'], commands: ['state', 'view', 'language', 'common'],
  autocomplete: ['state', 'view', 'language', 'common'], search: ['state', 'view'], lint: ['state', 'view'],
  js: ['common', 'lint', 'view', 'state', 'lezerJs', 'language', 'autocomplete'],
};
function closure(k, out = new Set()) { for (const d of DIRECT[k]) if (!out.has(d)) { out.add(d); closure(d, out); } return out; }
function cdn(k) {
  const deps = [...closure(k)].map((d) => V[d]).sort();
  return `https://esm.sh/${V[k]}${deps.length ? `?deps=${deps.join(',')}` : ''}`;
}

export async function createEditor(parent, { value = '', onChange, onRun } = {}) {
  try {
    return await withTimeout(codeMirror(parent, { value, onChange, onRun }), 8000);
  } catch (e) {
    console.warn('[playground] CodeMirror unavailable, using the basic editor:', e.message);  
    parent.textContent = '';
    return basicEditor(parent, { value, onChange, onRun });
  }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

async function codeMirror(parent, { value, onChange, onRun }) {
  const imp = (k) => import(/* @vite-ignore */ cdn(k));
  const [S, Vw, L, C, A, Se, H, J] = await Promise.all(['state', 'view', 'language', 'commands', 'autocomplete', 'search', 'highlight', 'js'].map(imp));
  const { EditorState, StateEffect, StateField } = S;
  const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, Decoration, highlightSpecialChars, rectangularSelection, dropCursor } = Vw;
  const { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } = L;
  const { defaultKeymap, history, historyKeymap, indentWithTab } = C;
  const { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } = A;
  const { searchKeymap, highlightSelectionMatches } = Se;
  const { tags: t } = H;

  // colours from the site's highlighter (.tk-*), so editor and docs read the same
  const style = HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#6b7385', fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string), t.regexp], color: '#a8d49a' },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier], color: '#e2b96f' },
    { tag: [t.number, t.bool, t.null, t.atom], color: '#f0a46e' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#8cc4f0' },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: '#d7dce6' },
    { tag: [t.typeName, t.className, t.tagName], color: '#e79bd0' },
    { tag: [t.operator, t.punctuation, t.bracket], color: '#9aa3b5' },
    { tag: t.variableName, color: '#eef1f6' },
  ]);
  const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '13.2px', backgroundColor: 'transparent', color: '#d7dce6' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: '#e2b96f', padding: '10px 0' },
    '.cm-cursor': { borderLeftColor: '#e2b96f', borderLeftWidth: '2px' },
    '.cm-gutters': { backgroundColor: '#0a0c11', color: '#4d5566', border: 'none', borderRight: '1px solid rgba(255,255,255,.06)' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,.035)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,.04)', color: '#c9d0dc' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(226,185,111,.22) !important' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(140,196,240,.14)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(226,185,111,.18)', outline: '1px solid rgba(226,185,111,.4)' },
    '.cm-error-line': { backgroundColor: 'rgba(240,100,90,.14)', boxShadow: 'inset 3px 0 0 #f0645a' },
    '.cm-foldGutter .cm-gutterElement': { color: '#4d5566' },
    '.cm-tooltip': { background: '#151923', border: '1px solid rgba(255,255,255,.16)', borderRadius: '8px', color: '#eef1f6' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'rgba(226,185,111,.22)', color: '#fff' },
    '.cm-panels': { background: '#11141b', color: '#eef1f6', borderTop: '1px solid rgba(255,255,255,.09)' },
    '.cm-panel input, .cm-panel button': { font: 'inherit', fontSize: '12px' },
    '.cm-searchMatch': { backgroundColor: 'rgba(226,185,111,.25)' },
  }, { dark: true });

  const setErr = StateEffect.define();
  const errorField = StateField.define({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const e of tr.effects) {
        if (!e.is(setErr)) continue;
        if (e.value == null) deco = Decoration.none;
        else {
          const line = tr.state.doc.line(Math.min(Math.max(1, e.value), tr.state.doc.lines));
          deco = Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(line.from)]);
        }
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  parent.textContent = ''; // drop the loading message
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), foldGutter(), highlightSpecialChars(), history(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), closeBrackets(), autocompletion(),
        rectangularSelection(), highlightActiveLine(), highlightSelectionMatches(), indentUnit.of('  '), EditorState.tabSize.of(2),
        syntaxHighlighting(style), J.javascript(), theme, errorField,
        keymap.of([
          { key: 'Mod-Enter', preventDefault: true, run: () => { onRun?.(); return true; } },
          { key: 'Mod-s', preventDefault: true, run: () => { onRun?.(); return true; } },
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab,
        ]),
        EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
      ],
    }),
  });

  const goTo = (line) => {
    const l = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    view.focus();
  };
  return {
    kind: 'codemirror',
    getValue: () => view.state.doc.toString(),
    setValue: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, effects: setErr.of(null), selection: { anchor: 0 }, scrollIntoView: true }),
    focus: () => view.focus(),
    setError: (line) => view.dispatch({ effects: setErr.of(line ?? null) }),
    goTo,
  };
}

// ------------------------------------------------------------------ fallback: textarea + highlighted overlay
function basicEditor(parent, { value, onChange, onRun }) {
  parent.classList.add('ed-basic');
  parent.innerHTML = '<div class="ed-gutter" aria-hidden="true"></div><div class="ed-body"><pre class="ed-hl" aria-hidden="true"><code></code></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Game module source"></textarea></div>';
  const gutter = parent.querySelector('.ed-gutter');
  const hl = parent.querySelector('.ed-hl code');
  const pre = parent.querySelector('.ed-hl');
  const ta = parent.querySelector('textarea');
  let errLine = null; let lines = 0;

  const paint = () => {
    const text = ta.value;
    hl.innerHTML = `${highlight(text)}\n`;
    const n = text.split('\n').length;
    if (n !== lines || errLine) {
      lines = n;
      gutter.innerHTML = Array.from({ length: n }, (_, i) => `<span${i + 1 === errLine ? ' class="err"' : ''}>${i + 1}</span>`).join('');
    }
  };
  const sync = () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; };
  ta.value = value; paint();
  ta.addEventListener('input', () => { paint(); onChange?.(ta.value); });
  ta.addEventListener('scroll', sync);
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) { e.preventDefault(); onRun?.(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = ta;
      if (a === b && !e.shiftKey) { document.execCommand('insertText', false, '  ') || ta.setRangeText('  ', a, b, 'end'); }
      else {
        // indent / outdent the selected lines
        const start = ta.value.lastIndexOf('\n', a - 1) + 1;
        const block = ta.value.slice(start, b);
        const next = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
        ta.setSelectionRange(start, b);
        if (!document.execCommand('insertText', false, next)) ta.setRangeText(next, start, b, 'select');
        ta.setSelectionRange(start, start + next.length);
      }
      paint(); onChange?.(ta.value);
    }
  });
  const lineHeight = () => parseFloat(getComputedStyle(ta).lineHeight) || 21;
  return {
    kind: 'basic',
    getValue: () => ta.value,
    setValue: (text) => { ta.value = text; errLine = null; paint(); ta.scrollTop = 0; sync(); },
    focus: () => ta.focus(),
    setError: (line) => { errLine = line ?? null; lines = -1; paint(); },
    goTo: (line) => {
      const idx = ta.value.split('\n').slice(0, Math.max(0, line - 1)).join('\n').length + (line > 1 ? 1 : 0);
      ta.focus(); ta.setSelectionRange(idx, idx);
      ta.scrollTop = Math.max(0, (line - 6) * lineHeight()); sync();
    },
  };
}
