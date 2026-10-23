# Toetsentuin 🌱🎹

Een webapp (PWA) om piano te leren spelen op een echt keyboard of een akoestische piano,
met directe feedback per noot. Voor kinderen en volwassen beginners. Eigen ontwerp,
eigen code en eigen lesstof. Liedjes komen uit het publieke domein, in eigen bewerkingen.

- **Invoer:** MIDI-keyboard (Web MIDI, via USB of Bluetooth), microfoon (eigen YIN-toonhoogtedetectie),
  scherm-toetsenbord (touch/muis, meerdere vingers tegelijk) en het computertoetsenbord (A–L, Z/X = octaaf).
- **Leerpad:** 6 units en 20 lessen: houding en vingers → noten lezen rechts → links → ritme → akkoorden → beide handen.
- **Liedjes:** 24 stukken uit het publieke domein (kinderliedjes, klassiek, volksmuziek, feest), elk in 2 of 3 niveaus,
  met **zoeken** (titel, componist, alternatieve titels, accentongevoelig) en filters op categorie en niveau.
- **Eigen nummers (vrije keuze):** importeer een **MIDI-bestand** (handen verdelen per spoor of op middel-C,
  maatbereik kiezen), of **voer zelf noten in** door ze te typen of op je keyboard in te spelen. Exporteren en
  importeren kan als .json. Eigen nummers blijven alleen op het apparaat.
- **Oefenmodi:** wachtmodus, tempomodus met metronoom en timingbeoordeling, tempo 50–100%,
  een passage herhalen, links/rechts/beide handen, de andere hand laten meespelen, en een luistermodus.
- **Feedback:** goed / fout / te vroeg / te laat / gemist, steeds met kleur **én** symbool en tekst.
  Na afloop krijg je sterren, nauwkeurigheid, timing en tips.
- **Voortgang:** dagelijkse oefenreeks, oefentijd per week, behaalde lessen. Meerdere profielen op één apparaat,
  alles lokaal opgeslagen in IndexedDB. Je hebt geen account nodig.
- **Begeleiding:** metronoom, drumgroove en akkoordbegeleiding, allemaal gesynthetiseerd met de Web Audio API.
- **Akkoorden van elk nummer:** zoek online akkoorden (Ultimate Guitar) of plak een akkoordenblad van een
  willekeurige site. Lees het blad mee met transponeren, tik op een akkoord om het te horen en te zien, en oefen:
  in de wachtmodus, op tempo met metronoom en begeleiding, of mee met een opname (met ingetikte tijden).
- **PWA:** installeerbaar en na het eerste bezoek volledig offline te gebruiken.

## Ontwerp

De app is ontworpen voor kinderen vanaf een jaar of 8, en blijft prettig voor volwassenen:

- **Drie tabbladen:** *Leren* (de tuin), *Spelen* (liedjes en akkoorden) en *Ik* (reeks, sterren en profiel).
- **De tuin:** elke les is een plantje op een kronkelpad. Het groeit met je sterren: kiemplantje → knop → bloem.
- **Tiko:** een eigen getekende plantjes-mascotte die in korte zinnen uitlegt wat je moet doen en reageert op
  je spel.
- **Les in stapjes:** uitleg komt in kaartjes van een paar zinnen, met *Verder*. Daarna volgt de oefening.
- **Rustige speler:** één grote speelknop, *Rustig* (🐢) of *Op de maat* (🐇), en *L / R* voor de handen.
  Snelheid, herhalen en begeleiding staan in een onderblad *Opties*. Tijdens het spelen verdwijnt het menu
  (focusmodus), zodat er alleen een terugknop overblijft.
- **Ouderslot:** de instellingen open je via *Ik → Voor ouders*, door de knop 2 seconden ingedrukt te houden.
- **Huisstijl:** een eigen iconenset (SVG), het lettertype Nunito, grote "indrukbare" knoppen, een licht en een
  donker thema, en minder beweging als het apparaat daarom vraagt (*reduced motion*).

