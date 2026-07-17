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
    "create.title": "Create your character",
    "create.subtitle": "The Settlement — find your place at the table",
    "create.part": "Part {n} of {total}",
    "btn.back": "Back",
    "btn.next": "Next",
    "btn.sign": "Finish your character",
    "error.generic": "Something went wrong.",
    "error.table": "The player view could not be loaded.",
    "error.characters": "The character list could not be loaded.",
    // book & pen pickers (creator) + shell names shared with /login
    "step.book.title": "Choose your book",
    "step.book.sub": "How your side of the table will look. The same tale is kept in any of them.",
    "warn.book": "Choose a book to keep your character in.",
    "step.pen.title": "Choose your pen",
    "step.pen.sub": "What you'll mark the margins with.",
    "warn.pen": "Choose something to write with.",
    "review.book": "Your book",
    "review.pen": "Your pen",
    "shell.tome.name": "The Aged Tome",
    "shell.tome.blurb": "A weathered keepsake — cracked leather, candlelight, and objects tucked between the pages.",
    "shell.book.name": "The Bound Book",
    "shell.book.blurb": "A clean two-page book with bookmarks along the edge.",
    "shell.table.name": "The Ledger Deck",
    "shell.table.blurb": "Broad cards you lay out and open — the plainest, steadiest view.",
    "pen.quill.name": "Raven Quill",
    "pen.reed.name": "Reed Pen",
    "pen.brush.name": "Ink Brush",
    // steps
    "step.who.title": "Who will you play?",
    "step.who.sub": "Start with your character's name, then tell us a little about you.",
    "label.charname": "Character name",
    "label.pronouns": "Pronouns",
    "label.player": "Player",
    "warn.name": "Give your character a name to continue.",
    "step.class.title": "Choose your class",
    "step.class.sub": "Choose the kind of hero you want to play.",
    "warn.class": "Choose a class to continue.",
    "step.subclass.title": "Choose your subclass",
    "step.subclass.sub": "Choose how your character practices their class.",
    "subclass.item": "You also carry one of these",
    "warn.subclass": "Choose a subclass to continue.",
    "warn.classitem": "Choose the item you carry.",
    "step.heritage.title": "Choose your heritage",
    "step.heritage.sub": "Choose your ancestry and the community you grew up in.",
    "heritage.ancestry": "Ancestry",
    "heritage.community": "Community",
    "warn.ancestry": "Choose an ancestry.",
    "warn.community": "Choose a community.",
    "step.traits.title": "Assign your traits",
    "step.traits.sub": "Distribute +2, +1, +1, +0, +0, −1 among the six traits.",
    "traits.note": "The set must come out exactly: one +2, two +1, two +0, one −1.",
    "warn.traits.all": "Assign every trait.",
    "warn.traits.set": "The set must be exactly +2, +1, +1, +0, +0, −1.",
    "step.arms.title": "Choose your equipment",
    "step.arms.sub": "Choose your weapons, armor, and one potion.",
    "arms.primary": "Primary weapon",
    "arms.secondary": "Secondary (optional — only with a one-handed primary)",
    "arms.armor": "Armor",
    "arms.potion": "Potion",
    "arms.alsocarry": "You also carry:",
    "arms.thresholds": "Thresholds",
    "warn.primary": "Choose a primary weapon.",
    "warn.secondary": "A secondary weapon needs a one-handed primary.",
    "warn.armor": "Choose your armor.",
    "warn.potion": "Choose a potion.",
    "step.exp.title": "Choose your experiences",
    "step.exp.sub": "Two things your past made you good at — a phrase each, +2 when it applies.",
    "label.exp": "Experience",
    "exp.placeholder": "e.g. Raised by wolves, Ship's quartermaster…",
    "warn.exp": "Name both experiences.",
    "step.bg.title": "Your background",
    "step.bg.sub": "Answer whichever questions help you understand your character. You can leave the rest blank.",
    "step.cards.title": "Choose your domain cards",
    "step.cards.sub": "Pick two level-1 cards from {domains}.",
    "cards.count": "{n} of 2 chosen.",
    "warn.cards": "Choose exactly two cards.",
    "step.conn.title": "Connections",
    "step.conn.sub": "Decide what connects you to the other characters.",
    "conn.party": "Already in the settlement: {names}.",
    "step.review.title": "Review your character",
    "step.review.sub": "Check everything before you finish.",
    "review.of": "{ancestry} {class} ({subclass}) of the {community}",
    "review.traits": "Traits",
    "review.arms": "Arms",
    "review.exp": "Experiences",
    "review.cards": "Domain cards",
    "review.carried": "Carried",
    "review.playedby": "played by {player}",
    // sheet
    "sheet.loading": "Loading your character…",
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
    "table.nofolk": "No folk of note yet.",
    "table.nochronicle": "The chronicle is unwritten. The first season awaits.",
    "table.noforeman": "no foreman",
    "table.level": "level",
    "table.character": "Your Character",
    "table.inventory": "Inventory",
    "table.population": "folk",
    "table.season": "season",
    "table.stores": "Stores",
    "table.buildings": "Buildings",
    "table.whoareyou": "Choose your character",
    "table.book.subtitle": "A ledger kept by lamplight",
    "table.book.choose": "Choose a bookmark",
    "table.book.open": "Open the book",
    "table.book.close": "Close the book",
    "table.book.chapter": "Chapter",
    "table.book.previous": "Previous pages",
    "table.book.next": "Next pages",
    "inventory.equipped": "Arms and armor",
    "inventory.pack": "Carried",
    "inventory.cards": "Domain cards",
    "inventory.empty": "Nothing here yet.",
    "inventory.item": "Item",
    "inventory.consumable": "Consumable",
    "inventory.editName": "Edit {name}",
    "inventory.quantityShort": "×{n}",
    "inventory.add": "+ Add item",
    "inventory.error": "The inventory could not be changed.",
    "inventory.consumeConfirm": "Use one of these and remove it from your inventory?",
    "inventory.dieResult": "Result of {die}",
    "inventory.clearWhat": "Clear",
    "inventory.hopeSpend": "Hope to spend",
    "inventory.noChange": "No {target} needed clearing.",
    "inventory.cleared": "Cleared {n} {target}.",
    "inventory.gained": "Gained {n} {target}.",
    "inventory.scar": "You return changed. Record one scar.",
    "inventory.consumed": "The consumable takes effect.",
    "inventory.remaining": "{n} remaining",
    "inventory.new": "New item",
    "inventory.notes": "Your notes",
    "inventory.kind": "Kind",
    "inventory.name": "Name",
    "inventory.description": "Description or rules",
    "inventory.quantity": "Quantity",
    "inventory.save": "Save item",
    "inventory.consume": "Consume",
    "inventory.remove": "Remove",
    "inventory.removeConfirm": "Remove {name} from your inventory?",
    "inventory.useTitle": "Use {name}",
    "inventory.confirmUse": "Apply the effect",
    "conditions.label": "Conditions",
    "conditions.none": "No conditions",
    "condition.hidden.description": "Rolls against you have disadvantage. Hidden ends when an enemy can see you or when you attack.",
    "condition.restrained.description": "You can’t move, but you can still take actions from where you are.",
    "condition.vulnerable.description": "All rolls targeting you have advantage.",
    // identity chooser
    "login.title": "Choose your place at the table",
    "login.subtitle": "Game Master, projector, or player character",
    "login.gm": "Game Master",
    "login.gm.sub": "Manage the settlement",
    "login.projector": "Projector Screen",
    "login.projector.sub": "Open the table display",
    "login.players": "Player characters",
    "login.current": "current on this device",
    "login.placeholder": "example portrait",
    "login.create": "Create a character",
    "login.create.sub": "Create someone new",
    "login.trust": "No passwords. This only remembers the character on this device.",
    // journal
    "journal.title": "The Journal",
    "journal.sub": "Notes from the settlement",
    "journal.pick": "Choose your character",
    "journal.notyou": "Switch character",
    "journal.tab.journal": "Journal",
    "journal.tab.people": "People",
    "journal.tab.places": "Places",
    "journal.search": "Search notes…",
    "journal.write": "Add note",
    "journal.placeholder": "What happened? Names, debts, promises, rumors…",
    "journal.note.person": "What do you know about this person?",
    "journal.note.place": "What do you know about this place?",
    "journal.scope.me": "Private",
    "journal.scope.group": "Shared",
    "journal.yours": "private",
    "journal.edit": "Edit",
    "journal.strike": "Remove",
    "journal.save": "Save",
    "journal.cancel": "Cancel",
    "journal.confirmstrike": "Remove this note?",
    "journal.empty": "No notes yet.",
    "journal.people.empty": "No people beyond the settlement have been added yet.",
    "journal.places.empty": "No places discovered yet.",
    "journal.nonotes": "No notes yet.",
    "journal.carries": "Carries",
    "journal.herenow": "Seen here",
    "journal.unknownplace": "whereabouts unknown",
    "journal.home": "the settlement",
    "journal.open": "Open the journal",
    "journal.pen": "Pen",
    "journal.wiper": "Eraser",
    "journal.putaway": "Done drawing",
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
    "hand.giveup": "Remove",
    "hand.confirmRemove": "Remove {name} from your Vault?",
    "hand.tovault": "It goes to your Vault — your Loadout is full."
  },
  sv: {
    "create.title": "Skapa din rollperson",
    "create.subtitle": "The Settlement — hitta din plats vid bordet",
    "create.part": "Del {n} av {total}",
    "btn.back": "Tillbaka",
    "btn.next": "Nästa",
    "btn.sign": "Slutför rollpersonen",
    "error.generic": "Något gick fel.",
    "error.table": "Spelarvyn kunde inte laddas.",
    "error.characters": "Listan med rollpersoner kunde inte laddas.",
    "step.book.title": "Välj din bok",
    "step.book.sub": "Hur din sida av bordet ser ut. Samma berättelse ryms i vilken som helst.",
    "warn.book": "Välj en bok att föra din rollperson i.",
    "step.pen.title": "Välj din penna",
    "step.pen.sub": "Vad du märker marginalerna med.",
    "warn.pen": "Välj något att skriva med.",
    "review.book": "Din bok",
    "review.pen": "Din penna",
    "shell.tome.name": "Den åldrade luntan",
    "shell.tome.blurb": "En sliten klenod — sprucket läder, levande ljus och ting instuckna mellan sidorna.",
    "shell.book.name": "Den bundna boken",
    "shell.book.blurb": "En ren tvåsidig bok med bokmärken längs kanten.",
    "shell.table.name": "Kortleken",
    "shell.table.blurb": "Breda kort du lägger ut och öppnar — den enklaste, stadigaste vyn.",
    "pen.quill.name": "Korppenna",
    "pen.reed.name": "Rörpenna",
    "pen.brush.name": "Bläckpensel",
    "step.who.title": "Vem ska du spela?",
    "step.who.sub": "Börja med rollpersonens namn och berätta sedan lite om dig.",
    "label.charname": "Rollpersonens namn",
    "label.pronouns": "Pronomen",
    "label.player": "Spelare",
    "warn.name": "Ge rollpersonen ett namn för att fortsätta.",
    "step.class.title": "Välj din klass",
    "step.class.sub": "Välj vilken sorts hjälte du vill spela.",
    "warn.class": "Välj en klass för att fortsätta.",
    "step.subclass.title": "Välj din underklass",
    "step.subclass.sub": "Välj hur rollpersonen utövar sin klass.",
    "subclass.item": "Du bär också en av dessa",
    "warn.subclass": "Välj en underklass för att fortsätta.",
    "warn.classitem": "Välj föremålet du bär med dig.",
    "step.heritage.title": "Välj ditt arv",
    "step.heritage.sub": "Välj rollpersonens härkomst och gemenskapen hen växte upp i.",
    "heritage.ancestry": "Härkomst",
    "heritage.community": "Gemenskap",
    "warn.ancestry": "Välj en härkomst.",
    "warn.community": "Välj en gemenskap.",
    "step.traits.title": "Fördela dina egenskaper",
    "step.traits.sub": "Fördela +2, +1, +1, +0, +0, −1 mellan de sex egenskaperna.",
    "traits.note": "Fördelningen måste bli exakt: en +2, två +1, två +0, en −1.",
    "warn.traits.all": "Ge varje egenskap ett värde.",
    "warn.traits.set": "Fördelningen måste vara exakt +2, +1, +1, +0, +0, −1.",
    "step.arms.title": "Välj din utrustning",
    "step.arms.sub": "Välj vapen, rustning och en dryck.",
    "arms.primary": "Primärt vapen",
    "arms.secondary": "Sekundärt (valfritt — kräver ett enhandsvapen som primärt)",
    "arms.armor": "Rustning",
    "arms.potion": "Dryck",
    "arms.alsocarry": "Du bär också:",
    "arms.thresholds": "Trösklar",
    "warn.primary": "Välj ett primärt vapen.",
    "warn.secondary": "Ett sekundärt vapen kräver ett enhandsvapen som primärt.",
    "warn.armor": "Välj din rustning.",
    "warn.potion": "Välj en dryck.",
    "step.exp.title": "Välj dina erfarenheter",
    "step.exp.sub": "Två saker ditt förflutna gjort dig skicklig på — en fras vardera, +2 när det är relevant.",
    "label.exp": "Erfarenhet",
    "exp.placeholder": "t.ex. Uppfostrad av vargar, Skeppets proviantmästare…",
    "warn.exp": "Namnge båda erfarenheterna.",
    "step.bg.title": "Din bakgrund",
    "step.bg.sub": "Svara på frågorna som hjälper dig förstå rollpersonen. Resten kan lämnas tomma.",
    "step.cards.title": "Välj dina domänkort",
    "step.cards.sub": "Välj två nivå 1-kort från {domains}.",
    "cards.count": "{n} av 2 valda.",
    "warn.cards": "Välj exakt två kort.",
    "step.conn.title": "Band",
    "step.conn.sub": "Bestäm vad som binder dig till de andra rollpersonerna.",
    "conn.party": "Redan i bosättningen: {names}.",
    "step.review.title": "Granska din rollperson",
    "step.review.sub": "Kontrollera allt innan du avslutar.",
    "review.of": "{ancestry} {class} ({subclass}) av {community}",
    "review.traits": "Egenskaper",
    "review.arms": "Vapen & rustning",
    "review.exp": "Erfarenheter",
    "review.cards": "Domänkort",
    "review.carried": "Buret",
    "review.playedby": "spelas av {player}",
    "sheet.loading": "Laddar din rollperson…",
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
    "table.nofolk": "Inga namnkunniga ännu.",
    "table.nochronicle": "Krönikan är oskriven. Den första årstiden väntar.",
    "table.noforeman": "ingen förman",
    "table.level": "nivå",
    "table.character": "Din karaktär",
    "table.inventory": "Packning",
    "table.population": "själar",
    "table.season": "årstid",
    "table.stores": "Förråd",
    "table.buildings": "Byggnader",
    "table.whoareyou": "Välj din rollperson",
    "table.book.subtitle": "En liggare förd i lampsken",
    "table.book.choose": "Välj ett bokmärke",
    "table.book.open": "Öppna boken",
    "table.book.close": "Stäng boken",
    "table.book.chapter": "Kapitel",
    "table.book.previous": "Föregående sidor",
    "table.book.next": "Nästa sidor",
    "inventory.equipped": "Vapen och rustning",
    "inventory.pack": "Buret",
    "inventory.cards": "Domänkort",
    "inventory.empty": "Ingenting här ännu.",
    "inventory.item": "Föremål",
    "inventory.consumable": "Consumable",
    "inventory.editName": "Redigera {name}",
    "inventory.quantityShort": "×{n}",
    "inventory.add": "+ Lägg till föremål",
    "inventory.error": "Packningen kunde inte ändras.",
    "inventory.consumeConfirm": "Använd en och ta bort den från packningen?",
    "inventory.dieResult": "Resultat på {die}",
    "inventory.clearWhat": "Rensa",
    "inventory.hopeSpend": "Hope att spendera",
    "inventory.noChange": "Ingen {target} behövde rensas.",
    "inventory.cleared": "Rensade {n} {target}.",
    "inventory.gained": "Fick {n} {target}.",
    "inventory.scar": "Du återvänder förändrad. Anteckna ett scar.",
    "inventory.consumed": "Consumable-föremålet får effekt.",
    "inventory.remaining": "{n} kvar",
    "inventory.new": "Nytt föremål",
    "inventory.notes": "Dina anteckningar",
    "inventory.kind": "Typ",
    "inventory.name": "Namn",
    "inventory.description": "Beskrivning eller regler",
    "inventory.quantity": "Antal",
    "inventory.save": "Spara föremål",
    "inventory.consume": "Använd",
    "inventory.remove": "Ta bort",
    "inventory.removeConfirm": "Ta bort {name} ur packningen?",
    "inventory.useTitle": "Använd {name}",
    "inventory.confirmUse": "Tillämpa effekten",
    "conditions.label": "Tillstånd",
    "conditions.none": "Inga tillstånd",
    "condition.hidden.description": "Slag mot dig har disadvantage. Hidden upphör när en fiende kan se dig eller när du anfaller.",
    "condition.restrained.description": "Du kan inte förflytta dig, men du kan fortfarande utföra handlingar från din nuvarande plats.",
    "condition.vulnerable.description": "Alla slag som riktas mot dig har advantage.",
    // identity chooser
    "login.title": "Välj din plats vid bordet",
    "login.subtitle": "Game Master, projektorduk eller rollperson",
    "login.gm": "Game Master",
    "login.gm.sub": "Hantera bosättningen",
    "login.projector": "Projektorduk",
    "login.projector.sub": "Öppna bordets skärm",
    "login.players": "Spelarkaraktärer",
    "login.current": "nuvarande på denna enhet",
    "login.placeholder": "exempelporträtt",
    "login.create": "Skapa en karaktär",
    "login.create.sub": "Skapa någon ny",
    "login.trust": "Inga lösenord. Detta minns bara karaktären på den här enheten.",
    // journal
    "journal.title": "Dagboken",
    "journal.sub": "Anteckningar från bosättningen",
    "journal.pick": "Välj din rollperson",
    "journal.notyou": "Byt rollperson",
    "journal.tab.journal": "Dagbok",
    "journal.tab.people": "Personer",
    "journal.tab.places": "Platser",
    "journal.search": "Sök anteckningar…",
    "journal.write": "Lägg till anteckning",
    "journal.placeholder": "Vad hände? Namn, skulder, löften, rykten…",
    "journal.note.person": "Vad vet du om den här personen?",
    "journal.note.place": "Vad vet du om den här platsen?",
    "journal.scope.me": "Privat",
    "journal.scope.group": "Delad",
    "journal.yours": "privat",
    "journal.edit": "Ändra",
    "journal.strike": "Ta bort",
    "journal.save": "Spara",
    "journal.cancel": "Avbryt",
    "journal.confirmstrike": "Ta bort den här anteckningen?",
    "journal.empty": "Inga anteckningar ännu.",
    "journal.people.empty": "Inga personer utanför bosättningen har lagts till ännu.",
    "journal.places.empty": "Inga platser upptäckta ännu.",
    "journal.nonotes": "Inga anteckningar ännu.",
    "journal.carries": "Bär på",
    "journal.herenow": "Sedda här",
    "journal.unknownplace": "okänd hemvist",
    "journal.home": "bosättningen",
    "journal.open": "Öppna dagboken",
    "journal.pen": "Penna",
    "journal.wiper": "Suddgummi",
    "journal.putaway": "Klar med ritandet",
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
    "hand.giveup": "Ta bort",
    "hand.confirmRemove": "Ta bort {name} från ditt Vault?",
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
  // Capture phase: terms often live inside clickable cards whose handlers
  // re-render the page — measure the anchor before it can be detached.
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-term]");
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
    if (el) showTerm(el.dataset.term, el);
    else hideTerm();
  }, true);
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
