// HUD strings. <Tabletop locale="tr" /> picks a built-in dictionary; `strings={{ ... }}` overrides single entries.
import { createContext, useContext } from 'react';

const en = {
  loading: 'Setting up the table…',
  yourTurn: 'Your turn',
  turnOf: 'Turn:',
  you: 'you',
  youSuffix: ' (you)',
  active: 'up',
  waiting: 'Waiting',
  decision: 'Your decision',
  clickToMove: 'Click: make the move',
  clickToZoom: 'Click: enlarge',
  result: 'Result',
  close: 'Close',
  closeEsc: 'Close (Esc)',
  enlarge: 'Enlarge',
  table: 'Table',
  // toolbar
  camTable: 'Overview (1)', camMe: 'My area (2)', camTop: 'Top-down (3)',
  log: 'Game log (L)', mute: 'Mute (M)', unmute: 'Unmute (M)', settings: 'Settings', help: 'Controls (?)', fullscreen: 'Fullscreen (F)', exitFullscreen: 'Exit fullscreen (F)',
  // spotlight
  queued: 'Moves waiting in line', hold: 'Hold', resume: 'Resume', skip: 'Skip (Space)',
  // log
  logTitle: 'Game log', copyLog: 'Copy the log to the clipboard', closeLog: 'Close (L)', logEmpty: 'Nothing yet. Moves will show up here.', newEntries: 'New entries', rolled: 'rolled', dice: 'Dice',
  filters: { all: 'All', moves: 'Moves', cards: 'Cards', dice: 'Dice' },
  // settings
  settingsTitle: 'Table settings', sound: 'Sound', animSpeed: 'Animation speed', cinematic: 'Cinematic', normal: 'Normal', fast: 'Fast',
  spotlight: 'Spotlight', spotlightHint: 'cards others reveal or play', big: 'Large', side: 'Side', off: 'Off',
  spotSelf: 'Show my own moves too', autoFocus: 'Point the camera at my area on my turn',
  quality: 'Graphics', high: 'High', performance: 'Performance',
  botPace: 'Bot pace', botPaceHint: 'host · for everyone', slow: 'Slow',
  // help
  controls: 'Controls',
  helpRows: [
    ['Drag', 'Rotate the table'], ['Right-drag · two fingers', 'Pan'], ['Wheel', 'Zoom'], ['Hover', 'Large card preview'],
    ['Click', 'Glowing objects make a move, others open a close-up'], ['Double-click', 'Reset the camera (on empty table)'],
    ['1 · 2 · 3', 'Camera: overview · my area · top-down'], ['L', 'Toggle the game log'], ['Space', 'Skip the current spotlight'],
    ['M', 'Mute / unmute'], ['F', 'Fullscreen'], ['Esc', 'Close the open window'], ['?', 'This help'],
  ],
  // result
  gameOver: 'Game over', youWon: 'You won!', won: (names) => `${names} won`, inspectTable: 'Inspect the table',
  // lobby
  lobby: 'Lobby', pickSeat: 'Pick a seat', sit: 'Sit', here: 'You are here', addBot: 'Bot', empty: 'empty', start: 'Start game', newGame: 'New game',
  hostHint: 'You are the host; start when everyone is seated.', guestHint: 'The host will start the game.', player: 'Player', connecting: 'Connecting…',
  // replays
  replay: 'Replay', rpPlay: 'Play (Space)', rpPause: 'Pause (Space)', rpBack: 'Previous move (←)', rpForward: 'Next move (→)',
  rpSpeed: 'Speed', rpViewer: 'Watch as', rpSpectator: 'Spectator', rpSetup: 'Setup', rpRejected: 'rejected',
  rpMove: (i, n) => `Move ${i} / ${n}`, rpDiverged: (n) => `This replay no longer matches the original game from move ${n} (the rules or the game data changed).`,
  // spotlight verbs (n = number of cards)
  verbs: {
    mixed: 'made a move',
    discard: () => 'discarded a card',
    flip: (n) => (n > 1 ? `revealed ${n} cards` : 'revealed a card'),
    take: (n) => (n > 1 ? `took ${n} cards` : 'took a card'),
    deal: (n) => (n > 1 ? `put ${n} cards on the table` : 'put a card on the table'),
    play: (n) => (n > 1 ? `played ${n} cards` : 'played a card'),
    give: (n) => (n > 1 ? `gave ${n} cards` : 'gave a card'),
    moveCard: () => 'moved a card',
    show: () => 'is showing a card',
  },
};

