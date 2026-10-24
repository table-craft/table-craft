import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const game = 'examples/coin-flip-duel/game.js';
const cli = 'src/cli.js';
const run = (...args) => execFileSync(process.execPath, [cli, ...args], {
  cwd: root,
  encoding: 'utf8',
  timeout: 15000,
});

test('CLI --time accepts seconds for simulation, balance analysis, and sweeps', () => {
  // 100,000 games is intentional: the short time limit, not a completed run, must stop the simulation.
  const simulation = run('simulate', game, '--games', '100000', '--time', '0.01');
  assert.match(simulation, /\d+ games ·/);
  assert.doesNotMatch(simulation, /100000 games ·/);

  const balance = run('balance', game, '--games', '100000', '--time', '0.01');
  assert.match(balance, /stopped early at the time limit/);

  const sweep = run('balance', game, '--games', '100000', '--time', '0.01', '--sweep', 'options.target=1,2');
  assert.match(sweep, /Sweep options\.target/);
  assert.match(sweep, /1\s+2/);
});

test('CLI rejects invalid --time values for simulation and balance', () => {
  const invalidValues = ['0', '-1', 'NaN', 'Infinity', '-Infinity', 'not-a-number', null];
  for (const command of ['simulate', 'balance']) {
    for (const value of invalidValues) {
      const args = [cli, command, game, '--time'];
      if (value !== null) args.push(value);
      const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 15000 });
      assert.equal(result.status, 1, `${command} --time ${value ?? '(missing)'} should exit 1`);
      assert.match(result.stderr, /--time must be a positive finite number of seconds/);
      assert.doesNotMatch(result.stderr, /\n\s+at /, 'expected a concise error without a traceback');
    }
  }
});

test('CLI usage lists --time for simulate and balance', () => {
  const usage = run();
  assert.match(usage, /simulate <game\.js>[^\n]*\[--time <seconds>\]/);
  assert.match(usage, /balance <game\.js>[^\n]*\[--time <seconds>\]/);
  assert.match(usage, /\[--json\]/);
});

test('CLI --json prints parseable reports for simulate, audit, balance, and sweeps', () => {
  for (const args of [
    ['simulate', game, '--games', '2', '--json'],
    ['audit', game, '--games', '1', '--json'],
    ['balance', game, '--games', '2', '--json'],
    ['balance', game, '--games', '2', '--sweep', 'options.target=1,2', '--json'],
  ]) {
    assert.doesNotThrow(() => JSON.parse(run(...args)));
  }
});
