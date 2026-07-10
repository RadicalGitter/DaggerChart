// i18n + key-term glossary for the player-facing pages.
// Language is a per-device choice (localStorage). Game terms (Hope, Stress,
// Evasion…) stay in English to match the physical cards; UI phrasing and the
// glossary explanations translate.

export const LANGS = ["en", "sv"];
export const lang = (() => {
  const stored = localStorage.getItem("settlement-lang");
  return LANGS.includes(stored) ? stored : "en";
})();

export function setLang(l) {
  localStorage.setItem("settlement-lang", l);
  location.reload();
}

// ---------- UI strings ----------
const STRINGS = {
  en: {
    // creator chrome
    "create.title": "Cross into the New World",
    "create.subtitle": "The Settlement — character creation",
    "btn.back": "Back",
    "btn.next": "Onward",
    "btn.sign": "Sign the ledger",
    // steps
    "step.who.title": "Who crosses over?",
    "step.who.sub": "Every name in the settlement matters. Start with yours.",
    "label.charname": "Character name",
    "label.pronouns": "Pronouns",
    "label.player": "Player",
    "warn.name": "A name is required — the chronicle must know you.",
    "step.class.title": "Choose your class",
    "step.class.sub": "Your calling in the old world, carried into the new.",
    "warn.class": "Choose a class to continue.",
    "step.subclass.title": "Choose your subclass",
    "step.subclass.sub": "How you practice your calling.",
    "subclass.item": "You also carry one of these",
    "warn.subclass": "Choose a subclass to continue.",
    "warn.classitem": "Choose the item you carry.",
    "step.heritage.title": "Choose your heritage",
    "step.heritage.sub": "Your ancestry, and the community that raised you.",
    "heritage.ancestry": "Ancestry",
    "heritage.community": "Community",
    "warn.ancestry": "Choose an ancestry.",
    "warn.community": "Choose a community.",
    "step.traits.title": "Assign your traits",
    "step.traits.sub": "Distribute +2, +1, +1, +0, +0, −1 among the six traits.",
    "traits.note": "The set must come out exactly: one +2, two +1, two +0, one −1.",
    "warn.traits.all": "Assign every trait.",
    "warn.traits.set": "The set must be exactly +2, +1, +1, +0, +0, −1.",
    "step.arms.title": "Take up arms",
    "step.arms.sub": "Choose your weapons and armor. Tier 1 — you arrived with little.",
    "arms.primary": "Primary weapon",
    "arms.secondary": "Secondary (optional — only with a one-handed primary)",
    "arms.armor": "Armor",
    "arms.potion": "One potion for the road",
    "arms.alsocarry": "You also carry:",
    "arms.thresholds": "Thresholds",
    "warn.primary": "Choose a primary weapon.",
    "warn.secondary": "A secondary weapon needs a one-handed primary.",
    "warn.armor": "Choose your armor.",
    "warn.potion": "Choose a potion.",
    "step.exp.title": "Name your experiences",
    "step.exp.sub": "Two things your past made you good at — a phrase each, +2 when it applies.",
    "label.exp": "Experience",
    "exp.placeholder": "e.g. Raised by wolves, Ship's quartermaster…",
    "warn.exp": "Name both experiences.",
    "step.bg.title": "Your background",
    "step.bg.sub": "Answer any that speak to you, or leave them for the fireside.",
    "step.cards.title": "Choose your domain cards",
    "step.cards.sub": "Pick two level-1 cards from {domains}.",
    "cards.count": "{n} of 2 chosen.",
    "warn.cards": "Choose exactly two cards.",
    "step.conn.title": "Connections",
    "step.conn.sub": "Ask your fellow players — or note what binds you to those already here.",
    "conn.party": "Already in the settlement: {names}.",
    "step.review.title": "The ledger entry",
    "step.review.sub": "Read it back before you sign.",
    "review.of": "{ancestry} {class} ({subclass}) of the {community}",
    "review.traits": "Traits",
    "review.arms": "Arms",
    "review.exp": "Experiences",
    "review.cards": "Domain cards",
    "review.carried": "Carried",
    "review.playedby": "played by {player}",
    // sheet
    "sheet.loading": "Opening the ledger…",
    "sheet.notfound": "No such character.",
    "sheet.level": "Level",
    "sheet.arms": "Arms",
    "sheet.exp": "Experiences",
    "sheet.cards": "Domain cards",
    "sheet.features": "Features",
    "sheet.carried": "Carried",
    "sheet.background": "Background",
    "sheet.connections": "Connections",
    "sheet.weapon": "Weapon",
    "sheet.trait": "Trait",
    "sheet.range": "Range",
    "sheet.damage": "Damage",
    "sheet.notes": "Notes",
    "sheet.primary": "Primary",
    "sheet.secondary": "Secondary",
    "sheet.spellcast": "Spellcast trait:",
    "sheet.class": "Class",
    "sheet.hopefeat": "Hope",
    // table view
    "table.town": "The Town",
    "table.folk": "Folk of Note",
    "table.chronicle": "The Chronicle",
    "table.folkcount": "{n} folk",
    "table.nobuildings": "No buildings yet. The wilderness is waiting.",
    "table.nofolk": "No one of note has stepped forward yet.",
    "table.nochronicle": "The chronicle is unwritten. The first season awaits.",
    "table.noforeman": "no foreman",
    "table.level": "level",
    // journal
    "journal.title": "The Journal",
    "journal.sub": "The Settlement — shared memory of the road",
    "journal.pick": "Whose journal is this?",
    "journal.notyou": "Not you? Choose another.",
    "journal.tab.journal": "Journal",
    "journal.tab.people": "People",
    "journal.tab.places": "Places",
    "journal.search": "Search the pages…",
    "journal.write": "Write it down",
    "journal.placeholder": "What happened? Names, debts, promises, rumors…",
    "journal.note.person": "Add a note — what do you know about them?",
    "journal.note.place": "Add a note — what do you know of this place?",
    "journal.scope.me": "For my eyes",
    "journal.scope.group": "For the table",
    "journal.yours": "yours alone",
    "journal.edit": "Edit",
    "journal.strike": "Strike",
    "journal.save": "Save",
    "journal.cancel": "Cancel",
    "journal.confirmstrike": "Strike this note from the record?",
    "journal.empty": "Nothing written yet. The first page is yours.",
    "journal.people.empty": "You haven't met anyone of note beyond the palisade yet.",
    "journal.places.empty": "No places discovered yet. The map is waiting.",
    "journal.nonotes": "No notes yet.",
    "journal.carries": "Carries",
    "journal.herenow": "Seen here",
    "journal.unknownplace": "whereabouts unknown",
    "journal.home": "the town",
    "journal.open": "Open the journal",
    // vitals
    "vital.hp": "Hit Points",
    "vital.stress": "Stress",
    "vital.hope": "Hope",
    "vital.armorslots": "Armor slots",
    "vital.evasion": "Evasion",
    "vital.armor": "Armor",
    // hand manager
    "hand.acquire": "Take a new card",
    "hand.ready": "Ready",
    "hand.stow": "Stow",
    "hand.take": "Take",
    "hand.done": "Done",
    "hand.full": "Your Loadout is full (5). Stow a card first.",
    "hand.vaultEmpty": "Nothing in the vault.",
    "hand.available": "Cards of your domains",
    "hand.aboveLevel": "beyond your level",
    "hand.giveup": "Give up",
    "hand.confirmRemove": "Give up {name}? It leaves your vault.",
    "hand.tovault": "It goes to your Vault — your Loadout is full."
  },
  sv: {
    "create.title": "Kliv in i den nya världen",
    "create.subtitle": "Nybygget — skapa din rollperson",
    "btn.back": "Tillbaka",
    "btn.next": "Vidare",
    "btn.sign": "Skriv under i liggaren",
    "step.who.title": "Vem gör resan?",
    "step.who.sub": "Varje namn i bosättningen betyder något. Börja med ditt.",
    "label.charname": "Rollpersonens namn",
    "label.pronouns": "Pronomen",
    "label.player": "Spelare",
    "warn.name": "Ett namn krävs — krönikan måste känna dig.",
    "step.class.title": "Välj din klass",
    "step.class.sub": "Ditt kall i den gamla världen, buret in i den nya.",
    "warn.class": "Välj en klass för att fortsätta.",
    "step.subclass.title": "Välj din underklass",
    "step.subclass.sub": "Hur du utövar ditt kall.",
    "subclass.item": "Du bär också en av dessa",
    "warn.subclass": "Välj en underklass för att fortsätta.",
    "warn.classitem": "Välj föremålet du bär med dig.",
    "step.heritage.title": "Välj ditt arv",
    "step.heritage.sub": "Din härkomst, och gemenskapen som fostrade dig.",
    "heritage.ancestry": "Härkomst",
    "heritage.community": "Gemenskap",
    "warn.ancestry": "Välj en härkomst.",
    "warn.community": "Välj en gemenskap.",
    "step.traits.title": "Fördela dina egenskaper",
    "step.traits.sub": "Fördela +2, +1, +1, +0, +0, −1 mellan de sex egenskaperna.",
    "traits.note": "Fördelningen måste bli exakt: en +2, två +1, två +0, en −1.",
    "warn.traits.all": "Ge varje egenskap ett värde.",
    "warn.traits.set": "Fördelningen måste vara exakt +2, +1, +1, +0, +0, −1.",
    "step.arms.title": "Beväpna dig",
    "step.arms.sub": "Välj vapen och rustning. Nivå 1 — ni kom hit med nästan ingenting.",
    "arms.primary": "Primärt vapen",
    "arms.secondary": "Sekundärt (valfritt — kräver ett enhandsvapen som primärt)",
    "arms.armor": "Rustning",
    "arms.potion": "En dryck för resan",
    "arms.alsocarry": "Du bär också:",
    "arms.thresholds": "Trösklar",
    "warn.primary": "Välj ett primärt vapen.",
    "warn.secondary": "Ett sekundärt vapen kräver ett enhandsvapen som primärt.",
    "warn.armor": "Välj din rustning.",
    "warn.potion": "Välj en dryck.",
    "step.exp.title": "Namnge dina erfarenheter",
    "step.exp.sub": "Två saker ditt förflutna gjort dig skicklig på — en fras vardera, +2 när det är relevant.",
    "label.exp": "Erfarenhet",
    "exp.placeholder": "t.ex. Uppfostrad av vargar, Skeppets proviantmästare…",
    "warn.exp": "Namnge båda erfarenheterna.",
    "step.bg.title": "Din bakgrund",
    "step.bg.sub": "Svara på de frågor som talar till dig, eller spara dem till lägerelden.",
    "step.cards.title": "Välj dina domänkort",
    "step.cards.sub": "Välj två nivå 1-kort från {domains}.",
    "cards.count": "{n} av 2 valda.",
    "warn.cards": "Välj exakt två kort.",
    "step.conn.title": "Band",
    "step.conn.sub": "Fråga dina medspelare — eller anteckna vad som binder dig till de som redan är här.",
    "conn.party": "Redan i bosättningen: {names}.",
    "step.review.title": "Posten i liggaren",
    "step.review.sub": "Läs igenom innan du skriver under.",
    "review.of": "{ancestry} {class} ({subclass}) av {community}",
    "review.traits": "Egenskaper",
    "review.arms": "Vapen & rustning",
    "review.exp": "Erfarenheter",
    "review.cards": "Domänkort",
    "review.carried": "Buret",
    "review.playedby": "spelas av {player}",
    "sheet.loading": "Öppnar liggaren…",
    "sheet.notfound": "Ingen sådan rollperson.",
    "sheet.level": "Nivå",
    "sheet.arms": "Vapen & rustning",
    "sheet.exp": "Erfarenheter",
    "sheet.cards": "Domänkort",
    "sheet.features": "Förmågor",
    "sheet.carried": "Packning",
    "sheet.background": "Bakgrund",
    "sheet.connections": "Band",
    "sheet.weapon": "Vapen",
    "sheet.trait": "Egenskap",
    "sheet.range": "Räckvidd",
    "sheet.damage": "Skada",
    "sheet.notes": "Noteringar",
    "sheet.primary": "Primärt",
    "sheet.secondary": "Sekundärt",
    "sheet.spellcast": "Besvärjelseegenskap:",
    "sheet.class": "Klass",
    "sheet.hopefeat": "Hope",
    "table.town": "Staden",
    "table.folk": "Namnkunniga",
    "table.chronicle": "Krönikan",
    "table.folkcount": "{n} själar",
    "table.nobuildings": "Inga byggnader ännu. Vildmarken väntar.",
    "table.nofolk": "Ingen namnkunnig har ännu trätt fram.",
    "table.nochronicle": "Krönikan är oskriven. Den första årstiden väntar.",
    "table.noforeman": "ingen förman",
    "table.level": "nivå",
    // journal
    "journal.title": "Dagboken",
    "journal.sub": "The Settlement — vägens gemensamma minne",
    "journal.pick": "Vems dagbok är detta?",
    "journal.notyou": "Inte du? Välj en annan.",
    "journal.tab.journal": "Dagbok",
    "journal.tab.people": "Personer",
    "journal.tab.places": "Platser",
    "journal.search": "Sök i sidorna…",
    "journal.write": "Skriv ned det",
    "journal.placeholder": "Vad hände? Namn, skulder, löften, rykten…",
    "journal.note.person": "Lägg till en anteckning — vad vet ni om dem?",
    "journal.note.place": "Lägg till en anteckning — vad vet ni om platsen?",
    "journal.scope.me": "För mina ögon",
    "journal.scope.group": "För bordet",
    "journal.yours": "endast din",
    "journal.edit": "Ändra",
    "journal.strike": "Stryk",
    "journal.save": "Spara",
    "journal.cancel": "Avbryt",
    "journal.confirmstrike": "Stryka denna anteckning ur boken?",
    "journal.empty": "Inget skrivet ännu. Första sidan är din.",
    "journal.people.empty": "Ni har inte mött någon av vikt bortom palissaden ännu.",
    "journal.places.empty": "Inga platser upptäckta ännu. Kartan väntar.",
    "journal.nonotes": "Inga anteckningar ännu.",
    "journal.carries": "Bär på",
    "journal.herenow": "Sedda här",
    "journal.unknownplace": "okänd hemvist",
    "journal.home": "staden",
    "journal.open": "Öppna dagboken",
    "vital.hp": "Hit Points",
    "vital.stress": "Stress",
    "vital.hope": "Hope",
    "vital.armorslots": "Armor slots",
    "vital.evasion": "Evasion",
    "vital.armor": "Armor",
    "hand.acquire": "Ta ett nytt kort",
    "hand.ready": "Ta fram",
    "hand.stow": "Lägg undan",
    "hand.take": "Ta",
    "hand.done": "Klar",
    "hand.full": "Din Loadout är full (5). Lägg undan ett kort först.",
    "hand.vaultEmpty": "Inget i valvet.",
    "hand.available": "Kort från dina domäner",
    "hand.aboveLevel": "över din nivå",
    "hand.giveup": "Ge upp",
    "hand.confirmRemove": "Ge upp {name}? Det lämnar ditt valv.",
    "hand.tovault": "Det läggs i ditt Vault — din Loadout är full."
  }
};