## Snel starten

```bash
npm install
npm run dev          # ontwikkelserver op http://localhost:5173 (ook bereikbaar op je netwerk)
npm test             # unit-tests (parser, engine, scoring, YIN)
npm run check-content  # controleert alle lessen en liedjes
npm run build        # productiebuild in dist/ (controleert eerst de content)
npm run preview      # productiebuild lokaal bekijken, inclusief service worker
```

> Microfoon en MIDI werken alleen via **https** of op **localhost**. Wil je testen op een iPad in je
> thuisnetwerk? Gebruik dan de Netlify-deploy (zie onderaan), want een `http://192.168…`-adres krijgt geen
> microfoontoegang.

## Architectuur

```
index.html                 app-shell
vite.config.js             build + plugin die de offline-precachelijst in sw.js invult
netlify.toml               build- en headerinstellingen voor Netlify
netlify/functions/chords.mjs  serverfunctie: akkoorden zoeken en ophalen (omzeilt CORS)
public/
  manifest.webmanifest     PWA-manifest
  sw.js                    service worker (offline)
  icons/                   eigen app-icoon (SVG + PNG)
  content/
    index.json             volgorde van units, lessen en liedjes
    lessons/*.json         één bestand per les
    songs/*.json           één bestand per liedje (met niveaus)
scripts/check-content.mjs  validator voor de content
src/
  main.js                  router (hash-URL's), navigatie, profielcontrole
  styles.css               huisstijl (licht en donker thema)
  core/
    notes.js               notatie-parser, noot ↔ MIDI, maatsoorten
    chords.js              akkoordsymbolen → noten
    piece.js               stuk-model: partijen, maten, gecombineerde tijdlijn
    content.js             laadt JSON-content en eigen nummers
    arrange.js             automatische niveaus (basnoten/akkoorden links) en notatie-schrijver
    midifile.js            MIDI-bestanden lezen en omzetten naar notatie
    search.js              zoeken in de bibliotheek
    chordsheet.js          akkoordvolgorde met tijden, akkoordherkenning, score
    chordtext.js           akkoordenbladen van websites: akkoordregels herkennen, vereenvoudigen, transponeren
    chordsource.js         zoeken/inladen via de Netlify-functie
    sheets.js              opslag van akkoordenbladen
    clock.js               oefenklok (start/pauze/spoelen)
    store.js               IndexedDB-wrapper
    profiles.js            profielen, instellingen, resultaten, oefentijd, reeks
  input/
    hub.js                 centrale invoerbus (noteon/noteoff met tijdstempel)
    midi.js                Web MIDI
    mic.js                 microfoon: aanslagdetectie + YIN
    yin.js                 YIN-toonhoogtealgoritme
    computerKeys.js        computertoetsenbord als piano
    manager.js             kiest invoerbronnen op basis van de instellingen
  audio/
    audio.js               AudioContext, mixer, iOS-ontgrendeling
    synth.js               gesynthetiseerde pianoklank
    drums.js               metronoomklik, kick, snare, hihat
    accompaniment.js       begeleidingspatronen
    scheduler.js           vooruitkijkende planner voor strakke timing
  practice/
    engine.js              oefen-engine (wachtmodus / tempomodus / herhalen / handen)
    scoring.js             beoordeling, sterren en tips
  ui/
    dom.js                 mini DOM-helper
    icons.js               eigen iconenset (SVG)
    mascot.js              Tiko, de mascotte
    sheet.js               onderblad en schakelaars
    keyboard.js            scherm-toetsenbord
    staff.js               notenbalk (VexFlow) met cursor en kleuren
    player.js              oefenscherm dat alles koppelt
    views/                 leerpad, les, liedjes (+ zoeken), editor voor eigen nummers, akkoorden,
                           voortgang, profielen, instellingen
tests/                     Vitest-tests
```

