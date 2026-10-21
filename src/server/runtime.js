// Server runtime: game modules run in a node:vm context with per-call timeouts.
// node:vm is a separate realm, not a hard security boundary — only run modules from authors you trust
// (or put the runtime in its own process/container).
import vm from 'node:vm';
import { GameModuleBase } from '../core/module.js';

export const CALL_TIMEOUT = 500;

function vmSandbox(timeout) {
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  return {
    set: (k, v) => { context[k] = v; },
    get: (k) => context[k],
    exec: (code, filename) => new vm.Script(code, { filename }).runInContext(context, { timeout: 2000 }),
    run: (expr, filename) => new vm.Script(expr, filename ? { filename } : undefined).runInContext(context, { timeout: filename ? 2000 : timeout }),
  };
}

export class GameModule extends GameModuleBase {
  constructor(code, { timeout = CALL_TIMEOUT } = {}) {
    super(code, vmSandbox(timeout));
  }
}