const tr = {
  loading: 'Masa hazırlanıyor…',
  yourTurn: 'Sıra sende',
  turnOf: 'Sıra:',
  you: 'sen',
  youSuffix: ' (sen)',
  active: 'sırada',
  waiting: 'Bekleniyor',
  decision: 'Kararın',
  clickToMove: 'Tıkla: hamleyi yap',
  clickToZoom: 'Tıkla: büyüt',
  result: 'Sonuç',
  close: 'Kapat',
  closeEsc: 'Kapat (Esc)',
  enlarge: 'Büyüt',
  table: 'Masa',
  camTable: 'Genel bakış (1)', camMe: 'Benim alanım (2)', camTop: 'Kuşbakışı (3)',
  log: 'Oyun günlüğü (L)', mute: 'Sesi kapat (M)', unmute: 'Sesi aç (M)', settings: 'Ayarlar', help: 'Kontroller (?)', fullscreen: 'Tam ekran (F)', exitFullscreen: 'Tam ekrandan çık (F)',
  queued: 'Sırada bekleyen hamleler', hold: 'Sabitle', resume: 'Devam et', skip: 'Geç (Boşluk)',
  logTitle: 'Oyun Günlüğü', copyLog: 'Günlüğü panoya kopyala', closeLog: 'Kapat (L)', logEmpty: 'Henüz kayıt yok. Hamleler burada akacak.', newEntries: 'Yeni kayıtlar', rolled: 'attı', dice: 'Zar',
  filters: { all: 'Tümü', moves: 'Hamleler', cards: 'Kartlar', dice: 'Zar' },
  settingsTitle: 'Masa ayarları', sound: 'Ses', animSpeed: 'Animasyon hızı', cinematic: 'Sinematik', normal: 'Normal', fast: 'Hızlı',
  spotlight: 'Sahne Önü', spotlightHint: 'rakiplerin açtığı/oynadığı kartlar', big: 'Büyük', side: 'Kenarda', off: 'Kapalı',
  spotSelf: 'Kendi hamlelerimi de göster', autoFocus: 'Sıra bana gelince kamerayı alanıma çevir',
  quality: 'Grafik kalitesi', high: 'Yüksek', performance: 'Performans',
  botPace: 'Bot temposu', botPaceHint: 'oda sahibi · herkes için', slow: 'Yavaş',
  controls: 'Kontroller',
  helpRows: [
    ['Sürükle', 'Masayı döndür'], ['Sağ tık · iki parmak', 'Kaydır'], ['Tekerlek', 'Yakınlaş / uzaklaş'], ['Üzerine gel', 'Kartın büyük önizlemesi'],
    ['Tıkla', 'Parlayan objede hamle yap, diğerlerini incele'], ['Çift tık', 'Boş masada kamerayı sıfırla'],
    ['1 · 2 · 3', 'Kamera: genel bakış · benim alanım · kuşbakışı'], ['L', 'Oyun günlüğünü aç/kapat'], ['Boşluk', 'Sahne Önü’ndeki hamleyi geç'],
    ['M', 'Sesi aç/kapat'], ['F', 'Tam ekran'], ['Esc', 'Açık pencereyi kapat'], ['?', 'Bu yardım'],
  ],
  gameOver: 'Oyun bitti', youWon: 'Kazandın!', won: (names) => `${names} kazandı`, inspectTable: 'Masayı incele',
  lobby: 'Lobi', pickSeat: 'Koltuğunu seç', sit: 'Otur', here: 'Buradasın', addBot: 'Bot', empty: 'boş', start: 'Oyunu başlat', newGame: 'Yeni oyun',
  hostHint: 'Oda sahibisin; herkes oturunca başlat.', guestHint: 'Oda sahibi oyunu başlatacak.', player: 'Oyuncu', connecting: 'Masaya bağlanılıyor…',
  replay: 'Tekrar', rpPlay: 'Oynat (Boşluk)', rpPause: 'Duraklat (Boşluk)', rpBack: 'Önceki hamle (←)', rpForward: 'Sonraki hamle (→)',
  rpSpeed: 'Hız', rpViewer: 'Kimin gözünden', rpSpectator: 'İzleyici', rpSetup: 'Kurulum', rpRejected: 'reddedildi',
  rpMove: (i, n) => `Hamle ${i} / ${n}`, rpDiverged: (n) => `Bu tekrar ${n}. hamleden itibaren orijinal oyunla eşleşmiyor (kurallar ya da oyun verisi değişmiş).`,
  verbs: {
    mixed: 'hamle yaptı',
    discard: () => 'kart attı',
    flip: (n) => (n > 1 ? `${n} kart açtı` : 'kart açtı'),
    take: (n) => (n > 1 ? `${n} kart aldı` : 'kart aldı'),
    deal: (n) => (n > 1 ? `masaya ${n} kart açtı` : 'masaya kart açtı'),
    play: (n) => (n > 1 ? `${n} kart oynadı` : 'kart oynadı'),
    give: (n) => (n > 1 ? `${n} kart verdi` : 'kart verdi'),
    moveCard: () => 'kart taşıdı',
    show: () => 'kart gösteriyor',
  },
};

export const LOCALES = { en, tr };
export const DATE_LOCALES = { en: 'en-GB', tr: 'tr-TR' };

export function buildStrings(locale = 'en', overrides) {
  const base = LOCALES[locale] || en;
  const s = { ...en, ...base, ...(overrides || {}) };
  s.verbs = { ...en.verbs, ...base.verbs, ...(overrides?.verbs || {}) };
  s.filters = { ...en.filters, ...base.filters, ...(overrides?.filters || {}) };
  s.dateLocale = DATE_LOCALES[locale] || undefined;
  return s;
}

export const StringsContext = createContext(buildStrings('en'));
export const useStrings = () => useContext(StringsContext);