**Gegevensstroom:** elke invoerbron stuurt `noteon`-events naar `input/hub.js`, met een tijdstempel in de
klok van `performance.now()`. De `PracticeEngine` vergelijkt die met de verwachte noten uit de tijdlijn
(`core/piece.js`) en stuurt events (`cursor`, `note`, `feedback`, `finish` …). Notenbalk, toetsenbord en
feedbackregel luisteren daarnaar. De engine kent geen DOM, daardoor is hij volledig te testen.

**Timing in de tempomodus:** geluiden (aftellen, metronoom, begeleiding, andere hand) worden met
een lookahead-planner op de Web Audio-klok gezet. Gespeelde noten worden vergeleken in milliseconden;
de vensters schalen mee met het tempo (`scoring.js → timingWindows`). Met *Latentiecorrectie* in de
instellingen compenseer je de vertraging van Bluetooth-MIDI of de microfoon.

**Microfoon:** het signaal wordt per 20 ms geanalyseerd. Na halvering van de samplefrequentie bepaalt
YIN (de Cheveigné & Kawahara, 2002) de grondtoon. Een eigen toestandsmachine herkent aanslagen:
een nieuwe stabiele toonhoogte, of dezelfde toon die na een dip in volume opnieuw aanzwelt. De
microfoon herkent **één noot tegelijk**: speel akkoordnoten dan kort na elkaar (de wachtmodus
accepteert dat). Standaard telt een octaaffout als goed, omdat boventonen van een piano de detectie soms
een octaaf laten verspringen.

## Per stap testen

1. **Eerste keer en wachtmodus:** `npm run dev`, vul een naam in, kies een dier en druk op *Laten we beginnen!*.
   Tik in de tuin op het plantje met *Start!*, lees Tiko's uitleg (*Verder*) en kies *Probeer het!*. Druk op de
   groene speelknop en tik de gekleurde toets aan. Speel je een verkeerde noot, dan zegt Tiko "Oeps, dat was …".
   Na de laatste noot krijg je sterren, en het plantje in de tuin groeit.
2. **MIDI:** sluit een keyboard aan (Chrome of Edge op desktop, of Chrome op Android). Ga naar *Ik → Voor ouders*
   (knop 2 seconden vasthouden), kies *MIDI-keyboard* of *Automatisch* en geef toestemming. Bij *Test je
   invoer* zie je de gespeelde noten. Klinkt je keyboard zelf al? Zet dan "Speel zelf geluid af bij MIDI" uit.
3. **Microfoon (iPad/iPhone/akoestische piano):** open de site via https en kies in de ouderinstellingen
   *Microfoon*. Speel losse noten en kijk of het niveau en de herkende noot kloppen.
4. **Op de maat:** kies in een les of liedje 🐇 *Op de maat*. Na vier tikjes aftellen loopt de cursor mee en
   zie je "Iets te vroeg" of "Iets te laat". Met *Opties → Snelheid* zet je het tempo lager.
5. **Stukje oefenen en handen:** open bijvoorbeeld *Spelen → Vader Jacob → Moeilijk*. Kies *L*, open *Opties* en
   zet *Steeds herhalen* aan met maat 3 tot en met 4. Druk op de speelknop; na elk rondje begint het stukje
   opnieuw.
6. **Begeleiding:** in *Opties* zet je drums of akkoorden aan en kies je *Op de maat*. Met *Luister* speelt de
   app het hele stuk voor.
7. **Profielen en voortgang:** onder *Ik* zie je je reeks, sterren en weekrondjes. Met *Wissel van speler* maak
   je een tweede profiel; elk profiel heeft zijn eigen tuin.
8. **Offline/PWA:** `npm run build && npm run preview`, open de pagina één keer en zet je netwerk uit
   (of kies "Offline" in de DevTools). Herlaad: alles blijft werken. In Safari kies je *Deel → Zet op
   beginscherm*, in Chrome *Installeren*.