export function t(key, vars = {}) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// Season labels arrive from the server in English; translate for display.
const SEASONS_SV = { Spring: "Vår", Summer: "Sommar", Autumn: "Höst", Winter: "Vinter" };
export function seasonLabel(label) {
  if (lang !== "sv" || !label) return label;
  return label
    .replace(/^(Spring|Summer|Autumn|Winter)/, (m) => SEASONS_SV[m])
    .replace("Year", "År");
}

// ---------- the glossary: brief "oh right, that's what it does" notes ----------
export const TERMS = {
  evasion: {
    en: ["Evasion", "The number an attack roll must meet or beat to hit you."],
    sv: ["Evasion", "Talet ett attackslag måste nå eller överträffa för att träffa dig."]
  },
  hp: {
    en: ["Hit Points", "How much punishment you can take. Damage marks 1, 2 or 3 HP depending on your thresholds. If all are marked, you fall."],
    sv: ["Hit Points", "Hur mycket stryk du tål. Skada kryssar 1, 2 eller 3 HP beroende på dina trösklar. Är alla kryssade faller du."]
  },
  stress: {
    en: ["Stress", "Strain from pushing yourself, fear, and certain abilities. If you must mark Stress but have none left, mark a Hit Point instead."],
    sv: ["Stress", "Slitage från att pressa dig själv, rädsla och vissa förmågor. Måste du kryssa Stress men inga rutor finns kvar kryssar du en Hit Point i stället."]
  },
  hope: {
    en: ["Hope", "The hero's currency. Gained on rolls with Hope; spend it to use an Experience, help an ally, or fuel your class's Hope feature. Max 6."],
    sv: ["Hope", "Hjältens valuta. Fås på slag med Hope; spendera för att använda en Experience, hjälpa en allierad eller driva klassens Hope-förmåga. Max 6."]
  },
  fear: {
    en: ["Fear", "The GM's currency, gained on rolls with Fear — fuel for the world pushing back."],
    sv: ["Fear", "Spelledarens valuta, fås på slag med Fear — bränsle för världens motstånd."]
  },
  thresholds: {
    en: ["Damage Thresholds", "Compare damage taken: below Major mark 1 HP; Major or more mark 2; Severe or more mark 3."],
    sv: ["Skadetrösklar", "Jämför skadan: under Major kryssa 1 HP; Major eller mer kryssa 2; Severe eller mer kryssa 3."]
  },
  "armor-score": {
    en: ["Armor Score", "How many Armor Slots your armor gives you — its capacity to absorb hits."],
    sv: ["Armor Score", "Hur många Armor Slots din rustning ger dig — dess förmåga att ta emot smällar."]
  },
  "armor-slots": {
    en: ["Armor Slots", "Mark one when you take damage to reduce it by one threshold step (3→2→1 HP). They clear when you rest and repair."],
    sv: ["Armor Slots", "Kryssa en när du tar skada för att sänka den ett tröskelsteg (3→2→1 HP). Återställs när du vilar och lagar rustningen."]
  },
  level: {
    en: ["Level", "Grows at milestones. Added to your damage thresholds, and unlocks higher-level domain cards."],
    sv: ["Nivå", "Ökar vid milstolpar. Läggs till dina skadetrösklar och låser upp domänkort av högre nivå."]
  },
  proficiency: {
    en: ["Proficiency", "How many damage dice you roll with weapons. Starts at 1."],
    sv: ["Proficiency", "Hur många skadetärningar du slår med vapen. Börjar på 1."]
  },
  experience: {
    en: ["Experience", "A phrase from your past. Spend a Hope to add its +2 to a relevant roll."],
    sv: ["Experience", "En fras ur ditt förflutna. Spendera en Hope för att lägga dess +2 på ett relevant slag."]
  },
  domain: {
    en: ["Domain", "One of nine schools of power. Your class draws its cards from two of them."],
    sv: ["Domän", "En av nio kraftskolor. Din klass hämtar sina kort från två av dem."]
  },
  recall: {
    en: ["Recall Cost", "The Stress you pay to swap this card from your Vault into your Loadout outside a rest. During a rest, swapping is free."],
    sv: ["Recall Cost", "Den Stress du betalar för att byta in kortet från ditt Vault till din Loadout utanför en vila. Under en vila är bytet gratis."]
  },
  loadout: {
    en: ["Loadout", "The cards you have ready — up to 5 active at once. Swap freely during a rest; otherwise pay the card's Recall Cost in Stress."],
    sv: ["Loadout", "Korten du har redo — högst 5 aktiva samtidigt. Byt fritt under en vila; annars betalar du kortets Recall Cost i Stress."]
  },
  vault: {
    en: ["Vault", "Cards you own but aren't using right now. They wait here until you swap them into your Loadout."],
    sv: ["Vault", "Kort du äger men inte använder just nu. De väntar här tills du byter in dem i din Loadout."]
  },
  spellcast: {
    en: ["Spellcast Trait", "The trait this subclass rolls when casting spells."],
    sv: ["Besvärjelseegenskap", "Egenskapen denna underklass slår med när den kastar besvärjelser."]
  },
  burden: {
    en: ["Burden", "How many hands the weapon fills. A one-handed primary leaves room for a secondary."],
    sv: ["Burden", "Hur många händer vapnet kräver. Ett enhandsvapen som primärt lämnar plats för ett sekundärt."]
  },
  range: {
    en: ["Range", "Distance bands: Melee (touch), Very Close (a few steps), Close (a stone's throw), Far (across the field), Very Far (the edge of the scene)."],
    sv: ["Räckvidd", "Avståndssteg: Melee (armlängd), Very Close (några steg), Close (ett stenkast), Far (över fältet), Very Far (scenens bortre kant)."]
  },
  damage: {
    en: ["Damage", "phy = physical, mag = magic. Roll the listed die a number of times equal to your Proficiency."],
    sv: ["Skada", "phy = fysisk, mag = magisk. Slå den angivna tärningen lika många gånger som din Proficiency."]
  },
  "trait-agility": {
    en: ["Agility", "Sprint, leap, maneuver — quickness of body."],
    sv: ["Agility", "Spurta, hoppa, manövrera — kroppens snabbhet."]
  },
  "trait-strength": {
    en: ["Strength", "Lift, smash, grapple — raw power."],
    sv: ["Strength", "Lyfta, krossa, brottas — rå styrka."]
  },
  "trait-finesse": {
    en: ["Finesse", "Control, hide, tinker — precision work."],
    sv: ["Finesse", "Kontrollera, gömma sig, mecka — precisionsarbete."]
  },
  "trait-instinct": {
    en: ["Instinct", "Perceive, sense, navigate — gut feeling and awareness."],
    sv: ["Instinct", "Uppfatta, känna av, navigera — magkänsla och vaksamhet."]
  },
  "trait-presence": {
    en: ["Presence", "Charm, perform, deceive — force of personality."],
    sv: ["Presence", "Charma, uppträda, vilseleda — personlighetens kraft."]
  },
  "trait-knowledge": {
    en: ["Knowledge", "Recall, analyze, comprehend — learning and logic."],
    sv: ["Knowledge", "Minnas, analysera, förstå — lärdom och logik."]
  },
  // settlement terms (table view)
  "res-lumber": {
    en: ["Lumber", "Timber for building and repairs."],
    sv: ["Lumber", "Virke till byggen och reparationer."]
  },
  "res-food": {
    en: ["Food", "Keeps the settlement fed through the seasons."],
    sv: ["Food", "Håller bosättningen mätt genom årstiderna."]
  },
  "res-morale": {
    en: ["Morale", "The settlement's spirit and will to keep going."],
    sv: ["Morale", "Bosättningens anda och vilja att kämpa vidare."]
  },
  "res-security": {
    en: ["Security", "Watchfulness and defense against whatever waits in the dark."],
    sv: ["Security", "Vaksamhet och försvar mot det som väntar i mörkret."]
  },
  "res-supplies": {
    en: ["Supplies", "Tools, cloth, rope — the small things everything else needs."],
    sv: ["Supplies", "Verktyg, tyg, rep — smågrejerna allt annat behöver."]
  },
  foreman: {
    en: ["Foreman", "A named settler who leads a building's work and adds their aptitude to its seasonal roll."],
    sv: ["Förman", "En namngiven nybyggare som leder en byggnads arbete och lägger sin fallenhet till dess årstidsslag."]
  },
  "building-level": {
    en: ["Building Level", "The building's development. Added to its seasonal roll — every +1 matters."],
    sv: ["Byggnadsnivå", "Byggnadens utveckling. Läggs till dess årstidsslag — varje +1 spelar roll."]
  },
  season: {
    en: ["Season", "Roughly half a year of game time passes between each building's rolls."],
    sv: ["Årstid", "Ungefär ett halvt spelår går mellan varje byggnads slag."]
  }
};

