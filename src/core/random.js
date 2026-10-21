// Seeded, serialisable randomness (mulberry32). The state is a single uint32, so it can be stored next to the
// game state and every move is replayable.

function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, get state() { return a; } };
}

// `api` is what game code sees as `ctx.random`; `state()` is the seed to continue from on the next move.
export function makeRandom(seed) {
  const r = mulberry32(seed);
  const api = {
    float: () => r.next(),
    int: (n) => Math.floor(r.next() * n),
    shuffle: (arr) => {
      const a = Array.from(arr);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    pick: (arr) => arr[Math.floor(r.next() * arr.length)],
  };
  return { api, state: () => r.state };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