9. **Zoeken en eigen nummers:** typ bij *Liedjes* bijvoorbeeld "kerst" of "beethoven". Zoek je iets dat er
   niet in staat, dan kun je het meteen zelf toevoegen. Via *＋ Eigen nummer → MIDI-bestand importeren* kies je
   een .mid-bestand; controleer de handverdeling en de maten en druk op *Opslaan en spelen*. Bij *Zelf noten
   invoeren* zet je *Inspelen* aan, kies je een notenwaarde en speel je de noten. Onder *Controle en
   voorbeeld* zie je direct of alles klopt.
10. **Akkoorden:** ga naar *🎸 Akkoorden*, zoek bijvoorbeeld "eye of the tiger" en kies *Inladen*. Je kunt ook
   een akkoordenblad plakken. Tik bij *Blad* op een akkoord om het te horen. Kies bij *Oefenen* de modus
   *Wachten* en speel de akkoorden op je keyboard; daarna *Op tempo* met bijvoorbeeld 80 bpm.

Op een laptop kun je ook zonder keyboard testen: de toetsen **A W S E D F T G Y H U J K** spelen C4 t/m C5,
en met **Z/X** schuif je een octaaf omlaag of omhoog.

## Zelf content toevoegen

Content bestaat uit gewone JSON-bestanden in `public/content/`. Voeg een bestand toe, zet de id in
`index.json` en controleer alles met `npm run check-content`.

### Notenschrift

Noten scheid je met spaties, maatstrepen schrijf je als `|` (die worden gecontroleerd).

| Token | Betekenis |
|---|---|
| `E4/q` | kwartnoot E4 (middel-C = `C4`) |
| `F#4/h.` | gepunteerde halve noot Fis4 (`b` voor mol: `Bb3`) |
| `C4/8`, `C4/16` | achtste, zestiende |
| `C4/w` | hele noot |
| `r/q` | kwartrust (`r/h`, `r/8.` …) |
| `C4+E4+G4/h` | akkoord |
| `E4/q@3` | vingerzetting 3; bij een akkoord `@1+3+5` |

Akkoordbegeleiding (`chords`) geef je per maat op: `"C | G7 | C F | G C"`. Staan er meer akkoorden in één
maat, dan krijgen ze elk evenveel tellen. Mogelijke akkoorden zijn `C`, `Am`, `G7`, `Dm7`, `Fmaj7`, `Bdim`,
`Gsus4`, ook met `#` of `b`.

### Les (`public/content/lessons/<id>.json`)

```json
{
  "title": "Je eerste akkoord",
  "goal": "Het C-akkoord met de rechterhand",
  "explanation": ["Alinea 1, met **vet**.", "Alinea 2"],
  "tip": "Optionele tip",
  "stars": [60, 80, 95],
  "exercise": {
    "task": "Wat moet de leerling doen?",
    "tempo": 70,
    "timeSignature": "4/4",
    "key": "C",
    "hands": "rh",
    "mode": "wait",
    "allowModes": ["wait", "tempo"],
    "accompaniment": true,
    "parts": { "rh": "C4/q@1 D4/q@2 E4/h@3 | ...", "lh": "C3/w@5 | ..." },
    "chords": "C | G"
  }
}
```

- `hands`: `rh`, `lh` of `both` (welke hand standaard geoefend wordt)
- `mode`: `wait` of `tempo` (de beginmodus); met `allowModes` beperk je de keuze
- `stars`: minimale score voor 1, 2 en 3 sterren (standaard 60/80/95)
- `accompaniment: true` zet de akkoordbegeleiding standaard aan
- optioneel: `pickup` (opmaat in kwarttellen, bijv. `0.5`), en per partij een andere sleutel:
  `"lh": { "notes": "...", "clef": "treble" }`