// Wrap known capitalized game terms in rules text so they become pressable.
// Call on already-escaped text.
const TERM_PATTERNS = [
  ["Very Close", "range"], ["Very Far", "range"], ["Armor Slots", "armor-slots"],
  ["Armor Slot", "armor-slots"], ["Armor Score", "armor-score"],
  ["Hit Points", "hp"], ["Hit Point", "hp"], ["Recall Cost", "recall"],
  ["Spellcast", "spellcast"], ["Proficiency", "proficiency"],
  ["Melee", "range"], ["Close", "range"], ["Far", "range"],
  ["Hope", "hope"], ["Fear", "fear"], ["Stress", "stress"],
  ["Evasion", "evasion"], ["Experience", "experience"]
];
const TERM_RE = new RegExp(`\\b(${TERM_PATTERNS.map(([p]) => p).join("|")})\\b`, "g");
const TERM_MAP = Object.fromEntries(TERM_PATTERNS);

export function termify(escapedText) {
  return String(escapedText).replace(TERM_RE, (m) => `<span class="term" data-term="${TERM_MAP[m]}">${m}</span>`);
}

// Convenience for labels you mark up yourself.
export function term(key, label) {
  return `<span class="term" data-term="${key}">${label}</span>`;
}

// ---------- popover + long-press wiring ----------
let popEl = null;
let pressTimer = null;
let suppressClick = false;

