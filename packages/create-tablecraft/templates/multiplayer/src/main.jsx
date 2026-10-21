import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { connectRoom } from 'tablecraft';
import { TablecraftGame } from 'tablecraft/react';
import 'tablecraft/style.css';

// Room server URL: same origin by default (Vite proxies /socket.io to `npm run server`).
// Set VITE_SERVER_URL when the room server lives elsewhere, e.g. VITE_SERVER_URL=https://rooms.example.com.
const SERVER = import.meta.env.VITE_SERVER_URL || '';

// Join the room in the URL (?room=AB12CD), or open a new one and put its code in the URL so you can share the link.
async function roomCode() {
  const url = new URL(location.href);
  const existing = url.searchParams.get('room');
  if (existing) return existing;
  const res = await fetch(`${SERVER}/api/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error('Could not open a room. Is the room server running? (npm run server)');
  const { code } = await res.json();
  url.searchParams.set('room', code);
  history.replaceState(null, '', url);
  return code;
}

function playerName() {
  let name = '';
  try { name = localStorage.getItem('tablecraft:name') || ''; } catch { /* private mode */ }
  name = name || prompt('Your name?')?.trim() || 'Guest';
  try { localStorage.setItem('tablecraft:name', name); } catch { /* private mode */ }
  return name;
}

const root = createRoot(document.getElementById('app'));
const name = playerName();
roomCode()
  .then((room) => {
    const match = connectRoom({ io, url: SERVER, room, name });
    // The lobby: take a seat, let the host add bots, share the URL with friends, press Start.
    root.render(<TablecraftGame client={match} name={name} style={{ height: '100vh', borderRadius: 0 }} />);
  })
  .catch((e) => root.render(<p style={{ color: '#eee', font: '16px system-ui', padding: 24 }}>{e.message}</p>));
