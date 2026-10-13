// Rebuild the Swedish handout from the same bilingual rules the chooser uses.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { INVENTOR } from "../server/inventor-definition.js";

const path = fileURLToPath(new URL("../docs/player-workshops/redneck-inventor-class-sv.md", import.meta.url));
const feature = (entry, depth = 2) => `${"#".repeat(depth)} ${entry.sv.name}\n\n${entry.sv.text}\n`;
const tiers = { foundation: "Foundation — från level 1", specialization: "Specialization — kan väljas tidigast vid level 5", mastery: "Mastery — kan väljas tidigast vid level 8, efter Specialization" };
const text = `# Inventor — Rednecks uppfinnarklass

**Speltestversion, godkänd av Oscar som ett val för Amme. Väntar på hennes bekräftelse.**
Version: ${INVENTOR.version} — 13 oktober 2026
Underlag: Ammes idéer om Redneck och Oscars beslut i klassverkstaden.

Det här är den svenska spelartexten till [klassutkastet på engelska](redneck-inventor-class-draft.md). Den innehåller hela klassens regler och båda inriktningarnas utveckling. I appen får bara Redneck erbjudandet. Hans nuvarande rollformulär ändras först när Amme väljer och bekräftar. [Klassvalets kontrakt](../character-class-choices.md) beskriver hur det fungerar.

Speltermer som Hope, Stress, Evasion, Close och Domain-kortens namn står kvar på engelska så att de går att jämföra med korten vid bordet. De nya förmågornas engelska namn följs av svenska förklaringar. ”Strålkastarljuset” betyder att det är din rollpersons handling som står i fokus just nu.

## Idén bakom klassen

${INVENTOR.svDescription}

### Det vi vill uppnå

1. Du ska kunna beskriva överraskande uppfinningar, medan reglerna ger deras effekter tydliga kostnader och gränser.
2. Alla Inventors ska kunna hjälpa gruppen att färdas och överleva tillsammans. Rigger har en tydligare specialitet i förflyttning.
3. Utforskning ska ge användbar materialkunskap och praktiska föremål, utan att du behöver bokföra dussintals olika komponentvalutor.

### Klassens begränsningar

Prepared Parts är ett litet förråd för varje spelmöte. Du väljer mellan att hjälpa slag, återställa Hope och bygga skydd. Ett skydd fungerar från ett visst håll och på en viss plats. Fiender som byter läge, trånga utrymmen och effekter som inte kräver den siktlinjen kan ändra nyttan.

Även utan Parts kan du använda vanliga attacker, Domain-kort, verktyg, materialinsamling och tillverkning. Pålitlig utrustning havererar inte slumpmässigt för att du är uppfinnare. De exakta kostnaderna och kombinationerna är speltestregler. Exemplen är regelgenomgångar, inte bevis för att klassen redan är balanserad.

${INVENTOR.guide.slice(0, 2).map((entry) => feature(entry)).join("\n")}

${feature(INVENTOR.hopeFeature)}

${INVENTOR.classFeatures.map((entry) => feature(entry)).join("\n")}

${INVENTOR.subclasses.map((subclass) => `## Subclass: ${subclass.svName}\n\n${subclass.svDescription} Din Spellcast trait är den Inventor-egenskap du har valt.\n\n${Object.entries(tiers).map(([tier, title]) => `### ${title}\n\n${subclass[tier].map((entry) => feature(entry, 4)).join("\n")}`).join("\n")}`).join("\n")}

${feature(INVENTOR.guide.find((entry) => entry.id === "advancement"))}

| Level | Utveckling |
|---|---|
| 1 | Klassens grundvärden, vald Inventor-egenskap, Pull Together, Prepared Parts, Scavenge and Build, en subclass Foundation och två Domain-kort på level 1. |
| 2 | Vanliga tier achievements och advancements. Välj ett Domain-kort på level 2 eller lägre. En höjd egenskap kan ge fler Parts vid nästa spelmöte. |
| 3 | Vanliga advancements; välj ett Domain-kort på level 3 eller lägre. |
| 4 | Vanliga advancements; välj ett Domain-kort på level 4 eller lägre. |
| 5 | Vanliga tier achievements och advancements. Specialization blir ett möjligt val; välj ett Domain-kort på level 5 eller lägre. |
| 6 | Vanliga advancements. Specialization kan fortfarande väljas om du inte har tagit den; välj ett Domain-kort på level 6 eller lägre. |
| 7 | Vanliga advancements; välj ett Domain-kort på level 7 eller lägre. |
| 8 | Vanliga tier achievements och advancements. Mastery blir ett möjligt val efter Specialization; välj ett Domain-kort på level 8 eller lägre. |
| 9 | Vanliga advancements; välj ett Domain-kort på level 9 eller lägre. |
| 10 | Vanliga advancements; välj ett Domain-kort på level 10 eller lägre. |

${INVENTOR.guide.filter((entry) => ["background", "connections"].includes(entry.id)).map((entry) => feature(entry)).join("\n")}

## Tre exempel vid bordet

