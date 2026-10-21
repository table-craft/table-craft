// The playground's game runtime: the same contract as LocalGameModule, but the module is compiled with a
// sourceURL so stack traces point at lines of *your* code, and every exception thrown by the module is reported.
import { GameModuleBase } from '../../../src/core/module.js';

const FILE = 'tablecraft-playground/game.js';
const FRAME = /tablecraft-playground\/game\.js:(\d+):(\d+)/;

function sandbox() {
  const env = Object.create(null);
  return {
    set: (k, v) => { env[k] = v; },
    get: (k) => env[k],
    // eslint-disable-next-line no-new-func
    exec: (code, filename) => new Function('env', `with (env) {\n${code}\n}\n//# sourceURL=${filename === 'game.js' ? FILE : filename}`)(env),
    // eslint-disable-next-line no-new-func
    run: (expr) => new Function('env', `with (env) { return (${expr}); }`)(env),
  };
}

// how many lines the Function wrapper adds in this browser (measured, not guessed)
let offset = null;
function lineOffset() {
  if (offset != null) return offset;
  offset = 3;
  try {
    // eslint-disable-next-line no-new-func
    new Function('env', `with (env) {\nthrow new Error('probe')\n}\n//# sourceURL=${FILE}`)({});
  } catch (e) {
    const m = String(e.stack || '').match(FRAME);
    if (m) offset = Number(m[1]) - 1;
  }
  return offset;
}

// → { message, line, col, kind } with line/col in the user's source (1-based), when the stack has them
export function describeError(e, where = '') {
  const message = (e && e.message) || String(e);
  const m = String((e && e.stack) || '').match(FRAME);
  const line = m ? Number(m[1]) - lineOffset() : null;
  return { message, line: line > 0 ? line : null, col: m ? Number(m[2]) : null, kind: e?.name === 'SyntaxError' ? 'syntax' : 'runtime', where };
}

export class PlaygroundModule extends GameModuleBase {
  constructor(code, { onError } = {}) {
    super(code, sandbox());
    this.onError = onError || null;
  }

  _call(expr, args) {
    try { return super._call(expr, args); } catch (e) {
      const fn = (expr.match(/__mod\.(\w+)/) || [])[1];
      const where = fn === 'moves' ? `move "${this.sb.get('__name')}"` : fn ? `${fn}()` : '';
      if (this.onError) this.onError(describeError(e, where));
      throw e;
    }
  }
}

// Compile → { mod } or { error }. Syntax errors are located by parsing the code once as a classic script (main
// thread only; V8 does not report positions for `new Function` syntax errors).
export async function compile(code, opts) {
  try {
    lineOffset();
    return { mod: new PlaygroundModule(code, opts) };
  } catch (e) {
    const err = describeError(e, 'load');
    if (e && e.name === 'SyntaxError' && err.line == null && typeof document !== 'undefined') {
      const at = await locateSyntaxError(code);
      if (at) Object.assign(err, at);
    }
    return { error: err };
  }
}

function locateSyntaxError(code) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([`(function () {\n${code}\n})`], { type: 'text/javascript' }));
    let found = null;
    const onErr = (ev) => {
      if (ev.filename !== url) return;
      ev.preventDefault();
      found = { line: Math.max(1, ev.lineno - 1), col: ev.colno || null, message: String(ev.message || '').replace(/^Uncaught\s+/, '').replace(/^SyntaxError:\s*/, '') };
    };
    const s = document.createElement('script');
    const done = () => { window.removeEventListener('error', onErr); s.remove(); URL.revokeObjectURL(url); resolve(found); };
    window.addEventListener('error', onErr);
    s.onload = done; s.onerror = done;
    s.src = url;
    document.head.append(s);
  });
}
