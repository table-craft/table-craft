// Browser runtime: the same game-module contract as the server, evaluated in a Function scope.
// This is for local play, demos and prototyping with your own code — it is not a sandbox for untrusted modules.
import { GameModuleBase } from '../core/module.js';

function functionSandbox() {
  const env = Object.create(null);
  return {
    set: (k, v) => { env[k] = v; },
    get: (k) => env[k],
    // eslint-disable-next-line no-new-func
    exec: (code) => new Function('env', `with (env) {\n${code}\n}`)(env),
    // eslint-disable-next-line no-new-func
    run: (expr) => new Function('env', `with (env) { return (${expr}); }`)(env),
  };
}

export class LocalGameModule extends GameModuleBase {
  constructor(code) { super(code, functionSandbox()); }
}
