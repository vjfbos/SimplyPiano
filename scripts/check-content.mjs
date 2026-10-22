// Controleert alle lessen en liedjes: notatie, maatlengtes, akkoorden en verwijzingen in index.json.
// Gebruik: npm run check-content
import { readFile, readdir } from 'node:fs/promises';
import { buildPiece } from '../src/core/piece.js';

const dir = new URL('../public/content/', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, dir), 'utf8'));
let problems = 0;
const report = (where, msgs) => {
  for (const m of msgs) {
    console.log(`✗ ${where}: ${m}`);
    problems++;
  }
};

const index = await read('index.json');
const lessonFiles = new Set((await readdir(new URL('lessons/', dir))).map((f) => f.replace(/\.json$/, '')));
const songFiles = new Set((await readdir(new URL('songs/', dir))).map((f) => f.replace(/\.json$/, '')));

let count = 0;
for (const unit of index.units) {
  for (const id of unit.lessons) {
    if (!lessonFiles.has(id)) { report('index.json', [`les "${id}" bestaat niet in lessons/`]); continue; }
    const l = await read(`lessons/${id}.json`);
    const errs = [];
    if (!l.title) errs.push('geen title');
    if (!Array.isArray(l.explanation) || !l.explanation.length) errs.push('geen explanation (lijst met alinea\'s)');
    if (!l.exercise) errs.push('geen exercise');
    else errs.push(...buildPiece(l.exercise).errors);
    report(`lessons/${id}`, errs);
    lessonFiles.delete(id);
    count++;
  }
}
for (const id of index.songs) {
  if (!songFiles.has(id)) { report('index.json', [`liedje "${id}" bestaat niet in songs/`]); continue; }
  const s = await read(`songs/${id}.json`);
  if (!s.levels?.length) report(`songs/${id}`, ['geen levels']);
  for (const lv of s.levels || []) {
    const p = buildPiece(lv);
    report(`songs/${id} niveau ${lv.level}`, p.errors);
    if (p.parts.rh && p.parts.lh && Math.abs(p.parts.rh.length - p.parts.lh.length) > 1e-6) {
      report(`songs/${id} niveau ${lv.level}`, [`rechterhand (${p.parts.rh.length} tellen) en linkerhand (${p.parts.lh.length}) zijn niet even lang`]);
    }
  }
  songFiles.delete(id);
  count++;
}
for (const id of lessonFiles) console.log(`! lessons/${id}.json staat niet in index.json (wordt niet getoond)`);
for (const id of songFiles) console.log(`! songs/${id}.json staat niet in index.json (wordt niet getoond)`);

console.log(problems ? `\n${problems} probleem/problemen gevonden in ${count} items.` : `✓ ${count} items gecontroleerd, alles in orde.`);
process.exit(problems ? 1 : 0);