function showTerm(key, anchor) {
  const def = TERMS[key];
  if (!def) return;
  const [name, text] = def[lang] || def.en;
  hideTerm();
  popEl = document.createElement("div");
  popEl.id = "term-pop";
  popEl.innerHTML = `<div class="name"></div><div class="text"></div>`;
  popEl.querySelector(".name").textContent = name;
  popEl.querySelector(".text").textContent = text;
  document.body.appendChild(popEl);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  popEl.style.maxWidth = w + "px";
  const pw = popEl.offsetWidth;
  let x = Math.min(Math.max(12, r.left), window.innerWidth - pw - 12);
  let y = r.bottom + 8;
  if (y + popEl.offsetHeight > window.innerHeight - 12) y = Math.max(12, r.top - popEl.offsetHeight - 8);
  popEl.style.left = x + "px";
  popEl.style.top = y + "px";
}

function hideTerm() {
  if (popEl) { popEl.remove(); popEl = null; }
}

function wireTerms() {
  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-term]");
    if (!el) { hideTerm(); return; }
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      suppressClick = true;
      showTerm(el.dataset.term, el);
    }, 450);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
    document.addEventListener(ev, () => clearTimeout(pressTimer));
  }
  // Desktop nicety: a plain click also opens it (labels aren't otherwise clickable).
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-term]");
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
    if (el) showTerm(el.dataset.term, el);
    else hideTerm();
  });
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest("[data-term]")) e.preventDefault();
  });
  window.addEventListener("scroll", hideTerm, { passive: true });
}

function wireToggle() {
  const el = document.createElement("div");
  el.id = "lang-toggle";
  el.innerHTML = LANGS.map(
    (l) => `<button data-lang="${l}" class="${l === lang ? "on" : ""}">${l.toUpperCase()}</button>`
  ).join("<span>·</span>");
  document.body.appendChild(el);
  for (const b of el.querySelectorAll("[data-lang]")) {
    b.onclick = () => setLang(b.dataset.lang);
  }
}

// Apply translations to static markup: <el data-i18n="key">fallback</el>
function applyStatic() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
}

export function initI18n() {
  document.documentElement.lang = lang;
  applyStatic();
  wireToggle();
  wireTerms();
}
