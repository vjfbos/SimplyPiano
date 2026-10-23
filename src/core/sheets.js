// Opslag van akkoordenbladen (per Spotify-nummer of handmatig), gedeeld door alle profielen.
import { db } from './store.js';

export const getSheet = (id) => db.get('chordsheets', id);
export const deleteSheet = (id) => db.delete('chordsheets', id);

export async function listSheets() {
  return (await db.all('chordsheets')).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveSheet(sheet) {
  const record = { offset: 0, text: '', ...sheet, updatedAt: Date.now() };
  await db.put('chordsheets', record);
  return record;
}

export const sheetIdForTrack = (trackId) => 'sp-' + trackId;