### Liedje (`public/content/songs/<id>.json`)

De makkelijkste vorm: geef alleen een melodie en akkoorden. De app maakt dan zelf drie niveaus: melodie rechts,
met basnoten links, en met akkoorden links (in dezelfde liggingen als in de lessen).

```json
{
  "title": "London Bridge", "composer": "Engels kinderliedje", "category": "kinderliedjes",
  "aka": ["London Bridge is falling down"], "icon": "🌉", "hue": 200,
  "tempo": 100, "timeSignature": "4/4", "key": "C",
  "melody": "G4/q. A4/8 G4/q F4/q | E4/q F4/q G4/h | ...",
  "chords": "C | C | G | C",
  "lh": "optioneel: een eigen linkerhand voor niveau 3"
}
```

`category` is een van de ids uit `index.json → categories` (`kinderliedjes`, `klassiek`, `traditioneel`, `feest`);
`aka` zijn extra zoektermen. Wil je de niveaus helemaal zelf bepalen, gebruik dan `levels`:

```json
{
  "title": "…", "composer": "…", "icon": "🎵", "hue": 200, "about": "Optionele toelichting",
  "levels": [
    { "level": 1, "label": "Starter", "description": "Melodie rechts", "tempo": 90,
      "timeSignature": "4/4", "key": "C", "parts": { "rh": "…" }, "chords": "…" },
    { "level": 2, "description": "Met basnoten links", "tempo": 90, "timeSignature": "4/4", "key": "C",
      "parts": { "rh": "…", "lh": "…" } }
  ]
}
```

Toonsoorten voor `key`: `C`, `G`, `D`, `A`, `F`, `Bb`, `Eb`, `Am`, `Em`, `Dm`.
`tempo` is altijd in kwartnoten per minuut, ook in x/8-maten.

**Let op auteursrecht:** gebruik alleen melodieën uit het publieke domein, of eigen melodieën, en maak een
eigen bewerking.

## Akkoorden zoeken en oefenen

Onder **🎸 Akkoorden**:

1. **Zoeken:** typ een titel of artiest. De Netlify-functie `netlify/functions/chords.mjs` zoekt bij Ultimate
   Guitar en toont de akkoordversies, de best beoordeelde eerst. Met **Inladen** haal je het blad op.
2. **Link inladen:** plak een link van Ultimate Guitar, e-chords, Chordie, AZChords, GuitareTab, Cifra Club,
   Chordu of Boîte à chansons. Bij de andere sites zoekt de functie naar het `<pre>`-blok met de akkoorden.
3. **Plakken:** kopieer een akkoordenblad van welke site dan ook en plak het. De app herkent zelf welke regels
   akkoorden zijn en welke songtekst, inclusief kopjes (`[Chorus]`, `Intro:`) en herhalingen (`x2`).

Per blad zijn er drie tabbladen:
- **Blad:** de akkoorden boven de songtekst, met transponeren (en *capo → piano*). Tik op een akkoord om het
  te horen en de ligging op het toetsenbord te zien.
- **Oefenen:**
  - *Wachten*: het volgende akkoord komt pas als je het huidige goed speelt.
  - *Op tempo*: je kiest de bpm en het aantal tellen per akkoord, met aftellen, metronoom en zachte begeleiding.
  - *Met opname*: de akkoorden lopen mee met ingetikte tijden; je start de opname zelf, bijvoorbeeld op YouTube of cd.
  - Je kiest de ligging *rechts*, *links* of *basnoot + rechts*. Omkeringen tellen als goed, en je mag de noten
    ook na elkaar spelen (handig met de microfoon).
- **Bewerken:** pas de akkoordvolgorde aan en tik de tijden in voor *Met opname*.

Ongebruikelijke akkoorden worden voor het oefenen vereenvoudigd, zonder het karakter te veranderen: `E7#9` → `E7`,
`F#m11` → `F#m7`, `Cadd2` → `Cadd9`. Op het blad zie je het origineel.

