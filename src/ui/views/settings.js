// Instellingen: invoer (MIDI / microfoon / scherm), weergave, geluid en een microfoontest.
import { h, toast } from '../dom.js';
import { icon } from '../icons.js';
import { currentProfile, updateSettings } from '../../core/profiles.js';
import { applyInputSettings } from '../../input/manager.js';
import { midiState, enableMidi } from '../../input/midi.js';
import { onMicFrame, micActive, setMicSensitivity } from '../../input/mic.js';
import { hub } from '../../input/hub.js';
import { noteLabel } from '../../core/notes.js';
import { unlockAudio } from '../../audio/audio.js';

export async function settingsView() {
  const s = () => currentProfile().settings;
  const save = async (patch) => {
    await updateSettings(patch);
    const r = await applyInputSettings(s());
    if (r.mic && !r.mic.ok) toast(r.mic.error, 'error');
    if (r.midi?.error) toast(r.midi.error, 'error');
    renderStatus();
  };

  const radio = (name, value, label, desc, disabled) => h('label.option', { class: disabled ? 'disabled' : '' },
    h('input', { type: 'radio', name, value, checked: s()[name] === value, disabled, onchange: async () => {
      await unlockAudio();
      save({ [name]: value });
    } }),
    h('span', h('strong', label), desc ? h('small', desc) : null));

  const toggle = (key, label) => h('label.check', h('input', { type: 'checkbox', checked: !!s()[key], onchange: (e) => save({ [key]: e.target.checked }) }), label);

  const midi = midiState();
  const status = h('div.input-status', { role: 'status', 'aria-live': 'polite' });
  function renderStatus() {
    const m = midiState();
    status.replaceChildren(
      h('p', '🎹 MIDI: ', !m.supported ? 'niet beschikbaar in deze browser' : m.enabled ? (m.devices.length ? m.devices.join(', ') : 'geen apparaat gevonden — sluit je keyboard aan of zet Bluetooth-MIDI aan') : 'nog niet ingeschakeld'),
      h('p', '🎤 Microfoon: ', micActive() ? 'aan' : 'uit'));
  }
  renderStatus();
  const offStatus = hub.on('status', renderStatus);

  // microfoontest
  const meter = h('div.meter', h('div.meter-fill'), h('div.meter-thr'));
  const detected = h('div.detected', '–');
  const offFrame = onMicFrame(({ level, threshold, midi: m, freq }) => {
    meter.querySelector('.meter-fill').style.width = Math.min(100, level * 600) + '%';
    meter.querySelector('.meter-thr').style.left = Math.min(100, threshold * 600) + '%';
    detected.textContent = m != null ? `${noteLabel(m, s().noteLabels === 'solfege' ? 'solfege' : 'letters')} · ${freq.toFixed(1)} Hz` : '–';
  });
  const lastNotes = h('div.last-notes', { 'aria-live': 'polite' });
  const offNote = hub.on('noteon', ({ midi: m, source }) => {
    lastNotes.prepend(h('span.pill', `${noteLabel(m)} (${{ midi: 'MIDI', mic: 'mic', screen: 'scherm', keys: 'toetsen' }[source]})`));
    while (lastNotes.children.length > 8) lastNotes.lastChild.remove();
  });

  const latency = h('input', { type: 'range', min: 0, max: 250, step: 10, value: s().latencyMs, 'aria-label': 'Latentiecorrectie', onchange: () => save({ latencyMs: Number(latency.value) }), oninput: () => (latOut.textContent = latency.value + ' ms') });
  const latOut = h('output', s().latencyMs + ' ms');
  const sens = h('input', { type: 'range', min: 0.5, max: 2, step: 0.1, value: 1, 'aria-label': 'Gevoeligheid microfoon', oninput: () => setMicSensitivity(Number(sens.value)) });
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s().volume, 'aria-label': 'Volume', onchange: () => save({ volume: Number(vol.value) }) });

  const view = h('div.view.settings',
    h('a.btn.ghost.small', { href: '#/ik' }, icon('back', { size: 18 }), 'Terug'),
    h('h1', 'Instellingen voor ouders'),
    h('p.lead', 'Hier stel je in hoe de piano verbonden is en wat je kind ziet.'),
    h('section.card',
      h('h2', 'Hoe speel je?'),
      h('div.options',
        radio('input', 'auto', 'Automatisch', 'MIDI als dat kan, anders het scherm-toetsenbord'),
        radio('input', 'midi', 'MIDI-keyboard', midi.supported ? 'Via USB of Bluetooth. Werkt in Chrome, Edge en op Android.' : 'Niet beschikbaar in deze browser (Safari ondersteunt geen Web MIDI).', !midi.supported),
        radio('input', 'mic', 'Microfoon', 'Voor een akoestische piano of op iPad/iPhone. Herkent één noot tegelijk.'),
        radio('input', 'screen', 'Alleen scherm', 'Tik of klik op de toetsen. Op een computer kun je ook de letters A t/m L gebruiken.')),
      status,
      midi.supported ? h('button.btn', { type: 'button', onclick: () => enableMidi().then(renderStatus) }, 'MIDI opnieuw zoeken') : null,
      toggle('midiSound', 'Speel zelf geluid af bij MIDI (zet uit als je keyboard zelf klinkt)')),
    h('section.card',
      h('h2', 'Test je invoer'),
      h('p.hint', 'Speel een paar noten. Hieronder zie je wat de app hoort. Het microfoonniveau beweegt alleen als je hierboven "Microfoon" kiest.'),
      h('div.mic-test', h('span', 'Microfoonniveau'), meter, detected),
      h('label.range', 'Gevoeligheid microfoon ', sens),
      lastNotes),
    h('section.card',
      h('h2', 'Weergave'),
      h('div.options',
        radio('noteLabels', 'letters', 'Letters', 'C D E F G A B'),
        radio('noteLabels', 'solfege', 'Do-re-mi', 'do re mi fa sol la si'),
        radio('noteLabels', 'none', 'Geen namen', 'Toetsen zonder opschrift')),
      toggle('showFingers', 'Vingerzetting tonen'),
      toggle('micOctaveTolerant', 'Microfoon: octaafverschil goed rekenen (aanbevolen)')),
    h('section.card',
      h('h2', 'Geluid en timing'),
      h('label.range', 'Volume ', vol),
      h('label.range', 'Latentiecorrectie ', latency, latOut),
      h('p.hint', 'Zie je in de tempomodus vaak "te laat" terwijl je op de tel speelt? Verhoog dan de correctie (Bluetooth en microfoon hebben wat vertraging).')),
    h('section.card',
      h('h2', 'Leerpad'),
      toggle('unlockAll', 'Alle lessen ontgrendelen (bijv. voor ouders of als je al kunt spelen)')));
  view.destroy = () => {
    offFrame();
    offNote();
    offStatus();
  };
  return view;
}