### Fiender rusar över öppen mark

Redneck har två Parts, med värdena 2 och 4. Han spenderar tärningen med 2 för att sätta upp en vikskärm inom Close. Det låga värdet gör inte skyddet sämre. Kaja står bakom skärmen; pilar som passerar genom den avfyras med disadvantage. En svärdsman som når hennes oskyddade sida kan anfalla henne som vanligt.

Redneck kan i stället spendera båda tärningarna för ett skydd som blockerar siktlinjen. Då kan varken han eller Kaja skjuta rakt genom barrikaden. Han måste välja platsen innan fiendens attack avgörs.

Vill Amme göra lassot av styltorna och Kajas hår måste Kajas spelare först gå med på att håret används. Redneck gör ett lämpligt slag för att snabbt montera och använda lassot och spenderar tärningen med 4 genom Improvise. Slaget avgör om han fångar, fäller eller styr undan det avsedda målet. Lassot håller inte automatiskt fast en hel grupp anstormande fiender.

### Förflyttning och räddning

En Rigger är på Far-avstånd från någon som behöver hjälp. Redneck markerar en Stress för Long Strides och förflyttar sig upp till Far som en del av sitt action roll, om marken och styltorna tillåter det. Han når Melee bara om målet faktiskt ligger inom den tillåtna förflyttningen. Far är ett avstånd, inte teleportering.

Vid ett senare lämpligt tillfälle kan han använda flyganordningen och markera en Stress för att bära en villig kamrat. Pull Together kan i stället flytta honom och en närbelägen kamrat vid level 1 längs en möjlig färdväg för tre Hope. Det är olika kostnader och tillfällen, inte en enda gratis följd av alla förflyttningsförmågorna.

### Ett obekant material

Amme vill göra en hopfällbar stödskena av ett nytt träslag. Oscar sätter Difficulty 15 för att bedöma och samla lämpligt material. Rednecks slag blir 14. Han spenderar en Part med värdet 3 genom Improvise och får totalt 17. Det ursprungliga Hope/Fear-utfallet ändras inte.

Han får materialet. Med några minuter och tillgängliga bindningar behövs inget andra slag för samma materialbedömning när han bygger den enkla skenan. Efter ett användbart prov antecknar Amme och Oscar vad han har lärt sig. Träslaget är nu bekant för den sortens användning. Skenan hjälper vanlig behandling; den ger ingen gratis Mending Touch-effekt.

## Vad händer i olika situationer?

Det här är följder av de skrivna reglerna, inte resultat från speltest.

| Situation | Så används reglerna |
|---|---|
| Dina Parts visar 1 och 4 | Vilken tärning som helst ger cover. Båda blockerar sikten. Du kan spara det högre värdet till ett slag eller Hope. |
| Dina Parts är slut | Vanligt hantverk, attacker, Domain-kort, flygning och andra resurser fungerar fortfarande. Materialinsamling ger inga nya Parts. |
| Hope är slut och Stress är fullt | Ingen Pull Together eller Stress-betald förflyttning. Vanlig Rigger-flygning, vanlig rörelse, attacker och säkert hantverk fungerar fortfarande. |
| En avståndsfiende byter vinkel | Barrikaden kanske inte längre skymmer attacken. |
| En fiende anfaller en oskyddad allierad | En annan kamrats cover skyddar inte automatiskt den utsatta allierade. |
| En tät barrikad står mellan båda sidor | Båda sidor saknar sikt genom den. Det är ingen skottglugg som bara fungerar åt ett håll. |
| En effekt kräver inte den siktlinjen | Effekten används som vanligt. Barrikaden ger ingen allmän immunitet. |
| Två skydd överlappar | Cover ger inte dubbelt disadvantage. Fieldwrights egna lägesbonusar staplas inte med sig själva. |
| En fiende angriper ett förstärkt skydd | Ett lämpligt tillfälle för förstörande tar bort förstärkningen. Ett andra kan förstöra skyddet. Fienden kan fortfarande gå runt. |
| Du packar undan ett lånat rep | Repet kan återlämnas när det är rimligt. Spenderade Parts återkommer aldrig. |
| Du samlar samma nya material flera gånger | Du får de mängder som faktiskt finns. Inga nya Parts, Hope eller automatiska bosättningsresurser skapas. |
| Du vill bygga ett nytt vapen eller en ny rustning | Använd godkända utrustningsvärden och vanliga tier-gränser. En omgång material ger inte obegränsade sifferförbättringar. |
| En anordning hjälper i en social scen | Beskriv en rimlig demonstration, lagning eller praktisk hjälp. Vanliga Presence-slag och Improvise kan användas. |
| Lågt tak gör flygning opraktisk | Förflyttning på marken, skydd, vanliga attacker och Valor/Splendor finns kvar. |
| En annan förmåga förlänger samma rörelse | Long Strides använder det längsta tillåtna avståndet. Avstånden läggs inte ihop. |

## Det vi främst vill prova under spel

