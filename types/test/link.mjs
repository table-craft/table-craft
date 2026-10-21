// Links types/test/node_modules/tablecraft → the package root, so the type tests resolve `tablecraft`,
// `tablecraft/react`, `/// <reference types="tablecraft/game" />` … through package.json "exports" like an install.
// (Run by `npm run typecheck` as pretypecheck; node_modules is git-ignored and types/test is not published.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const link = path.join(here, 'node_modules', 'tablecraft');
let ok = false;
try { ok = fs.realpathSync(link) === fs.realpathSync(root); } catch { /* missing or broken */ }
if (!ok) {
  fs.rmSync(link, { force: true, recursive: false });
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(root, link, 'junction');
}
