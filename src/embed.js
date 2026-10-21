// tablecraft/embed — mount a full game into any DOM element without writing React yourself.
//
//   import { mountGame, createLocalMatch } from 'tablecraft/embed';
//   const match = createLocalMatch({ source, players: ['You', 'bot', 'bot'] });
//   const app = mountGame(document.getElementById('table'), { client: match });
//   app.unmount();
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { TablecraftGame } from './react/Game';

export { createLocalMatch } from './client/local.js';
export { connectRoom } from './client/room.js';

export function mountGame(el, props) {
  const root = createRoot(el);
  const render = (p) => root.render(createElement(TablecraftGame, p));
  render(props);
  return { update: (next) => render({ ...props, ...next }), unmount: () => root.unmount() };
}