1. Skyddets värde under en hel scen: hindrar en eller två Parts alltför ofta nästan allt fienden vill göra? Prova flera skottvinklar, närstrid, öppen mark och smala korridorer. Storlek, riktning och varaktighet är de första sakerna att justera.
2. Förrådets storlek: med egenskapsvärdet +2 får Redneck två Parts per spelmöte. Är det ett intressant val, eller används huvudförmågan för sällan? Obegränsad påfyllning är ingen lösning.
3. Riggers rörlighet: jämför vingar, bärförmåga och styltor vid level 1 med Winged Sentinel. Long Strides är tillägget; extra skada från luften kommer senare med Specialization.
4. Fieldwrights nytta: jämför gemensamma skydd och lägesbonusar med flygning i kampanjens verkliga terräng, även utan avståndsfiender.
5. Höga levels: prova gruppflygning och större gruppskydd var för sig innan de används i en viktig scen på level 8.
6. Hantverkets tempo: hjälper små redskap äventyret, eller leder de till långa inköps- och konstruktionsdiskussioner? Håll en materialanteckning och en föremålsfunktion lätta att läsa vid bordet.

De viktigaste öppna frågorna är förrådet per spelmöte, om Splendor passar bäst på sikt och hur stor plats skyddet bör ta i praktiken. Det finns fullständiga tillfälliga regler för allt detta, så ni kan prova klassen innan varje smakfråga är avgjord.

## När Amme bekräftar sitt val

${INVENTOR.migration.svText}

| Nuvarande del av Redneck | Om du väljer Inventor |
|---|---|
| Namn, Dwarf, Ridgeborne, minnen, porträtt, Inventory, kampanj och historia | Behålls. |
| Egenskapsvärden och överenskommelsen om huvudegenskap | Värdena behålls; du anger den valda Inventor-egenskapen uttryckligen. |
| Evasion, max-HP, markerad HP, Stress, Hope, Armor och skadetrösklar | Behålls. Klassen har samma grundvärden som Seraph, och bytet läker eller återställer inget. |
| Splendor + Valor, Mending Touch och Forceful Push | Behålls. |
| Prayer Dice | Ersätts av Prepared Parts, med det nya aktiva skyddsbygget. |
| Life Support | Ersätts av Pull Together. Direkt läkning för 3 Hope försvinner; Mending Touch finns kvar. |
| Wings of Light: flygning och bärförmåga | Behålls genom Riggers Mechanical Wings. Fieldwright ger andra förmågor. |
| Extra skada från luften vid level 1 | Flyttas till Riggers Specialization. Long Strides finns från level 1 i stället. |
| Framtida advantage på Presence under flygning och möjlighet att minska Fear | Ersätts av Rescue Harness och Aerial Impact i Rigger. |
| Framtida permanent +4 Severe damage threshold | Ingår inte i Rigger, som i stället får gruppflygning och starkare Aerial Impact. Fieldwright får en lägesbunden tröskelbonus. |
| Utrustningens utseende och godkända värden | Behålls. |

Väljer du att behålla Seraph / Winged Sentinel stängs erbjudandet utan något regelbyte. Nya subclass-steg ges aldrig automatiskt enbart för att din level stiger.

## Underlag och versionshantering

- [Daggerheart Homebrew Kit](https://www.daggerheart.com/wp-content/uploads/2025/07/Daggerheart-Homebrew-Kit-v1.0-July-31-2025.pdf), vägledning för klasser och subclasses, s. 11–14.
- [Daggerheart SRD 2.0](https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf), Seraph/Winged Sentinel, cover, förflyttning och downtime. Byggandet, kostnaderna och kombinationerna här är homebrew.
- [Officiella rollformulär och guider](https://www.daggerheart.com/wp-content/uploads/2025/05/Character-Sheets-and-Guides-Daggerheart-May212025.pdf), advancement-val och subclass-steg.
- [Verkstadsunderlaget](amme-inventor-class-brief.md), spelarens egna idéer och offentliga rollpersonsfakta.

Den lokala referensen och nyare SRD kan skilja sig i enskilda utrustningsposter. Det här valet uppdaterar inte den allmänna regelreferensen eller Rednecks utrustningsvärden. Inga hemliga kampanjtexter eller event-/chance-table-resultat har använts.

Regeltexten i appen och denna svenska spelartext kommer från samma [tvåspråkiga definition](../../server/inventor-definition.js). Återskapa texten med \\node tools/render-inventor-translation.js\\ och kontrollera den med tillägget \\--check\\. Balans behöver fortfarande prövas vid bordet.
`.replace(/\\(node tools\/render-inventor-translation\.js|--check)\\/g, "`$1`");

if (process.argv.includes("--check")) {
  if (!fs.existsSync(path) || fs.readFileSync(path, "utf8") !== text) {
    console.error("The Swedish Inventor handout needs to be regenerated.");
    process.exitCode = 1;
  } else console.log("Swedish Inventor handout matches the bilingual class rules.");
} else {
  fs.writeFileSync(path, text, "utf8");
  console.log("Updated docs/player-workshops/redneck-inventor-class-sv.md");
}
