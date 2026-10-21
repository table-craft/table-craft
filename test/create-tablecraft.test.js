// create-tablecraft: scaffold every template non-interactively and check the result (files, renames, names, rules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate, simulate, summarize } from '../src/server/index.js';

const CLI = fileURLToPath(new URL('../packages/create-tablecraft/index.js', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v22' } });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-tablecraft-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

for (const template of ['dice', 'cards', 'multiplayer']) {
  test(`create-tablecraft --template ${template}`, () => {
    const name = `my-${template}-game`;
    const r = run([name, '--template', template, '--yes'], tmp);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /pnpm install/);          // next steps use the detected package manager
    assert.match(r.stdout, /pnpm dev/);

    const dir = path.join(tmp, name);
    const files = ['package.json', 'index.html', 'vite.config.js', 'README.md', '.gitignore', '.mcp.json', 'src/main.jsx', 'src/game.js'];
    if (template === 'multiplayer') files.push('server.js');
    for (const f of files) assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
    assert.ok(!fs.existsSync(path.join(dir, '_gitignore')) && !fs.existsSync(path.join(dir, '_mcp.json')), 'template files not renamed');

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, name);
    for (const d of ['tablecraft', 'react', 'react-dom', 'three', 'cannon-es']) assert.ok(pkg.dependencies[d], `dependency ${d}`);
    for (const s of ['dev', 'build', 'preview', 'validate', 'simulate', 'balance']) assert.ok(pkg.scripts[s], `script ${s}`);
    if (template === 'multiplayer') assert.ok(pkg.scripts.server && pkg.dependencies['socket.io'] && pkg.dependencies['socket.io-client']);
    assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), new RegExp(`^# ${name}`));
    assert.ok(!fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes('%PROJECT_NAME%'));

    const source = fs.readFileSync(path.join(dir, 'src/game.js'), 'utf8');
    const info = validate(source);
    assert.equal(info.referee.finished, info.referee.games);
    const rep = simulate(source, { games: 40 });
    assert.ok(rep.ok, summarize(rep));
  });
}

test('create-tablecraft refuses a non-empty directory unless --force', () => {
  const dir = path.join(tmp, 'taken');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
  const refused = run(['taken', '--yes'], tmp);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /not empty/);
  assert.ok(!fs.existsSync(path.join(dir, 'package.json')));

  const forced = run(['taken', '--yes', '--force'], tmp);
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'src/game.js')));
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'keep me');
});

test('create-tablecraft rejects unknown templates and prints help', () => {
  const bad = run(['x', '--template', 'chess', '--yes'], tmp);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Unknown template "chess"/);
  const help = run(['--help'], tmp);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--template/);
});
