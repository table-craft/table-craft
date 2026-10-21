# Security policy

## Supported versions

Tablecraft is pre-1.0. Security fixes land on the latest `0.x` minor release only.

| Version | Supported |
|---|---|
| latest `0.x` | ✅ |
| older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through
[GitHub Security Advisories](https://github.com/table-craft/table-craft/security/advisories/new) ("Report a
vulnerability"). Include a minimal game module or script that reproduces the problem, the affected version and the
impact you expect.

You will get an acknowledgement within 3 working days and a first assessment within 10. Once a fix is released we
credit the reporter in the advisory and the [CHANGELOG](CHANGELOG.md), unless you prefer to stay anonymous.

## Threat model — what counts

Tablecraft runs game modules on the host and sends each player only their own `view()`. In scope:

- **Hidden-information leaks**: a client can learn state that its `view()` does not contain (wire protocol, fx,
  replays, spotlight, error messages).
- **Intent forgery**: a client acts as another player, acts out of turn without the module allowing it, or changes state
  without going through a move.
- **Escaping the rules kit**: a module reaches host-realm objects through `T`, `ctx` or values the runtime passes in.
- **Room server denial of service** by a regular client (oversized payloads, unbounded rooms, crashes).
- Determinism bugs that let a client predict the seeded RNG from information it is allowed to see.

Out of scope:

- **Hostile game modules on the server.** Modules run in `node:vm` with code generation disabled and per-call time
  limits, but `node:vm` is **not** a security boundary. If you accept modules from untrusted authors, run the runtime
  in its own process or container with resource limits (see [Server → Security](docs/server.md#security)).
- Moves that forget to validate `ctx.args` — that is a bug in the game module, not in the engine.
- The browser runtime (`createLocalMatch`), which runs your own module inside your own page.
