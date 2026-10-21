#!/usr/bin/env node
// create-tablecraft — scaffold a Tablecraft game (Vite + React) in seconds.
//
//   npm create tablecraft@latest
//   npm create tablecraft@latest my-game -- --template cards
//   npx create-tablecraft my-game --template multiplayer --yes
//
// Zero dependencies: node:readline, node:fs, node:path and node:util only.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(HERE, 'templates');
const DEFAULT_NAME = 'my-tablecraft-game';
const RENAME = { _gitignore: '.gitignore', '_mcp.json': '.mcp.json' };

export const TEMPLATES = [
  { name: 'dice', label: 'Dice', hint: 'Dice Duel: one die, two players, first to 10. The smallest complete game.' },
  { name: 'cards', label: 'Cards', hint: 'Night Market: hidden hands, a deck, a discard pile and a face-up market.' },
  { name: 'multiplayer', label: 'Multiplayer', hint: 'Dice Duel + a socket.io room server to play with friends.' },
];

// ---------------------------------------------------------------- colours (NO_COLOR, FORCE_COLOR, non-TTY aware)
const useColor = (() => {
  if ('NO_COLOR' in process.env) return false;
  if ('FORCE_COLOR' in process.env) return process.env.FORCE_COLOR !== '0';
  return !!process.stdout.isTTY && process.env.TERM !== 'dumb';
})();
const paint = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
const c = {
  bold: paint(1, 22), dim: paint(2, 22), red: paint(31, 39), green: paint(32, 39), yellow: paint(33, 39),
  cyan: paint(36, 39), magenta: paint(35, 39), gray: paint(90, 39),
};
const sym = useColor ? { ok: '✔', err: '✖', q: '?', ptr: '❯', dot: '•' } : { ok: 'ok', err: 'x', q: '?', ptr: '>', dot: '-' };

class Cancelled extends Error {}

// ---------------------------------------------------------------- helpers
export function toValidPackageName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/^[._]/, '').replace(/[^a-z\d\-~]+/g, '-').replace(/^-+|-+$/g, '') || DEFAULT_NAME;
}
const isValidPackageName = (name) => /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(name);
const isEmpty = (dir) => { const files = fs.readdirSync(dir); return files.length === 0 || (files.length === 1 && files[0] === '.git'); };

export function detectPackageManager(ua = process.env.npm_config_user_agent || '') {
  const name = ua.split(' ')[0]?.split('/')[0];
  return ['pnpm', 'yarn', 'bun', 'npm'].includes(name) ? name : 'npm';
}
const runCmd = (pm, script) => (pm === 'npm' || pm === 'bun' ? `${pm} run ${script}` : `${pm} ${script}`);
const installCmd = (pm) => (pm === 'yarn' ? 'yarn' : `${pm} install`);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.DS_Store') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, RENAME[entry.name] || entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

// Copies a template and personalises it. Returns the list of files written (relative paths).
export function scaffold({ template, targetDir, packageName }) {
  const src = path.join(TEMPLATES_DIR, template);
  if (!fs.existsSync(src)) throw new Error(`Unknown template "${template}"`);
  copyDir(src, targetDir);
  const pkgFile = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.name = packageName;
  fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  for (const f of ['README.md', 'index.html']) {
    const file = path.join(targetDir, f);
    if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('%PROJECT_NAME%', packageName));
  }
  return pkg;
}

// ---------------------------------------------------------------- prompts
async function ask(question, def) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ac = new AbortController();
  rl.on('SIGINT', () => ac.abort());
  try {
    const answer = await rl.question(`${c.cyan(sym.q)} ${c.bold(question)} ${def ? c.gray(`(${def}) `) : ''}`, { signal: ac.signal });
    return answer.trim() || def;
  } catch (e) {
    if (e.name === 'AbortError') throw new Cancelled();
    throw e;
  } finally { rl.close(); }
}

async function select(question, items, initial = 0) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') { // fallback: numbered list
    items.forEach((it, i) => stdout.write(`  ${c.gray(`${i + 1}.`)} ${it.label} ${c.gray(`— ${it.hint}`)}\n`));
    for (;;) {
      const a = await ask(question, String(initial + 1));
      const i = Number(a) - 1; const byName = items.findIndex((it) => it.name === a);
      if (items[i]) return items[i]; if (byName >= 0) return items[byName];
      stdout.write(`${c.red(sym.err)} Pick 1–${items.length}\n`);
    }
  }
  let index = initial; let lines = 0;
  const render = (done) => {
    if (lines) stdout.write(`\x1b[${lines}A\x1b[0J`);
    const head = `${done ? c.green(sym.ok) : c.cyan(sym.q)} ${c.bold(question)} ${done ? c.cyan(items[index].label) : c.gray('(↑/↓, enter)')}\n`;
    const body = done ? '' : items.map((it, i) => (i === index ? `${c.cyan(sym.ptr)} ${c.cyan(c.bold(it.label))} ${c.gray(it.hint)}\n` : `  ${it.label}\n`)).join('');
    stdout.write(head + body);
    lines = done ? 0 : items.length + 1;
  };
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true); stdin.resume();
  stdout.write('\x1b[?25l');
  try {
    return await new Promise((resolve, reject) => {
      const onKey = (_, key = {}) => {
        if (key.ctrl && key.name === 'c') { stdin.off('keypress', onKey); reject(new Cancelled()); return; }
        if (key.name === 'up' || key.name === 'k') index = (index + items.length - 1) % items.length;
        else if (key.name === 'down' || key.name === 'j' || key.name === 'tab') index = (index + 1) % items.length;
        else if (/^[1-9]$/.test(key.sequence || '') && items[Number(key.sequence) - 1]) index = Number(key.sequence) - 1;
        else if (key.name === 'return' || key.name === 'enter') { stdin.off('keypress', onKey); render(true); resolve(items[index]); return; }
        render(false);
      };
      render(false);
      stdin.on('keypress', onKey);
    });
  } finally {
    stdout.write('\x1b[?25h');
    stdin.setRawMode(false); stdin.pause();
  }
}

