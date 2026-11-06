/*
  Language layer for DrumSplit, DrumHumanize and DrumTime.

  The pages are written in Danish. In English mode every text on the page
  (text, title, aria-label, placeholder) is translated as it appears, from
  the exact phrases and patterns below. Switching back restores the Danish.
*/
(function (root) {
  "use strict";

  const GROUP_EN = {
    "Stortromme": "Kick", "Lilletromme": "Snare", "Hihat": "Hi-hat", "Åben hihat": "Open hi-hat",
    "Tam-tam": "Tom", "Tam-tams": "Toms", "Bækkener": "Cymbals", "Crash": "Crash", "Ride": "Ride", "Percussion": "Percussion",
  };
  const NAME_EN = {
    "Intro": "Intro", "Vers": "Verse", "Omkvæd": "Chorus", "Pre-omkvæd": "Pre-chorus", "Bro": "Bridge",
    "Break": "Break", "Fill": "Fill", "Outro": "Outro", "Mellemspil": "Interlude",
  };
  const WHY_EN = {
    "kommer igen og spilles kraftigst": "comes back and is played hardest",
    "kommer igen, roligere end omkvædet": "comes back, calmer than the chorus",
    "den groove der kommer igen": "the groove that comes back",
    "kort og mest fills": "short and mostly fills",
    "kommer hver gang lige før omkvædet": "comes right before the chorus every time",
    "kommer igen, men hverken vers eller omkvæd": "comes back, but is neither verse nor chorus",
    "første del, spilles kun én gang": "first part, played only once",
    "sidste del, spilles kun én gang": "last part, played only once",
    "spilles kun én gang og meget roligere": "played only once and much calmer",
    "kort del der kun kommer én gang": "short part that comes only once",
    "spilles kun én gang, midt i sangen": "played only once, in the middle of the song",
  };

  const EXACT = {
    // shared
    "Eksempel": "Example", "Eksempelsang": "Example song", "Vælg MIDI-fil": "Choose MIDI file",
    "Oversigt": "Overview", "Spor med trommer": "Track with drums", "Trommekort": "Drum map",
    "Automatisk": "Automatic", "Tempo": "Tempo", "Taktart": "Time signature", "Længde": "Length",
    "BPM": "BPM", "BPM, fast": "BPM, steady", "ikke i filen": "not in the file", "gættet": "estimated",
    "fra filen": "from the file", "hele sangen": "whole song", "Noder i sporet": "Notes in the track",
    "Nulstil mine rettelser": "Reset my changes", "Ukendt node": "Unknown note", "Gruppe": "Group",
    "Trommer (eksempel)": "Drums (example)", "Trommeslag": "Drum hits", "Fra takt": "From bar", "Vis": "Show",
    "Før og efter": "Before and after", "Ny variation": "New variation", "Slået fra.": "Off.",
    "Alt foregår i din browser. Filen bliver ikke sendt nogen steder hen.": "Everything happens in your browser. The file is not sent anywhere.",
    "Alt foregår på din egen computer. Filen bliver ikke sendt nogen steder hen.": "Everything happens on your own computer. The file is not sent anywhere.",
    "Gemmes som en ny fil. Din originale fil røres ikke.": "Saved as a new file. Your original file is not touched.",
    "Du vælger selv hvor filen gemmes, og programmet husker mappen og dine indstillinger til næste gang.": "You choose where the file is saved, and the program remembers the folder and your settings for next time.",
    "Du vælger selv hvor filerne gemmes, og programmet husker den sidste mappe til næste gang.": "You choose where the files are saved, and the program remembers the last folder for next time.",
    "Download annulleret.": "Download cancelled.",
    "Der er allerede en download i gang. Prøv igen om lidt.": "A download is already in progress. Try again in a moment.",
    "Download virker ikke her. Åbn siden i Claude for at hente filerne.": "Downloads do not work here. Open the page in Claude to get the files.",
    "Download virker kun når siden er åbnet i Claude.": "Downloads only work when the page is opened in Claude.",
    "Download er ikke klar endnu. Prøv igen om et øjeblik.": "Download is not ready yet. Try again in a moment.",
    "Download virker ikke her.": "Downloads do not work here.",
    "Filen har intet tempo. Siden bruger 120 BPM, så tiderne passer måske ikke, men takterne og sektionerne gør.": "The file has no tempo. The page uses 120 BPM, so the times may be off, but the bars and sections are right.",
    "Filen har intet tempo. Siden regner med 120 BPM, så \"hurtige slag\" passer måske ikke helt.": "The file has no tempo. The page assumes 120 BPM, so \"fast hits\" may not be exact.",
    "Filen har intet tempo. Siden regner med 120 BPM, så millisekunderne passer måske ikke helt.": "The file has no tempo. The page assumes 120 BPM, so the milliseconds may not be exact.",
    "Det er ikke en MIDI-fil (mangler 'MThd').": "This is not a MIDI file (missing 'MThd').",
    "MIDI-filen bruger SMPTE-tid, som ikke understøttes. Gem den med takter/beats (PPQ).": "The MIDI file uses SMPTE time, which is not supported. Save it with bars/beats (PPQ).",
    "MIDI-filen indeholder ingen noder.": "The MIDI file contains no notes.",
    "Sprog": "Language",
    "Hjælp": "Help", "Støt projektet": "Support this project", "Hent Windows-programmet": "Get the Windows program",
    "Gratis online-version": "Free online version", "Kildekode": "Source code", "Licens og tak": "Licence and credits",
    "Sparede det dig tid?": "Did it save you time?", "Giv en kop kaffe": "Buy me a coffee",

    // splitter
    "Træk et MIDI-trommespor ind. Siden finder tempo, taktart og sektioner som vers, omkvæd og breaks, og deler trommerne op i én MIDI-fil pr. sektion.":
      "Drop in a MIDI drum track. The page finds the tempo, time signature and sections like verse, chorus and breaks, and splits the drums into one MIDI file per section.",
    "En opdigtet sang, så du kan se hvordan det virker. Træk din egen .mid-fil hertil.": "A made-up song so you can see how it works. Drop your own .mid file here.",
    "Følsomhed": "Sensitivity", "Færre sektioner": "Fewer sections", "Flere": "More",
    "Gentagelser": "Repeats", "Fjern gentagelser": "Remove repeats", "Fjern kun helt ens sektioner": "Remove only identical sections",
    "Kun én sektion pr. groove": "Only one section per groove", "Behold alle": "Keep all", "Fills som egne filer": "Fills as separate files",
    "Gem i mappe…": "Save to folder…", "Hent sektioner (.zip)": "Download sections (.zip)",
    "Én MIDI-fil pr. sektion, med tempo og taktart": "One MIDI file per section, with tempo and time signature",
    "Sangens forløb": "Song structure", "Grooves": "Grooves", "Sektioner": "Sections", "Navn": "Name", "Takter": "Bars",
    "Start": "Start", "Takt for takt": "Bar by bar", "Takt i sektionens groove": "Bar in the section's groove", "Fill": "Fill",
    "Andre farver: takter der ligner en anden groove": "Other colours: bars that sound like another groove",
    "Nedtonet: gentagelse, kommer ikke med": "Dimmed: repeat, left out",
    "Ændrer du følsomheden, gættes navnene forfra": "Changing the sensitivity guesses the names again",
    "Navngiv, fx Vers": "Name it, e.g. Verse",
    "Hver node i dit trommespor og hvilken tromme den tæller som. Det bruges til at finde sektionerne. Har du ændret kortet i Superior Drummer, retter du gruppen her. Dine rettelser huskes.":
      "Every note in your drum track and which drum it counts as. It is used to find the sections. If you changed the map in Superior Drummer, fix the group here. Your changes are remembered.",
    "Hvor filen gemmes, bestemmer din browser. I Chrome og Edge kan du slå \"Spørg, hvor hver fil skal gemmes\" til under Indstillinger → Downloads, så får du et Gem som-vindue. Åbner du DrumSplit som en fil på din computer, kan du vælge en mappe og få MIDI-filerne lagt direkte i den.":
      "Your browser decides where the file is saved. In Chrome and Edge you can turn on \"Ask where to save each file\" under Settings → Downloads to get a Save As window. If you open DrumSplit as a file on your computer, you can pick a folder and get the MIDI files put straight into it.",
    "Fra Cubase: vælg trommesporet, File → Export → MIDI File. Sektionerne starter på den første takt og flyttes til takt 1 i hver fil, så de kan trækkes direkte ind i et nyt projekt.":
      "From Cubase: select the drum track, File → Export → MIDI File. Each section is moved to bar 1 in its own file, so it can be dragged straight into a new project.",

    // humanizer
    "Træk et MIDI-trommespor ind, og få det tilbage med levende velocity: svagere hurtige slag, accenter på taktslagene, lidt variation og et sjældent fejlslag. Kun velocity ændres. Alt andet i filen er præcis som før.":
      "Drop in a MIDI drum track and get it back with living velocity: softer fast hits, accents on the beats, a little variation and the odd mishit. Only velocity changes. Everything else in the file stays exactly as it was.",
    "Et opdigtet trommespor hvor alle slag har velocity 127. Træk din egen .mid-fil hertil.": "A made-up drum track where every hit has velocity 127. Drop your own .mid file here.",
    "Gem humaniseret MIDI-fil": "Save humanized MIDI file", "Gem humaniseret MIDI-fil (.zip)": "Save humanized MIDI file (.zip)",
    "Humanisering": "Humanizing", "Variation": "Variation", "Niveau": "Level",
    "Hurtige slag": "Fast hits", "Hurtig under": "Fast below", "Svag hånd": "Weak hand", "Takt-accent": "Beat accent",
    "Max velocity": "Max velocity", "Min velocity": "Min velocity",
    "Rør ikke lave slag": "Leave quiet hits alone", "Slag under velocity": "Hits below velocity",
    "Slået fra. Alle slag humaniseres, også de stille.": "Off. All hits are humanized, including the quiet ones.",
    "Fejlslag": "Mishits", "Hvor tit (slag)": "How often (hits)", "Hvor meget svagere": "How much softer",
    "Søjle: ny velocity · streg: original · ring: fejlslag": "Bar: new velocity · line: original · ring: mishit",
    "Hver node i dit trommespor og hvilken tromme den tæller som. Har du ændret kortet i Superior Drummer, retter du gruppen her. Dine rettelser huskes.":
      "Every note in your drum track and which drum it counts as. If you changed the map in Superior Drummer, fix the group here. Your changes are remembered.",
    "Humanisér altid ud fra dit originale spor. En fil, der allerede er humaniseret, får ellers effekten lagt oven i. Samme indstillinger og variationsnummer giver altid præcis samme resultat.":
      "Always humanize from your original track. A file that is already humanized gets the effect added on top. The same settings and variation number always give exactly the same result.",
    "Hvor meget anslaget varierer fra slag til slag. 0 % er helt ens.": "How much the velocity varies from hit to hit. 0 % is all the same.",
    "Gør hele gruppen svagere i forhold til de andre trommer.": "Makes the whole group softer compared to the other drums.",
    "Hvor meget svagere et slag bliver, når det kommer kort efter et andet på samme tromme. Det første slag i en række er fuldt.":
      "How much softer a hit gets when it comes shortly after another on the same drum. The first hit of a run stays full.",
    "Slag med mindre afstand end dette tæller som hurtige.": "Hits closer together than this count as fast.",
    "I hurtige rækker (hvirvler, fills) er hvert andet slag lidt svagere.": "In fast runs (rolls, fills) every second hit is a little softer.",
    "Taktslag stærkest, 8.-dele lidt svagere, 16.-dele svagest. Mest på hihat og bækkener.": "Beats strongest, 8ths a little softer, 16ths softest. Mostly on hi-hat and cymbals.",
    "Det højeste anslag der kommer ud.": "The highest velocity that comes out.",
    "Slag bliver aldrig svagere end dette. Stille ghost notes skrues ikke op.": "Hits never get softer than this. Quiet ghost notes are not turned up.",
    "Hvor mange af slagene med stikker der i gennemsnit bliver ramt dårligt.": "How many of the stick hits are struck badly on average.",
    "Hvor meget svagere et dårligt ramt slag bliver.": "How much softer a badly struck hit gets.",
    "Slag med lavere velocity end dette er programmeret med vilje (ghost notes, stille slag) og bliver ikke ændret.":
      "Hits with lower velocity than this are programmed on purpose (ghost notes, quiet hits) and are not changed.",
    "Et nyt sæt tilfældige variationer. Samme nummer giver altid samme resultat.": "A new set of random variations. The same number always gives the same result.",
    "Velocity før og efter": "Velocity before and after",

    // timing
    "Træk et kvantiseret MIDI-trommespor ind, og få det tilbage med slag, der ikke ligger helt på gitteret: lidt spredning pr. tromme, en tid der ånder, og hurtige rækker der kan strammes eller løsnes undervejs. Kun placeringen ændres, velocity er som før.":
      "Drop in a quantized MIDI drum track and get it back with hits that are not quite on the grid: a little spread per drum, time that breathes, and fast runs that can tighten or loosen as they go. Only the timing changes, velocity stays as it was.",
    "Et opdigtet trommespor, helt kvantiseret. Træk din egen .mid-fil hertil.": "A made-up drum track, fully quantized. Drop your own .mid file here.",
    "Gem MIDI-fil med ny timing": "Save MIDI file with new timing", "Gem MIDI-fil med ny timing (.zip)": "Save MIDI file with new timing (.zip)",
    "Timing": "Timing", "Spredning": "Spread", "Foran / bagved takten": "Ahead of / behind the beat", "Vaklen over tid": "Drift over time",
    "Aldrig mere end": "Never more than", "Hurtige rækker": "Fast runs", "blasts, dobbeltpedal, hvirvler og fills": "blasts, double kick, rolls and fills",
    "Forløb": "Shape", "Stram i starten, løsere til sidst": "Tight at first, looser later", "Løs i starten, strammere til sidst": "Loose at first, tighter later",
    "Tilfældig hele vejen": "Random all the way", "Stram hele vejen": "Tight all the way",
    "Løshed": "Looseness", "Skifter over": "Changes over", "Bølge": "Wave", "på takten": "on the beat",
    "Rækken starter præcist og bliver løsere, jo længere den varer, som når armene bliver trætte.": "The run starts precise and gets looser the longer it lasts, like tiring arms.",
    "Rækken starter lidt løst og falder på plads efter nogle slag.": "The run starts a little loose and settles after a few hits.",
    "Hver række er løs på sin egen tilfældige måde hele vejen.": "Each run is loose in its own random way all the way.",
    "Hurtige rækker spilles stramt. Kun en meget lille spredning.": "Fast runs are played tight. Only a very small spread.",
    "Farvet søjle: ny placering · grå streg: original placering · streg forneden: flytningen": "Coloured bar: new position · grey line: original position · line at the bottom: the move",
    "Hver node i dit trommespor og hvilken tromme den tæller som. Det bestemmer hvor meget hver node flyttes. Har du ændret kortet i Superior Drummer, retter du gruppen her. Dine rettelser huskes.":
      "Every note in your drum track and which drum it counts as. It decides how much each note moves. If you changed the map in Superior Drummer, fix the group here. Your changes are remembered.",
    "Flyt altid ud fra dit originale, kvantiserede spor. En fil, der allerede er flyttet, får ellers flytningen lagt oven i. Du kan sagtens køre den både før og efter DrumHumanize. Samme indstillinger og variationsnummer giver altid præcis samme resultat.":
      "Always move from your original, quantized track. A file that has already been moved gets the move added on top. You can run it before or after DrumHumanize. The same settings and variation number always give exactly the same result.",
    "Flytter hele sporet. Negativ = trommeslageren ligger lidt foran (presser), positiv = bagved (afslappet).": "Moves the whole track. Negative = the drummer sits a little ahead (pushing), positive = behind (laid back).",
    "En langsom bølge over et par takter, så tiden ånder i stedet for at stå helt stille.": "A slow wave over a few bars, so the time breathes instead of standing completely still.",
    "Ingen slag flyttes mere end dette, uanset de andre indstillinger.": "No hit moves more than this, whatever the other settings.",
    "Hvor meget slagene i en hurtig række kan svinge, når de er løsest.": "How much the hits in a fast run can sway when they are loosest.",
    "Hvor mange slag i rækken der går, før den er helt løs (eller helt stram).": "How many hits into the run before it is fully loose (or fully tight).",
    "0 % = hvert slag hopper tilfældigt. 100 % = slagene glider blødt frem og tilbage, som når en blast begynder at svinge.": "0 % = every hit jumps randomly. 100 % = the hits glide smoothly back and forth, like a blast that starts to sway.",
    "Slag med mindre afstand end dette på samme tromme tæller som en hurtig række.": "Hits on the same drum closer together than this count as a fast run.",
    "Hvor meget slagene på denne tromme spredes omkring gitteret (typisk afvigelse).": "How much the hits on this drum spread around the grid (typical deviation).",
    "Et nyt sæt tilfældige flytninger. Samme nummer giver altid samme resultat.": "A new set of random moves. The same number always gives the same result.",
  };

  const G = Object.keys(GROUP_EN).map((k) => k.replace(/[-]/g, "\\-")).join("|");
  const groupEn = (g) => GROUP_EN[g] || g;
  const nameEn = (n) => { const m = /^(.*?)( \d+)?$/.exec(n); return (NAME_EN[m[1]] || m[1]) + (m[2] || ""); };
  const plural = (n, one, many) => (+n === 1 ? one : many);

  const PATTERNS = [
    [/^(\d+) forskellige noder · (.+?)( \(fundet automatisk\))?( · (\d+) rettet af dig)?$/, (m) => `${m[1]} different notes · ${m[2]}${m[3] ? " (detected automatically)" : ""}${m[4] ? ` · ${m[5]} changed by you` : ""}`],
    [/^(\d+) gang(?:e)? · (\d+) takter i alt · mønster fra takt (\d+)$/, (m) => `${m[1]} ${plural(m[1], "time", "times")} · ${m[2]} bars in total · pattern from bar ${m[3]}`],
    [/^(\d+) gang(?:e)? · (\d+) takter i alt$/, (m) => `${m[1]} ${plural(m[1], "time", "times")} · ${m[2]} bars in total`],
    [/^1 pr\. (\d+)$/, (m) => `1 per ${m[1]}`],
    [/^(\d+) takt(?:er)?$/, (m) => `${m[1]} ${plural(m[1], "bar", "bars")}`],
    [/^(\d+) slag$/, (m) => `${m[1]} ${plural(m[1], "hit", "hits")}`],
    [/^(\d+) t\.$/, (m) => `${m[1]} b.`],
    [/^(\d+) % har velocity (\d+)$/, (m) => `${m[1]} % have velocity ${m[2]}`],
    [/^(\d+) % ligger præcis på gitteret$/, (m) => `${m[1]} % exactly on the grid`],
    [/^(\d+) forskellige velocities$/, (m) => `${m[1]} different velocities`],
    [/^(\d+) forskellige grooves$/, (m) => `${m[1]} different grooves`],
    [/^(\d+) uden gentagelser$/, (m) => `${m[1]} without repeats`],
    [/^(\d+) ms (foran|bagved)$/, (m) => `${m[1]} ms ${m[2] === "foran" ? "ahead" : "behind"}`],
    [/^(\d+) trommeslag · (\d+) takter · PPQ (\d+)$/, (m) => `${m[1]} drum hits · ${m[2]} bars · PPQ ${m[3]}`],
    [/^(\d+) af (\d+) slag får ny velocity\. Gennemsnit (\d+)\.( Sporet har allerede varieret velocity, så ghost notes og accenter bevares\.)?$/,
      (m) => `${m[1]} of ${m[2]} hits get a new velocity. Average ${m[3]}.${m[4] ? " The track already has varied velocity, so ghost notes and accents are kept." : ""}`],
    [/^(\d+) fejlslag i hele sporet, ud af (\d+) slag med stikker\. Kun lilletromme, hihat, tam-tams og bækkener, oftest i hurtige rækker og med den svage hånd\. Aldrig stortromme, hihat-pedal eller stille ghost notes\.( Heller ikke slag under velocity (\d+)\.)?$/,
      (m) => `${m[1]} ${plural(m[1], "mishit", "mishits")} in the whole track, out of ${m[2]} stick hits. Only snare, hi-hat, toms and cymbals, mostly in fast runs and on the weak hand. Never kick, hi-hat pedal or quiet ghost notes.${m[3] ? ` Nor hits below velocity ${m[4]}.` : ""}`],
    [/^(\d+) slag under velocity (\d+) bliver præcis som du har programmeret dem\.$/, (m) => `${m[1]} hits below velocity ${m[2]} stay exactly as you programmed them.`],
    [/^Ingen slag under velocity (\d+) i sporet, så alle humaniseres\.$/, (m) => `No hits below velocity ${m[1]} in the track, so all are humanized.`],
    [/^Slagene flyttes i gennemsnit ([\d.]+) ms og højst ([\d.]+) ms\.( Hele sporet ligger (\d+) ms (foran|bagved) takten\.)?$/,
      (m) => `Hits move ${m[1]} ms on average and ${m[2]} ms at most.${m[3] ? ` The whole track sits ${m[4]} ms ${m[5] === "foran" ? "ahead of" : "behind"} the beat.` : ""}`],
    [/^Variation nr\. (\d+)$/, (m) => `Variation no. ${m[1]}`],
    [/^(\d+) sektion(?:er)?( \+ (\d+) fills?)? som MIDI-filer(?:, (\d+) gentagelser? springes over)?$/,
      (m) => `${m[1]} ${plural(m[1], "section", "sections")}${m[2] ? ` + ${m[3]} ${plural(m[3], "fill", "fills")}` : ""} as MIDI files${m[4] ? `, ${m[4]} ${plural(m[4], "repeat", "repeats")} skipped` : ""}`],
    [/^gentager (.+?)(?: \((\d+) af (\d+) takter ens\))?, springes over$/, (m) => `repeats ${nameEn(m[1])}${m[2] ? ` (${m[2]} of ${m[3]} bars the same)` : ""}, skipped`],
    [/^ligner (.+?) \((\d+) af (\d+) takter ens\), gemmes$/, (m) => `resembles ${nameEn(m[1])} (${m[2]} of ${m[3]} bars the same), saved`],
    [/^Navnet er et gæt: (.+)$/, (m) => `The name is a guess: ${WHY_EN[m[1]] || m[1]}`],
    [/^(.+) kunne ikke læses: (.+)$/, (m) => `${m[1]} could not be read: ${EXACT[m[2]] || m[2]}`],
    [/^(.+) kunne ikke åbnes\.$/, (m) => `${m[1]} could not be opened.`],
    [/^(Filerne|Zip-filen|Filen) kunne ikke gemmes: (.+)$/, (m) => `${{ Filerne: "The files", "Zip-filen": "The zip file", Filen: "The file" }[m[1]]} could not be saved: ${m[2]}`],
    [/^Mappen kunne ikke åbnes: (.+)$/, (m) => `The folder could not be opened: ${m[1]}`],
    [/^Hentet: (\d+) MIDI-filer i (.+)$/, (m) => `Downloaded: ${m[1]} MIDI files in ${m[2]}`],
    [/^Gemt: (\d+) MIDI-filer i (.+)$/, (m) => `Saved: ${m[1]} MIDI files in ${m[2]}`],
    [/^Gemt: (.+\.mid) i (.+\.zip)$/, (m) => `Saved: ${m[1]} in ${m[2]}`],
    [/^Hentet: (.+)$/, (m) => `Downloaded: ${m[1]}`],
    [/^Gemt: (.+)$/, (m) => `Saved: ${m[1]}`],
    [/^Gruppe for node (\d+)$/, (m) => `Group for note ${m[1]}`],
    [/^Mønster i takt (\d+)$/, (m) => `Pattern in bar ${m[1]}`],
    [/^Navn til groove (\w)$/, (m) => `Name for groove ${m[1]}`],
    [/^Takt (\d+)(, fill)?$/, (m) => `Bar ${m[1]}${m[2] ? ", fill" : ""}`],
    [/^(.+), takt (\d+)–(\d+)$/, (m) => `${nameEn(m[1])}, bars ${m[2]}–${m[3]}`],
    [/^BPM, (\d+) skift$/, (m) => `BPM, ${m[1]} ${plural(m[1], "change", "changes")}`],
    [/^skifter (\d+) gange?$/, (m) => `changes ${m[1]} ${plural(m[1], "time", "times")}`],
    [/^Filen har ingen taktart\. Ud fra trommerne ligner det (.+)\.$/, (m) => `The file has no time signature. From the drums it looks like ${m[1]}.`],
    [/^Kun (\d+) % af slagene ligger på takt-gitteret\. Sporet er nok indspillet uden klik eller med et andet tempo end filens, så sektionerne kan være upræcise\.$/,
      (m) => `Only ${m[1]} % of the hits sit on the bar grid. The track was probably recorded without a click or at a different tempo than the file's, so the sections may be off.`],
    [/^(.+) \((\d+) noder\)$/, (m) => `${EXACT[m[1]] || m[1].replace(/^Spor (\d+)$/, "Track $1")} (${m[2]} notes)`],
    [/^Spor (\d+)$/, (m) => `Track ${m[1]}`],
    [new RegExp(`^(${G}) (variation|niveau|spredning)$`), (m) => `${groupEn(m[1])} ${{ variation: "variation", niveau: "level", spredning: "spread" }[m[2]]}`],
    [new RegExp(`^(${G})$`), (m) => groupEn(m[1])],
    [/^(Intro|Vers|Omkvæd|Pre-omkvæd|Bro|Break|Outro|Mellemspil)( \d+)?$/, (m) => nameEn(m[0])],
  ];

  let lang = "da";
  const textSrc = new WeakMap();   // text node -> { da, en }
  const attrSrc = new WeakMap();   // element -> { attr: { da, en } }
  const ATTRS = ["title", "aria-label", "placeholder"];

  function toEn(s) {
    const t = s.trim();
    if (!t) return s;
    let out = null;
    if (Object.prototype.hasOwnProperty.call(EXACT, t)) out = EXACT[t];
    else for (const [re, fn] of PATTERNS) { const m = re.exec(t); if (m) { out = fn(m); break; } }
    return out === null ? s : s.replace(t, out);
  }
  const tr = (s) => (lang === "en" ? toEn(String(s)) : String(s));

  function doText(n) {
    const cur = n.nodeValue, rec = textSrc.get(n);
    if (rec && cur === (lang === "en" ? rec.en : rec.da)) return;
    const da = rec && cur === rec.en ? rec.da : cur;      // a node we translated, or new Danish text
    const en = toEn(da);
    textSrc.set(n, { da, en });
    const want = lang === "en" ? en : da;
    if (cur !== want) n.nodeValue = want;
  }
  function doAttrs(el) {
    let recs = attrSrc.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      recs = recs || {};
      const rec = recs[a];
      if (rec && cur === (lang === "en" ? rec.en : rec.da)) continue;
      const da = rec && cur === rec.en ? rec.da : cur;
      const en = toEn(da);
      recs[a] = { da, en };
      const want = lang === "en" ? en : da;
      if (cur !== want) el.setAttribute(a, want);
    }
    if (recs) attrSrc.set(el, recs);
  }
  function walk(rootNode) {
    if (rootNode.nodeType === 3) { if (!/^(SCRIPT|STYLE)$/.test(rootNode.parentNode && rootNode.parentNode.nodeName)) doText(rootNode); return; }
    if (rootNode.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(rootNode.nodeName)) return;
    doAttrs(rootNode);
    for (let c = rootNode.firstChild; c; c = c.nextSibling) walk(c);
  }

  let observer = null;
  function start() {
    walk(document.body);
    observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setLang(l) {
    lang = l === "en" ? "en" : "da";
    document.documentElement.lang = lang;
    walk(document.body);
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  }

  /** The language to start in: the saved choice, otherwise English. */
  function initialLang() {
    try { const s = localStorage.getItem("drumtools.lang"); if (s === "da" || s === "en") return s; } catch (e) {}
    return "en";
  }
  function remember(l) { try { localStorage.setItem("drumtools.lang", l); } catch (e) {} }

  root.I18N = {
    get lang() { return lang; }, setLang, start, tr, initialLang, remember,
    L: (da, en) => (lang === "en" ? en : da),
    sectionName: (n) => (lang === "en" ? nameEn(n) : n),
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
