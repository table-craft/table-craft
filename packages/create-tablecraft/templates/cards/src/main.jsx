import { createRoot } from 'react-dom/client';
import { createLocalMatch } from 'tablecraft';
import { TablecraftGame } from 'tablecraft/react';
import 'tablecraft/style.css';
// The game module is passed as text: Tablecraft runs it in its own sandbox, not through the bundler.
import source from './game.js?raw';

// Everything runs in the browser: you against two bots (Night Market seats 2–4 players).
const match = createLocalMatch({ source, players: ['You', 'bot', 'bot'] });

createRoot(document.getElementById('app')).render(
  <TablecraftGame client={match} style={{ height: '100vh', borderRadius: 0 }} />,
);