// ---------------------------------------------------------------- main
const HELP = `${c.bold('create-tablecraft')} — start a Tablecraft game (Vite + React)

${c.bold('Usage')}
  npm create tablecraft@latest [dir] -- [options]
  npx create-tablecraft [dir] [options]

${c.bold('Options')}
  -t, --template <name>  ${TEMPLATES.map((t) => t.name).join(' | ')} (default: dice)
  -y, --yes              no prompts: use the defaults and the flags given
  -f, --force            write into a non-empty directory (existing files with the same name are overwritten)
  -h, --help             show this help
  -v, --version          print the version

${c.bold('Templates')}
${TEMPLATES.map((t) => `  ${c.cyan(t.name.padEnd(12))} ${t.hint}`).join('\n')}
`;

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: {
        template: { type: 'string', short: 't' }, yes: { type: 'boolean', short: 'y' }, force: { type: 'boolean', short: 'f' },
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) { throw new Error(`${e.message}\nRun with --help for usage.`); }
  const { values: opts, positionals } = args;
  if (opts.help) { process.stdout.write(HELP); return; }
  if (opts.version) { process.stdout.write(`${JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version}\n`); return; }

  const interactive = !opts.yes && !!process.stdin.isTTY && !!process.stdout.isTTY;
  if (opts.template && !TEMPLATES.some((t) => t.name === opts.template)) {
    throw new Error(`Unknown template "${opts.template}". Choose one of: ${TEMPLATES.map((t) => t.name).join(', ')}.`);
  }
  if (positionals.length > 1) throw new Error(`Expected one project directory, got: ${positionals.join(' ')}`);

  process.stdout.write(`\n${c.bold(c.magenta('◆ Tablecraft'))} ${c.gray('· write the rules, get the table')}\n\n`);

  // 1. project directory
  let dir = positionals[0]?.trim();
  if (!dir) dir = interactive ? await ask('Project name:', DEFAULT_NAME) : DEFAULT_NAME;
  dir = dir.replace(/[\\/]+$/, '') || '.';
  const targetDir = path.resolve(process.cwd(), dir);
  const base = path.basename(targetDir);
  let packageName = isValidPackageName(base) ? base : toValidPackageName(base);
  if (interactive && !isValidPackageName(base)) {
    for (;;) {
      packageName = await ask('Package name:', packageName);
      if (isValidPackageName(packageName)) break;
      process.stdout.write(`${c.red(sym.err)} Invalid package.json name\n`);
    }
  }

  // 2. target must be empty (or --force)
  if (fs.existsSync(targetDir)) {
    if (!fs.statSync(targetDir).isDirectory()) throw new Error(`${dir} exists and is not a directory.`);
    if (!isEmpty(targetDir) && !opts.force) {
      const where = dir === '.' ? 'The current directory' : `Directory ${c.bold(dir)}`;
      if (!interactive) throw new Error(`${where} is not empty. Pick another name or pass --force to write into it.`);
      const yes = /^y(es)?$/i.test(await ask(`${where} is not empty. Write into it anyway (same-name files are overwritten)? (y/N)`, ''));
      if (!yes) throw new Cancelled();
    }
  }

  // 3. template
  let template = TEMPLATES.find((t) => t.name === (opts.template || 'dice'));
  if (interactive && !opts.template) template = await select('Select a template:', TEMPLATES, 0);

  // 4. write
  scaffold({ template: template.name, targetDir, packageName });
  const pm = detectPackageManager();
  const rel = path.relative(process.cwd(), targetDir);
  process.stdout.write(`${interactive ? '\n' : ''}${c.green(sym.ok)} Scaffolded ${c.bold(packageName)} ${c.gray(`(${template.name})`)} in ${c.cyan(targetDir)}\n\n`);
  process.stdout.write(`${c.bold('Next steps:')}\n\n`);
  const steps = [];
  if (rel) steps.push(`cd ${rel.includes(' ') ? JSON.stringify(rel) : rel}`);
  steps.push(installCmd(pm));
  if (template.name === 'multiplayer') steps.push(`${runCmd(pm, 'server')}   ${c.gray('# terminal 1: room server')}`, `${runCmd(pm, 'dev')}      ${c.gray('# terminal 2: the table')}`);
  else steps.push(runCmd(pm, 'dev'));
  process.stdout.write(`${steps.map((s) => `  ${s}`).join('\n')}\n\n`);
  process.stdout.write(`${c.gray('Edit')} src/game.js${c.gray(', then check it with the referee:')} ${runCmd(pm, 'simulate')}\n`);
  process.stdout.write(`${c.gray('Docs:')} ${c.cyan('https://github.com/table-craft/table-craft/tree/main/docs')}\n\n`);
}

const isEntry = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) {
  main().catch((e) => {
    if (e instanceof Cancelled) { process.stdout.write(`\n${c.red(sym.err)} Operation cancelled\n`); process.exit(1); }
    process.stderr.write(`${c.red(sym.err)} ${e.message}\n`);
    process.exit(1);
  });
}