**Lokaal:** `npm run dev` en `npm run preview` draaien de functie mee, via een Vite-plugin. Op Netlify wordt
hij automatisch gebouwd vanuit `netlify/functions/`. Zoeken werkt alleen online. Opgeslagen bladen blijven
offline beschikbaar.

**Let op:** akkoordensites veranderen soms hun pagina's of blokkeren automatische verzoeken. Geeft zoeken een
foutmelding, gebruik dan *Link inladen* of *Plakken*. Pas de uitleesfuncties zo nodig aan in
`netlify/functions/chords.mjs`; de tests in `tests/chordtext.test.js` laten zien welke paginastructuur verwacht
wordt. Bladen van deze sites vallen onder hun eigen voorwaarden en het auteursrecht van de makers; de app
haalt ze alleen op voor eigen gebruik.

## Hosten op Netlify

1. Zet deze repository op GitHub (dat is al gebeurd) en kies in Netlify **Add new site → Import an
   existing project**.
2. Netlify leest `netlify.toml`: build command `npm run build`, publish directory `dist`.
3. Na de deploy staat de app op `https://<naam>.netlify.app`. Daar werken microfoon, MIDI en
   installeren als app.

Je kunt ook zonder Git deployen: draai `npm run build` en sleep de map `dist/` naar
[app.netlify.com/drop](https://app.netlify.com/drop).

## Browserondersteuning

| | MIDI | Microfoon | Scherm | Installeren |
|---|---|---|---|---|
| Chrome / Edge (desktop, Android) | ✓ | ✓ | ✓ | ✓ |
| Safari (macOS, iPad, iPhone) | ✗ (Apple ondersteunt geen Web MIDI) | ✓ | ✓ | ✓ (Zet op beginscherm) |
| Firefox (desktop) | ✓ (vanaf versie 108, met toestemming) | ✓ | ✓ | – |

Tips voor iPad en iPhone:
- Zet de **stilteschakelaar** uit, anders hoor je geen geluid van de app.
- Speel met de microfoon bij voorkeur zonder koptelefoon-echo en met de begeleiding zacht of uit, omdat
  de microfoon ook het geluid uit de speaker hoort.
- Met een telefoon liggend zie je de notenbalk en het toetsenbord samen in beeld.

## Licenties

Gebruikte bibliotheken (alleen open licenties):

| Pakket | Gebruik | Licentie |
|---|---|---|
| [VexFlow](https://github.com/vexflow/vexflow) 5 | notenbalk | MIT |
| ↳ Bravura-font (meegeleverd in VexFlow) | muzieksymbolen | SIL Open Font License 1.1 |
| ↳ Academico-font (meegeleverd in VexFlow) | cijfers/tekst in de notenbalk | SIL Open Font License 1.1 |
| [Nunito](https://github.com/googlefonts/nunito) (meegeleverd in `src/assets/fonts`) | lettertype | SIL Open Font License 1.1 |
| [Vite](https://vitejs.dev) (alleen ontwikkeling) | build/dev-server | MIT |
| [Vitest](https://vitest.dev) (alleen ontwikkeling) | tests | MIT |

De muziekfonts vallen onder de SIL Open Font License. Dat is een open licentie speciaal voor
lettertypes: je mag ze vrij gebruiken, meeleveren en inbouwen in je app. Je mag ze alleen niet los
verkopen.

Er is geen Tone.js nodig: alle klanken (piano, drums, metronoom) worden met de standaard Web Audio API
gesynthetiseerd. De app gebruikt geen samples, geen externe CDN's en geen trackers.

Muziek: alle liedjes zijn composities uit het publieke domein (Beethoven †1827, Petzold †1733,
Pierpont †1893 en traditionele volksliedjes). De arrangementen, oefenmelodieën en lesteksten zijn
voor dit project geschreven.
