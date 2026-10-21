// Physics dice roll (cannon-es). The result is decided on the SERVER; here the roll is pre-simulated, the server's
// value is placed on the die's resting top face and the recording is replayed (visually real physics).
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { assignDieTop, topSlotOf } from './meshes';

const STEP = 1 / 120;

export function simulateRoll(dice, { origin, target, trayR = 14, rand = Math.random }) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -981, 0) });
  world.allowSleep = true;
  const dieMat = new CANNON.Material('die');
  const tableMat = new CANNON.Material('table');
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, tableMat, { friction: 0.35, restitution: 0.38 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.2, restitution: 0.4 }));
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: tableMat });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  // tray rim (invisible tall ring): dice are thrown inside the ring and cannot escape
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const wall = new CANNON.Body({ mass: 0, material: tableMat, shape: new CANNON.Box(new CANNON.Vec3(trayR * 0.2, 20, 1)) });
    wall.position.set(target.x + Math.cos(a) * (trayR + 1), 20, target.z + Math.sin(a) * (trayR + 1));
    wall.quaternion.setFromEuler(0, -a + Math.PI / 2, 0);
    world.addBody(wall);
  }
  const dir = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
  const dist = Math.max(1, dir.length()); dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const bodies = dice.map((d, i) => {
    const s = d.size / 2;
    const isBox = d.box;
    const shape = isBox ? new CANNON.Box(new CANNON.Vec3(s, s, s)) : new CANNON.Sphere(s * 0.9);
    const b = new CANNON.Body({ mass: 2, shape, material: dieMat, linearDamping: 0.08, angularDamping: 0.12 });
    b.sleepSpeedLimit = 1.2; b.sleepTimeLimit = 0.25;
    // released just above the tray rim on the roller's side and flung toward the opposite edge
    const off = (i - (dice.length - 1) / 2) * d.size * 1.5;
    const back = Math.min(dist, trayR * 0.7);
    b.position.set(target.x - dir.x * back + side.x * off, 9 + rand() * 3 + i * 0.5, target.z - dir.z * back + side.z * off);
    b.quaternion.setFromEuler(rand() * 6.28, rand() * 6.28, rand() * 6.28);
    const sp = (110 + trayR * 4) * (0.8 + rand() * 0.4);
    b.velocity.set(dir.x * sp + (rand() - 0.5) * 30, 10 + rand() * 25, dir.z * sp + (rand() - 0.5) * 30);
    b.angularVelocity.set((rand() - 0.5) * 50, (rand() - 0.5) * 50, (rand() - 0.5) * 50);
    world.addBody(b);
    return b;
  });
  const frames = []; const hits = [];
  let t = 0;
  bodies.forEach((b, i) => b.addEventListener('collide', (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 15) hits.push({ t, v: Math.min(1, v / 300), die: i });
  }));
  for (let step = 0; step < 120 * 5; step++) {
    world.step(STEP);
    t += STEP;
    if (step % 2 === 0) frames.push(bodies.map((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
    if (step > 60 && bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING || b.velocity.length() < 0.5 && b.angularVelocity.length() < 0.5)) break;
  }
  return { frames, hits, fps: 60 };
}

// roll player for the dice meshes in the scene
export class DiceRoll {
  constructor(entries, sim, audio, onDone) {
    this.entries = entries; // [{ mesh, value, isBox }]
    this.sim = sim; this.audio = audio; this.onDone = onDone;
    this.t = 0; this.hitIdx = 0; this.done = false;
    const last = sim.frames[sim.frames.length - 1];
    entries.forEach((e, i) => {
      if (!e.isBox) return;
      const q = new THREE.Quaternion(last[i][3], last[i][4], last[i][5], last[i][6]);
      assignDieTop(e.mesh, topSlotOf(q), e.value);
    });
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const { frames, fps, hits } = this.sim;
    const fi = Math.min(frames.length - 1, Math.floor(this.t * fps));
    const fr = frames[fi];
    this.entries.forEach((e, i) => {
      const f = fr[i];
      e.mesh.position.set(f[0], f[1], f[2]);
      e.mesh.quaternion.set(f[3], f[4], f[5], f[6]);
    });
    while (this.hitIdx < hits.length && hits[this.hitIdx].t <= this.t) { this.audio?.impact(hits[this.hitIdx].v, 'dice'); this.hitIdx++; }
    if (fi >= frames.length - 1) { this.done = true; this.onDone?.(); }
  }
}
