// Globals of the game-module sandbox: the rules kit `T`, `clone`, `module` / `exports` and a silent `console`.
// Pulled in by `/// <reference types="tablecraft/game" />` at the top of a game file — never by the other entry points,
// so hosts importing `tablecraft` don't get a global `T`.
//
// `module`, `exports` and `console` are declared so that they merge with @types/node and lib.dom when those are present.

/** The rules kit (docs/rules-kit.md, docs/mechanics.md). */
declare const T: import('./kit.js').Kit;

/** Deep JSON copy (functions, `undefined` and class instances do not survive). */
declare function clone<V>(value: V): V;

/** The CommonJS-style module object a game file assigns: `module.exports = { meta, setup, moves, view, … }`. */
declare var module: NodeModule;

/** Shorthand for `module.exports` (rarely used: assign `module.exports` instead). */
declare var exports: any;

/** In the sandbox `console.log/warn/error` exist but print nothing. */
declare var console: Console;

/** The `module` object of a game file (merges with @types/node's `NodeModule`). */
interface NodeModule {
  /** Assign your game module here; annotate it with `@type {import('tablecraft/game').GameModule<State>}`. */
  exports: any;
}

/** The sandbox console (merges with lib.dom / @types/node). */
interface Console {
  /** No-op in the sandbox. */
  log(...data: any[]): void;
  /** No-op in the sandbox. */
  warn(...data: any[]): void;
  /** No-op in the sandbox. */
  error(...data: any[]): void;
}
