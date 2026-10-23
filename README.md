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
- **Meespelen met Spotify:** koppel je Spotify-account, kies een nummer en speel de akkoorden mee. De app
  volgt de afspeelpositie van Spotify, toont het huidige en het volgende akkoord op het toetsenbord en controleert
  of je ze op tijd speelt (omkeringen tellen mee). De akkoorden zet je er zelf in en tik je in op de muziek.
- **PWA:** installeerbaar en na het eerste bezoek volledig offline te gebruiken.

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
    chordsheet.js          akkoordenbladen: inlezen, tijden, akkoordherkenning, score bij meespelen
    sheets.js              opslag van akkoordenbladen
  spotify/
    auth.js                inloggen met OAuth PKCE, tokens verversen
    api.js                 wat speelt er, zoeken, afspelen/pauze/spoelen
    clock.js               afspeelpositie volgen (Spotify of handmatige klok)
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
    keyboard.js            scherm-toetsenbord
    staff.js               notenbalk (VexFlow) met cursor en kleuren
    player.js              oefenscherm dat alles koppelt
    views/                 leerpad, les, liedjes (+ zoeken), editor voor eigen nummers, meespelen (Spotify),
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

1. **Scherm-toetsenbord en wachtmodus:** `npm run dev`, maak een profiel, open les 1 en kies *Naar de
   oefening* → *Start*. Tik de oplichtende toets aan. Speel je een verkeerde noot, dan zie je "Fout: je
   speelde … · zoek …". Na de laatste noot verschijnen sterren en tips.
2. **MIDI:** sluit een keyboard aan (Chrome of Edge op desktop, of Chrome op Android). Ga naar
   *Instellingen*, kies *MIDI-keyboard* of *Automatisch* en geef toestemming. Bij *Test je invoer* zie je de
   gespeelde noten. Klinkt je keyboard zelf al? Zet dan "Speel zelf geluid af bij MIDI" uit.
3. **Microfoon (iPad/iPhone/akoestische piano):** open de site via https, kies *Microfoon* in de
   instellingen en sta de microfoon toe. Speel losse noten en kijk of het niveau en de herkende noot
   kloppen. Pas zo nodig de gevoeligheid aan.
4. **Tempomodus:** les 11 (Ritme). Na vier tikken aftellen loopt de cursor mee. Speel op de tik en kijk
   naar "te vroeg" en "te laat". Zet het tempo lager met de schuif.
5. **Passage en handen:** open bijvoorbeeld *Vader Jacob* niveau 3. Kies *Links*, open *Meer opties*, zet
   *Passage herhalen* aan met maat 3 t/m 4 en druk op *Start*: na elke ronde zie je een melding en begint
   de passage opnieuw.
6. **Begeleiding:** in *Meer opties* zet je drums of akkoorden aan en start je de tempomodus. Met *Luister*
   speelt de app het hele stuk voor.
7. **Profielen en voortgang:** maak een tweede profiel via het rondje rechtsboven. Voortgang, reeks en
   oefentijd houdt de app per profiel bij.
8. **Offline/PWA:** `npm run build && npm run preview`, open de pagina één keer en zet je netwerk uit
   (of kies "Offline" in de DevTools). Herlaad: alles blijft werken. In Safari kies je *Deel → Zet op
   beginscherm*, in Chrome *Installeren*.

9. **Zoeken en eigen nummers:** typ bij *Liedjes* bijvoorbeeld "kerst" of "beethoven". Zoek je iets dat er
   niet in staat, dan kun je het meteen zelf toevoegen. Via *＋ Eigen nummer → MIDI-bestand importeren* kies je
   een .mid-bestand; controleer de handverdeling en de maten en druk op *Opslaan en spelen*. Bij *Zelf noten
   invoeren* zet je *Inspelen* aan, kies je een notenwaarde en speel je de noten. Onder *Controle en
   voorbeeld* zie je direct of alles klopt.

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

## Meespelen met Spotify

**Wat kan wel en wat niet?** Spotify levert via de API geen akkoorden. De audio-analyse is in november 2024
uit de API gehaald, en de ontwikkelaarsvoorwaarden verbieden het analyseren van Spotify-content. De app haalt
akkoorden dus **niet** automatisch uit de muziek. Wat wel kan, en wat deze app doet:

1. **Verbinden** via OAuth met PKCE. Daarvoor is geen server of geheime sleutel nodig. De app vraagt alleen
   toestemming om te zien wat er speelt (`user-read-currently-playing`, `user-read-playback-state`) en om het
   afspelen te bedienen (`user-modify-playback-state`, alleen met Premium).
2. **Akkoorden invoeren** per nummer, bijvoorbeeld uit een songboek: `Am F C G x4`, met kopjes als `[Refrein]`.
3. **Meetikken:** start het nummer vanaf het begin en tik (of druk op de spatiebalk) bij elke akkoordwissel.
   Met de schuif *Synchronisatie* verschuif je alles een fractie eerder of later.
4. **Meespelen:** de app vraagt elke 1,5 seconde aan Spotify waar het nummer is en rekent daartussen zelf door.
   Je ziet *Nu* en *Straks*, de toetsen lichten op (rechts, links, of basnoot met akkoord), en na afloop krijg je
   een score met de akkoorden die je nog moet oefenen.

Zonder Premium start je het nummer gewoon in de Spotify-app (telefoon, computer of speaker); de app leest dan
alleen mee. Akkoordenbladen bewaart de app lokaal (IndexedDB). Met *Blad zonder Spotify* kun je ook oefenen met
een eigen klok, bijvoorbeeld bij een cd.

### Instellen (eenmalig)

1. Ga naar [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) en kies **Create app**
   (vink *Web API* aan).
2. Voeg als **Redirect URI** het adres van je app toe, met een `/` aan het eind:
   - lokaal: `http://127.0.0.1:5173/` (Spotify accepteert geen `localhost`; de app stuurt je automatisch door
     naar 127.0.0.1)
   - Netlify: `https://<jouw-site>.netlify.app/`
3. Vul de **Client ID** in op het scherm *Meespelen*. Je kunt hem ook in de build zetten met de omgevingsvariabele
   `VITE_SPOTIFY_CLIENT_ID` (lokaal in `.env.local`, of bij Netlify onder *Site configuration → Environment
   variables*).

Een nieuwe Spotify-app staat in *development mode*: alleen accounts die je in het dashboard onder *User
Management* toevoegt, mogen inloggen. Voor jezelf en je gezin is dat genoeg.

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
