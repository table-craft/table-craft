import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { connectRoom } from 'tablecraft';
import { TablecraftGame } from 'tablecraft/react';
import 'tablecraft/style.css';

const room = new URLSearchParams(location.search).get('room');
const name = localStorage.getItem('name') || prompt('Your name?') || 'Guest';
localStorage.setItem('name', name);

const client = connectRoom({ io, room, name });
createRoot(document.getElementById('app')).render(<TablecraftGame client={client} name={name} style={{ height: "100vh", borderRadius: 0 }} />);
