import test from 'node:test';
import assert from 'node:assert/strict';
import { T, checkScene } from '../src/server/index.js';
import { layoutScene, hexCenter, hexCorner } from '../src/engine/layout.js';

const H = T.hex;
const close = (a, b) => Math.abs(a - b) < 1e-6;

test('T.hex: neighbours, distance, rings and areas', () => {
  assert.deepEqual(H.neighbors('0,0'), ['1,0', '0,1', '-1,1', '-1,0', '0,-1', '1,-1']);
  assert.equal(H.distance('0,0', '2,-1'), 2);
  assert.equal(H.distance([3, -3], '-2,1'), 5);
  assert.equal(H.ring('0,0', 2).length, 12);
  assert.ok(H.ring('1,1', 2).every((k) => H.distance(k, '1,1') === 2));
  assert.equal(H.area('0,0', 3).length, 37);
  assert.equal(H.rect(5, 4).length, 20);
  assert.deepEqual(H.line('0,0', '3,0'), ['0,0', '1,0', '2,0', '3,0']);
});

test('T.hex: shared corners and edges get one canonical key', () => {
  // corner c of a cell = corner c+2 of neighbour c-1 = corner c+4 of neighbour c
  for (let c = 0; c < 6; c++) {
    const v = H.corner('2,-1', c);
    assert.equal(H.corner(H.neighbor('2,-1', c - 1), c + 2), v);
    assert.equal(H.corner(H.neighbor('2,-1', c), c + 4), v);
    assert.equal(H.cornerCells(v).length, 3);
    assert.ok(H.cornerCells(v).includes('2,-1'));
    assert.equal(H.edge('2,-1', c), H.edge(H.neighbor('2,-1', c), c + 3));
  }
  assert.equal(new Set(H.area('0,0', 1).flatMap(H.corners)).size, 24);
  assert.equal(new Set(H.area('0,0', 1).flatMap(H.edges)).size, 30);
  const v = H.corner('0,0', 1);
  assert.equal(H.cornerEdges(v).length, 3);
  assert.ok(H.cornerEdges(v).every((e) => H.edgeCorners(e).includes(v)));
  assert.equal(new Set(H.cornerNeighbors(v)).size, 3);
});

test('T.hex.path / T.findPath: cheapest route around blocked cells', () => {
  const map = new Set(H.area('0,0', 3));
  const wall = new Set(['1,0', '1,-1', '0,1']);
  const r = H.path('0,0', '2,0', (k) => map.has(k) && !wall.has(k));
  assert.ok(r && r.path[0] === '0,0' && r.path.at(-1) === '2,0');
  assert.ok(r.path.every((k) => !wall.has(k)));
  assert.equal(r.cost, r.path.length - 1);
  assert.equal(H.path('0,0', '9,9', (k) => map.has(k)), null);
  const g = { a: [['b', 5], ['c', 1]], c: [['b', 1]], b: [] };
  assert.deepEqual(T.findPath('a', 'b', (n) => g[n]), { path: ['a', 'c', 'b'], cost: 2 });
  assert.deepEqual(T.reachable('c', (n) => g[n]).sort(), ['b', 'c']);
});

test('layout: hex cells, corners, sides, stacking on tiles and links', () => {
  assert.ok(close(hexCorner(0, 1, 'pointy')[0], Math.sqrt(3) / 2));
  const [x1, z1] = hexCenter(1, 0, 5, 'pointy');
  assert.ok(close(Math.hypot(x1, z1), 5 * Math.sqrt(3)));
  const scene = {
    table: { center: false },
    zones: [{ id: 'map', layout: 'hex', hex: 5 }],
    objects: [
      { id: 't0', kind: 'hex', zone: 'map', cell: '0,0', terrain: 'mountain' },
      { id: 't1', kind: 'hex', zone: 'map', cell: '1,0', height: 0.5 },
      { id: 'u1', kind: 'token', zone: 'map', cell: '1,0' },
      { id: 'u2', kind: 'token', zone: 'map', cell: '1,0' },
      { id: 'city', kind: 'token', zone: 'map', vertex: H.corner('0,0', 0) },
      { id: 'road', kind: 'token', zone: 'map', edge: H.edge('0,0', 0) },
      { id: 'l', kind: 'link', from: 'city', to: { cell: '1,0' }, zone: 'map' },
    ],
  };
  const L = layoutScene(scene);
  const p = (id) => L.objects.get(id);
  assert.ok(close(p('t1').x, x1) && p('t1').hex.size === 5);
  assert.equal(p('u1').y, 0.5); // stands on its tile
  assert.ok(Math.hypot(p('u1').x - p('u2').x, p('u1').z - p('u2').z) > 2); // two pieces on one cell are spread
  assert.equal(p('city').y, 1.4); // the highest tile at that corner (mountain)
  assert.ok(close(p('road').x, (hexCorner(0, 5)[0] + hexCorner(1, 5)[0]) / 2));
  assert.ok(p('l').len > 0 && p('l').len < Math.hypot(p('city').x - x1, p('city').z));
  assert.deepEqual(checkScene({ type: 'tabletop', scene }), []);
});

test('checkScene: hex positions and link ends are validated', () => {
  const errs = checkScene({ type: 'tabletop', scene: { zones: [{ id: 'map', layout: 'hex' }], objects: [
    { id: 'a', kind: 'token', zone: 'map' },
    { id: 'b', kind: 'token', zone: 'map', cell: '1,0', corner: 7 },
    { id: 'c', kind: 'link', from: 'a', to: 'nope' },
  ] } });
  assert.equal(errs.length, 3);
  assert.match(errs.join('\n'), /no cell/);
  assert.match(errs.join('\n'), /nope/);
});
