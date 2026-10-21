// Tiny JS/JSX highlighter for the landing page (no dependencies). Good enough for short, trusted snippets.
const KW = /^(?:import|from|export|default|const|let|var|function|return|if|else|for|of|in|new|await|async|try|catch|throw|class|extends)$/;
const RULES = [
  ['c', /^\/\/[^\n]*/],
  ['s', /^(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/],
  ['t', /^<\/?[A-Z][A-Za-z]*/],
  ['n', /^\b\d+(?:\.\d+)?\b/],
  ['w', /^[A-Za-z_$][\w$]*/],
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(code) {
  let out = ''; let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    let hit = null;
    for (const [k, re] of RULES) { const m = rest.match(re); if (m) { hit = [k, m[0]]; break; } }
    if (!hit) { out += esc(code[i]); i += 1; continue; }
    const [k, text] = hit;
    if (k === 'w') {
      const isCall = code[i + text.length] === '(';
      out += KW.test(text) ? `<span class="tk-k">${text}</span>` : isCall ? `<span class="tk-f">${text}</span>` : text;
    } else out += `<span class="tk-${k}">${esc(text)}</span>`;
    i += text.length;
  }
  return out;
}

export function highlightAll(root) {
  root.querySelectorAll('pre code.js').forEach((el) => { el.innerHTML = highlight(el.textContent); });
}

// shell snippets: comments and the command name
export function highlightShell(code) {
  return code.split('\n').map((line) => {
    const e = esc(line);
    if (/^\s*#/.test(line)) return `<span class="tk-c">${e}</span>`;
    const m = e.match(/^(\s*)(\S+)(.*?)(\s+#.*)?$/);
    if (!m) return e;
    return `${m[1]}<span class="tk-f">${m[2]}</span>${m[3]}${m[4] ? `<span class="tk-c">${m[4]}</span>` : ''}`;
  }).join('\n');
}
