// Redneck's table-approved playtest proposal. Never add this to /api/reference.
// English and Swedish rules share identifiers and are released only by the
// targeted class-choice API. This is the executable source for the translation.
const feature = (id, name, text, svName, svText) => ({ id, name, text, sv: { name: svName, text: svText } });

export const INVENTOR_VERSION = "0.1";
export const INVENTOR_ID = "homebrew_class_inventor";
export const INVENTOR_TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

const hopeFeature = feature("pull-together", "Pull Together",
`When you have the spotlight, spend 3 Hope to deploy a travel rig and move yourself and up to your Proficiency willing allies within Very Close range of you to a point within Close range of you. Describe a practical method; each participant may decline.

The route must be physically possible for the device. This does not grant flight, pass through solid obstacles, or clear conditions preventing movement. Unavoidable environmental hazards still require ordinary rolls. No Prepared Parts are required. At Proficiency 1 you move yourself and one companion. This cannot interrupt an attack that has already resolved.`,
"Pull Together — Ta er fram tillsammans",
`När du har strålkastarljuset kan du spendera 3 Hope för att sätta upp en färdanordning och förflytta dig själv och upp till lika många villiga allierade som din Proficiency. De allierade ska vara inom Very Close från dig, och målet ska vara inom Close från dig. Beskriv hur ni tar er fram: med en draglina, utfällbara trappsteg, en rullande plattform eller någon annan praktisk lösning. Var och en får tacka nej till förflyttningen.

Vägen måste vara fysiskt möjlig för anordningen. Förmågan ger inte flygförmåga, låter er inte passera genom fasta hinder och tar inte bort Conditions som hindrar förflyttning. Om ni måste utsätta er för en fara i omgivningen gäller de vanliga slagen. Du behöver inga Prepared Parts. Med Proficiency 1 kan du ta med dig en kamrat. Förmågan är ett gemensamt sätt att ta er därifrån; den kan inte avbryta en attack vars följder redan har avgjorts.`);

const parts = feature("prepared-parts", "Prepared Parts",
`At the start of each session, clear your previous reserve and roll d4s equal to your chosen Inventor trait, minimum one. Keep the dice and their results as Prepared Parts. Discard unused Parts at session end. One Part is one retained die, not a point on its face. Spend each die once for one use:

Improvise: Spend any number of Parts to add their values to your own action or reaction roll, or an ally's within Far. Describe the practical assistance. Spend after rolling but before consequences resolve. Change the total, not which Duality Die is higher. Ordinary assistance follows normal stacking rules.

Restore Confidence: Spend any number of Parts to give yourself or an ally within Far Hope equal to their values, respecting the recipient's Hope limit.

Prepared Defense: Spend one Part for cover or two Parts to block line of sight, following the deployment rules. Die values do not affect the defense.

The same Part cannot pay for more than one use. Gathering, packing up, repairs and rests do not replenish Parts; ordinary materials cannot become Parts.`,
"Prepared Parts — Förberedda delar",
`I början av varje spelmöte tömmer du ditt tidigare förråd och slår lika många d4 som värdet i din valda Inventor-egenskap, men alltid minst en. Spara tärningarna och resultaten som dina Prepared Parts. Oanvända Parts försvinner när spelmötet slutar. En Part är en hel sparad tärning, inte en poäng på tärningen. Varje tärning kan användas en gång, till ett av följande ändamål:

Improvise — Improvisera: Spendera valfritt antal Parts och lägg ihop deras värden. Lägg summan till ett action roll eller reaction roll som du gör, eller som en allierad inom Far gör. Beskriv anordningen, justeringen eller den praktiska hjälpen. Du spenderar tärningarna efter slaget, innan följderna avgörs. Du ändrar totalsumman, inte vilken Duality Die som är högst. Vanlig hjälp kan användas samtidigt enligt spelets vanliga regler.

Restore Confidence — Återställ tillförsikten: Spendera valfritt antal Parts för att ge dig själv eller en allierad inom Far lika mycket Hope som tärningarnas sammanlagda värde. Mottagarens vanliga maxgräns för Hope gäller.

Prepared Defense — Förberett skydd: Spendera en Part för cover, eller två Parts för ett skydd som blockerar siktlinjen. Följ reglerna för att sätta upp skyddet. Tärningarnas värden påverkar inte hur bra skyddet är.

Samma Part kan aldrig betala för flera användningar. Att samla material, packa ihop ett skydd, reparera utrustning eller vila ger inga nya Parts. Vanligt material kan inte omvandlas till Parts.`);

const defense = feature("prepared-defense", "Prepared Defense: deployment",
`On your spotlight, spend the required Parts to deploy a small stationary defense at a physically reachable point within Close, using your toolkit, gear and available materials. Describe its construction and protected direction. You may reposition within Close along a possible route; hazardous movement may require a normal roll. Ordinary assembly needs no extra roll.

Deployment is your substantive contribution to this spotlight, without a separate attack. It cannot interrupt an attack already resolving or assemble remotely through an obstruction. The base defense fits one creature approximately your size or smaller directly behind it, protects one direction, and lasts for the current scene unless dismantled or destroyed. Close is placement range, not protected radius.

One Part: partial obstruction gives cover; attacks through it have disadvantage. Two Parts: total obstruction blocks line of sight; ranged attacks requiring sight cannot pass through it. Both sides' attacks are obstructed. Moving around can bypass it. It gives no automatic damage reduction or Armor Slots.

An adversary able to reach and break or dismantle it may spend its spotlight doing so. That destruction does not also attack the protected creature. Repositioning around it remains possible. After the scene it is packed, exhausted or comes apart as fits the construction. Recover ordinary borrowed gear when plausible, without refunding Parts. Permanent fortifications need separate construction or projects. Another player's gear or materials require their agreement.`,
"Prepared Defense — Sätt upp ett skydd",
`När du har strålkastarljuset spenderar du de Parts som behövs för att bygga och sätta upp ett litet, stillastående skydd på en plats inom Close. Använd verktyg, medförd utrustning och lämpligt material som finns till hands. Beskriv vad du bygger och från vilket håll det skyddar. Du får förflytta dig inom Close medan du sätter upp det, så länge vägen är fysiskt möjlig. En farlig väg kan kräva ett vanligt slag; själva monteringen kräver inget extra slag.

Att sätta upp skyddet är ditt huvudsakliga bidrag när du har strålkastarljuset. Du gör inte också en separat attack. Du kan inte skjuta in skyddet i en attack som redan håller på att avgöras, eller bygga på distans genom ett hinder. Din utrustning måste kunna nå platsen.

Grundskyddet rymmer en varelse av ungefär din storlek eller mindre, direkt bakom det. Det skyddar från ett bestämt håll och varar under den pågående scenen, om det inte monteras ned eller förstörs. Tänk skärm eller liten barrikad, snarare än en vägg tvärs genom ett helt rum. Close anger var skyddet får placeras, inte hur stor yta det skyddar.

En Part: ett delvis skymmande hinder ger cover. En attack som passerar genom skyddet görs med disadvantage.

Två Parts: ett helt skymmande hinder blockerar siktlinjen. En avståndsattack som kräver fri sikt kan inte göras genom skyddet.

Skyddet hindrar även attacker från den skyddade sidan. En varelse kan flytta sig för att se eller anfalla runt det, men förlorar då skyddet från det hållet. Cover minskar inte skada automatiskt och ger inga Armor Slots.

En fiende som kan nå skyddet och bryta sönder eller montera ned det får använda sitt strålkastarljus till det. Att förstöra skyddet innebär inte också en attack mot den skyddade varelsen. Fienden kan i stället gå runt när situationen tillåter det; spelledaren beskriver hur motdraget fungerar.

Efter scenen packas det tillfälliga bygget ihop, är förbrukat eller håller inte längre samman, beroende på konstruktionen. Vanlig lånad utrustning kan återlämnas, men spenderade Parts förblir spenderade. En permanent befästning kräver ett eget bygge eller projekt. Du får använda en annan rollpersons utrustning eller material bara med den spelarens medgivande; du bestämmer inte över Kajas hår eller utrustning.`);

const craft = feature("scavenge-and-build", "Scavenge and Build",
`Choose two specific familiar materials you have worked with, not "all wood" or "all metal". With a source and time, describe what you want. The GM establishes availability, harvesting and risks. If uncertain, make an action roll using an appropriate trait or the agreed trait ruling; relevant Experiences use normal rules. Familiarity, access, quality and conditions affect Difficulty.

Suggested starting points: safe accessible familiar material needs no roll with sufficient time; familiar with complications Difficulty 10; reasonably accessible unfamiliar material 15; especially strange or demanding material 20. Adjust to the situation.

Success yields one useful batch, enough for a small mundane invention or a meaningful larger-project contribution. Record its name and properties in inventory. Success with Fear still yields the batch, with ordinary complications. Failure yields no suitable batch and normal consequences. There is no extra malfunction roll. Retry only with a changed approach, source, tools or meaningful time investment.

With suitable materials and a few minutes, make a small mundane item with one clear function. A successful assessment already established suitability; do not reroll the same uncertainty for simple assembly. Specific extra components must be available; borrowed gear needs consent. In a dangerous scene you may assemble a small achievable tool as part of the action roll using it: spend at least one Part via Improvise, also adding its value. Prepared Defense uses its own cost and deployment.

Items provide ordinary fictional functions. Automatic healing, permanent numerical bonuses, guaranteed conditions, superior weapon profiles or domain-card powers require a separately agreed rule. Mundane traps can work through normal rolls and positioning. Larger, intricate or lasting constructions use Work on a Project and a GM-set countdown with appropriate resources. This does not grant settlement buildings or seasonal resources.

After a successful build and test with unfamiliar material, agree one learned useful property with the GM and add it to your familiar list for those tested uses. A genuine Work on a Project study can also teach it. Picking up a sample alone does not. Learning cannot make an unsuitable material fit every invention.`,
"Scavenge and Build — Samla och bygg",
`Välj två bestämda material som du är van att arbeta med. Det kan vara ett lokalt träslag, en sorts skinn eller en viss sten. ”Allt trä” eller ”alla metaller” gör dig inte förtrogen med varje ny art eller legering. Din förberedda utrustning kan vara tillverkad av material du redan kan hantera.

Samla material: När du har tillgång till en användbar källa och tid att arbeta beskriver du vilket material eller vilken komponent du vill åt. Spelledaren avgör om det finns där, vad som krävs för att ta vara på det och vilka risker som finns. Om utfallet är osäkert gör du ett action roll med en lämplig egenskap eller enligt er överenskommelse om huvudegenskap. En relevant Experience används enligt de vanliga reglerna.

Hur väl du känner materialet påverkar Difficulty, tillsammans med tillgänglighet, kvalitet och omständigheter. Följande är riktmärken, inte fasta svårighetsgrader:
• Bekant, lättillgängligt material utan nämnvärd risk: inget slag, om du har tillräckligt med tid.
• Bekant material med en verklig komplikation: Difficulty 10.
• Obekant material som rimligen går att bedöma och ta vara på: Difficulty 15.
• Särskilt främmande eller krävande material: Difficulty 20.

Vid framgång får du en användbar omgång material: tillräckligt för en liten, icke-magisk uppfinning eller ett betydelsefullt bidrag till ett större projekt. Anteckna namn och användbara egenskaper i din Inventory. Det är faktiskt material, inte en ny sorts stridsresurs.

Vid framgång med Fear får du fortfarande materialet. Komplikationen kan handla om tid, buller, ansträngning, tillträde eller omgivningen. Vid misslyckande får du inte tillräckligt användbart material eller rätt kvalitet, och slagets vanliga följder gäller. Du slår inget extra slag för maskinhaveri. Ett nytt försök kräver en ändrad metod, en annan källa, andra verktyg eller att du lägger ned betydligt mer tid; samma slag i en oförändrad situation ger ingen obegränsad skörd.

Bygg en uppfinning: Med lämpligt material och några minuter under rimliga arbetsförhållanden kan du tillverka ett litet, icke-magiskt föremål med en tydlig praktisk funktion. Ett lyckat bedömnings- eller insamlingsslag har redan visat att materialet duger. Enkel montering kräver inte ett andra slag för samma osäkerhet.

Det kan vara en stödskena, en krokförsedd stång, en hopfällbar släde, en talja, ett klätterhjälpmedel eller en lätt vikskärm. Materialet blir en del av föremålet. Behövs också rep, gångjärn, fästen eller andra komponenter måste de faktiskt finnas tillgängliga. Lånad utrustning kräver spelarens medgivande.

I en farlig scen kan du bygga ett litet improviserat redskap som en del av det action roll där du använder det. Beskriv ett genomförbart bygge och spendera minst en Part genom Improvise på slaget. Det möjliggör den snabba monteringen och lägger samtidigt tärningens värde till försöket. Prepared Defense har i stället sin egen kostnad och sina egna monteringsregler.

Föremålet gör det som konstruktionen rimligen kan göra. Automatisk läkning, permanenta sifferbonusar, garanterade Conditions, bättre vapenvärden eller Domain-kortens krafter kräver en separat överenskommen regel. En vanlig fälla kan ändå vara användbar genom placering, lämpliga slag och deras följder.

Större, komplicerade eller varaktiga byggen använder Work on a Project, med en nedräkning som spelledaren sätter. Arbetet och lämpliga resurser avgör nedräkningen; det finns ingen allmän receptprislista. En liten uppfinning ute i fält ger varken en ny byggnad i bosättningen eller säsongsresurser.

Lär känna materialet: När du har byggt och provat något framgångsrikt med ett obekant material kommer du och spelledaren överens om en användbar upptäckt. Lägg till materialet bland dem du känner, med en kort anteckning som ”böjer sig bra, men klarar inte tung belastning”. Du kan också lära dig genom att undersöka ett prov som ett riktigt Work on a Project. Att bara plocka upp provet räcker inte. När du har lärt dig materialet fungerar det pålitligt inom de användningar du har provat; det gör inte ett olämpligt material lämpligt till allt.`);

const rigger = {
  id: "homebrew_subclass_rigger", name: "Rigger", svName: "Rigger — Färdbyggare",
  description: "Build your own wings and travel rigs to carry companions through danger. The suggested path for Redneck.",
  svDescription: "Bygg egna vingar och färdanordningar för att ta dig och dina kamrater genom faror. Den föreslagna inriktningen för Redneck.",
  foundation: [
    feature("mechanical-wings", "Mechanical Wings", "You can fly using your personal travel rig. While flying, mark one Stress to pick up and carry one willing creature approximately your size or smaller. Ordinary flight costs no Stress or Parts.", "Mechanical Wings — Mekaniska vingar", "Du kan flyga med din egen färdanordning. När du flyger kan du markera en Stress för att lyfta och bära en villig varelse av ungefär din storlek eller mindre. Vanlig flygning kostar varken Stress eller Parts."),
    feature("long-strides", "Long Strides", "With your ground travel rig, mark one Stress to move up to Far instead of Close as part of an action roll. The route must suit the device. Do not add this to other movement extensions; use the greatest permitted distance.", "Long Strides — Långa kliv", "När du använder din färdanordning på marken kan du markera en Stress för att förflytta dig upp till Far i stället för Close som en del av ett action roll. Vägen måste passa anordningen. Om flera förmågor förlänger samma förflyttning lägger du inte ihop avstånden; använd det längsta tillåtna avståndet.")
  ],
  specialization: [
    feature("rescue-harness", "Rescue Harness", "Mechanical Wings can carry two willing creatures, each approximately your size or smaller, for the same one-Stress cost.", "Rescue Harness — Räddningssele", "Med Mechanical Wings kan du bära två villiga varelser, var och en av ungefär din storlek eller mindre, i stället för en. Kostnaden är fortfarande en Stress."),
    feature("aerial-impact", "Aerial Impact", "While flying, spend one Hope after a successful attack to add 1d8 damage, once per attack.", "Aerial Impact — Slag från ovan", "När du flyger kan du spendera en Hope efter en lyckad attack för att lägga till 1d8 skada. Du kan göra det en gång per attack.")
  ],
  mastery: [
    feature("flock-flight", "Flock Flight", "Once per long rest, spend two Prepared Parts to lend flying rigs to up to your Proficiency willing allies within Close. They fly for the current scene or ten minutes, whichever ends first, controlling their own movement. At expiry only controlled descent toward the ground beneath them remains; landing hazards still apply. This grants flight only, without carrying, Long Strides or Aerial Impact. Returned rigs do not refund Parts. Personal wings remain reusable; ordinary familiar-material use does not randomly break them. Repair or replace damaged mundane rigs through Scavenge and Build or a project.", "Flock Flight — Flyg i flock", "En gång per long rest kan du spendera två Prepared Parts för att låna ut tillfälliga flyganordningar till upp till lika många villiga allierade som din Proficiency. De ska vara inom Close. De kan flyga under den pågående scenen eller i tio minuter, beroende på vilket som tar slut först, och styr själva sin förflyttning. När tiden löper ut tillåter anordningarna bara en kontrollerad nedstigning mot marken rakt under varje användare. Faror på landningsplatsen gäller fortfarande. Anordningarna ger bara flygförmåga, inte din bärförmåga, Long Strides eller Aerial Impact. Du får inga Parts tillbaka när utrustningen återlämnas. Dina egna vingar går att återanvända. Förlust eller avsiktlig förstörelse kan få följder, men vanlig användning med bekant material orsakar inga godtyckliga haverier. Skadade icke-magiska anordningar lagas eller ersätts genom Scavenge and Build eller ett lämpligt projekt."),
    feature("perfected-impact", "Perfected Impact", "Aerial Impact adds 1d12 instead of 1d8 for the same Hope cost.", "Perfected Impact — Fulländat nedslag", "Aerial Impact ger 1d12 extra skada i stället för 1d8. Hope-kostnaden är densamma.")
  ]
};
const fieldwright = {
  id: "homebrew_subclass_fieldwright", name: "Fieldwright", svName: "Fieldwright — Fältbyggare",
  description: "Create defensible positions, shelter companions and carry a workshop into the wilderness.",
  svDescription: "Skapa skyddade positioner, ge kamraterna skydd och ta verkstaden med dig ut i vildmarken.",
  foundation: [
    feature("shared-shelter", "Shared Shelter", "Your Prepared Defenses fit two creatures approximately your size or smaller instead of one. They must stand together behind the same defense within Very Close of each other.", "Shared Shelter — Gemensamt skydd", "Dina Prepared Defenses rymmer två varelser av ungefär din storlek eller mindre i stället för en. De måste stå tillsammans bakom samma skydd, inom Very Close från varandra."),
    feature("braced-position", "Braced Position", "Gain +1 Evasion while within Melee of your Prepared Defense on its protected side. Multiple defenses do not stack this bonus.", "Braced Position — Stadigt läge", "Du får +1 Evasion när du befinner dig inom Melee från ditt Prepared Defense och på dess skyddade sida. Flera skydd ger inte flera sådana bonusar.")
  ],
  specialization: [
    feature("reinforce", "Reinforce", "When deploying a Prepared Defense, spend one additional Part to reinforce it. The first adversary spotlight breaking or dismantling it removes reinforcement; a second can destroy it. Enemies may still move around it.", "Reinforce — Förstärk", "När du sätter upp ett Prepared Defense får du spendera ytterligare en Part för att förstärka det. Första gången en fiende använder sitt strålkastarljus till att bryta sönder eller montera ned skyddet försvinner förstärkningen. Nästa sådant tillfälle kan förstöra skyddet. Fienden kan fortfarande gå runt det."),
    feature("field-workshop", "Field Workshop", "Once per long rest, when you take Work on a Project to build or repair a mundane invention, you and one willing ally helping may each clear one marked Armor Slot.", "Field Workshop — Fältverkstad", "En gång per long rest, när du använder Work on a Project för att bygga eller laga en icke-magisk uppfinning, får du och en villig allierad som hjälper dig vardera rensa en markerad Armor Slot.")
  ],
  mastery: [
    feature("shelter-for-all", "Shelter for All", "Your Prepared Defenses fit up to your Proficiency plus one creatures instead of two. Form one group within Very Close of the defense on its protected side. Normal one- or two-Part costs remain.", "Shelter for All — Skydd för alla", "Dina Prepared Defenses kan rymma upp till din Proficiency plus en varelse i stället för två. Varelserna måste bilda en grupp inom Very Close från skyddet och stanna på dess skyddade sida. Skyddets vanliga kostnad på en eller två Parts gäller fortfarande."),
    feature("load-bearing", "Load-bearing", "While within Melee of your Prepared Defense on its protected side, increase your Severe damage threshold by 4. This does not stack across defenses and ends when you leave or the defense stops functioning.", "Load-bearing — Bärande konstruktion", "När du är inom Melee från ditt Prepared Defense och på dess skyddade sida höjs din Severe damage threshold med 4. Flera skydd ger inte flera sådana bonusar. Fördelen upphör när du lämnar läget eller skyddet slutar fungera.")
  ]
};

// The sheet is a quick reference; the guide/handout retain the complete rules.
// These summaries change presentation only, never the underlying rule text.
hopeFeature.sheetText = {
  en: "On your spotlight, spend 3 Hope to move yourself and up to your Proficiency willing allies within Very Close to a point within Close. Describe a physically possible travel rig. No Parts required. No flight, passing solid obstacles or clearing movement-preventing conditions; normal hazard rolls still apply.",
  sv: "När du har strålkastarljuset: spendera 3 Hope för att flytta dig själv och upp till lika många villiga allierade som din Proficiency. De ska vara inom Very Close; målet ska vara inom Close. Beskriv en fysiskt möjlig färdanordning. Inga Parts behövs. Ger inte flygning, passage genom fasta hinder eller befrielse från Conditions som hindrar rörelse. Vanliga slag för faror gäller."
};
parts.sheetText = {
  en: "At session start roll d4s equal to your Inventor trait, minimum one. Keep each die/value as one Part; discard unused dice at session end. Spend each die once: Improvise adds its value to your/ally's action or reaction total within Far after rolling but before consequences; Restore Confidence gives that much Hope within Far, up to the recipient's limit; Prepared Defense costs 1 Part for cover or 2 for blocked sight. Ordinary materials and rests never refill Parts.",
  sv: "I början av spelmötet: slå lika många d4 som din Inventor-egenskap, minst en. Spara varje tärning och dess värde som en Part. Oanvända tärningar försvinner vid spelmötets slut. Varje tärning spenderas en gång: Improvise lägger värdet till ditt eller en allierads action roll eller reaction roll inom Far, efter slaget men före följderna. Restore Confidence ger lika mycket Hope inom Far, upp till mottagarens maxgräns. Prepared Defense kostar 1 Part för cover eller 2 för blockerad sikt. Material och vila fyller aldrig på Parts."
};
defense.sheetText = {
  en: "On your spotlight, deploy a small stationary defense within physically reachable Close: 1 Part gives disadvantage to attacks through it; 2 block line of sight both ways. One creature your size or smaller, one direction, current scene. Close is placement range, not area. Deployment is your contribution, without a separate attack or interrupt. No damage reduction/Armor Slots. Enemies may go around or spend a suitable spotlight breaking it. Borrowed gear requires consent; packing up never refunds Parts. Read the guide for full limits.",
  sv: "När du har strålkastarljuset: sätt upp ett litet, stillastående skydd på en nåbar plats inom Close. 1 Part ger disadvantage på attacker genom skyddet; 2 blockerar siktlinjen åt båda håll. Grundskyddet rymmer en varelse av din storlek eller mindre, skyddar från ett håll och varar scenen ut. Close är placeringsavståndet, inte ytan. Bygget är ditt bidrag, utan separat attack eller avbrott i en pågående attack. Ger ingen skademinskning eller Armor Slots. Fiender kan gå runt eller använda ett lämpligt tillfälle till att förstöra skyddet. Lånad utrustning kräver medgivande; inga Parts återfås. Se guiden för alla gränser."
};
craft.sheetText = {
  en: "Start with two specific familiar materials. With a source/time, gather one useful batch on success. Suggested Difficulty: safe familiar no roll; familiar complication 10; unfamiliar 15; strange 20. Fear success still yields material. Build a small mundane item with one practical function in a few minutes; don't reroll the same material assessment. Rapid building during danger requires a Part through Improvise on the action using the tool. Large/intricate/lasting builds use Work on a Project. Testing or study makes new material familiar for tested uses. No automatic healing, stat upgrades or domain powers.",
  sv: "Börja med två bestämda, bekanta material. Med en källa och tid får du en användbar omgång vid framgång. Riktmärken för Difficulty: säkert, bekant material utan slag; bekant med komplikation 10; obekant 15; särskilt främmande 20. Framgång med Fear ger fortfarande materialet. Bygg ett litet, icke-magiskt föremål med en praktisk funktion på några minuter, utan nytt slag för samma materialbedömning. Snabbt bygge under fara kräver en Part genom Improvise på slaget där redskapet används. Stora, komplicerade eller varaktiga byggen använder Work on a Project. Prov eller studier gör nya material bekanta för prövade användningar. Ger ingen automatisk läkning, sifferförbättring eller Domain-kraft."
};

export const INVENTOR = {
  id: INVENTOR_ID, version: INVENTOR_VERSION, name: "Inventor", svName: "Inventor — Uppfinnare",
  domains: ["SPLENDOR", "VALOR"], evasion: 9, hp: 7,
  setup: { traits: [...INVENTOR_TRAITS], familiarMaterialCount: 2 },
  migration: {
    text: "Keep traits, gear, domain cards, ancestry, community and marked resources. Replace Prayer Dice with Prepared Parts, Life Support with Pull Together, and your subclass Foundation. The direct 3-Hope heal is lost; Mending Touch remains. Rigger keeps flight and adds ground movement; aerial damage moves to Specialization. Fieldwright replaces flight with stronger defenses. Specialization/Mastery remain later advancement choices. This is a playtest version to refine with Oscar.",
    svText: "Du behåller dina egenskapsvärden, din utrustning, dina Domain-kort, din Ancestry, din Community och alla markerade resurser. Prayer Dice ersätts av Prepared Parts, Life Support av Pull Together och din nuvarande Foundation av den nya inriktningens förmågor. Den direkta läkningen för 3 Hope försvinner; Mending Touch finns kvar. Rigger behåller flygningen och ger snabbare förflyttning på marken; extra skada från luften kommer först med Specialization. Fieldwright ersätter flygningen med bättre skydd. Specialization och Mastery är fortfarande senare advancement-val. Detta är en speltestversion som ni kan finslipa tillsammans med Oscar."
  },
  description: "An inventor turns carried gear and nearby materials into practical solutions. Familiar materials are dependable; exploration teaches new uses. Travel and keeping companions together are central.",
  svDescription: "En uppfinnare ser möjligheter i det som alla bär med sig och i materialet runt omkring. Du bygger skydd, ordnar vägar genom faror, lagar utrustning och lär dig vad främmande material kan användas till. Dina pålitliga byggen vilar på övning och prövad kunskap. Nya upptäckter kan bli uppfinningar värda att ta med hem. Rednecks mekaniska vingar och hopfällbara styltor hör till Rigger-inriktningen; andra uppfinnare kan använda vinschar, ramper, slädar eller bärbara broar.",
  hopeFeature, classFeatures: [parts, defense, craft], subclasses: [rigger, fieldwright],
  guide: [
    feature("chassis", "Class and domains", "Splendor + Valor; starting Evasion 9 and 7 HP; ordinary Hope and Stress slots. Choose any character trait as your Inventor and Spellcast trait. Keep existing approved equipment statistics and domain cards. Card reskins retain printed costs, types and damage; they do not create permanent mundane artifacts with card powers.", "Klassens grundvärden och Domains", "Splendor + Valor, Evasion 9 och 7 HP från start, samt spelets vanliga Hope- och Stress-rutor. Välj valfri rollpersonsegenskap som Inventor-egenskap och Spellcast trait. Redneck behåller sina befintliga egenskapsvärden, godkända utrustningsvärden och Domain-kort. Splendor hjälper dig att vårda och hålla kamrater vid liv; Valor hjälper dig att skydda och ingripa med kraft. Mending Touch och Forceful Push finns kvar. Du får beskriva kortens krafter som uppfinningar, men deras tryckta regler, kostnader, korttyper och skadetyper gäller fortfarande. Beskrivningen skapar inget permanent, icke-magiskt föremål med kortets krafter."),
    feature("equipment", "Starting equipment", "Normal level-1 weapon and armor choices; inventor toolkit with hand tools, reusable fasteners and travel-rig pieces, without extra statistical bonuses. Usual torch, 50 feet of rope, basic supplies, handful of gold, Minor Health Potion or Minor Stamina Potion. Personal family tool or discovery notebook. Redneck retains current gear.", "Startutrustning", "Använd vanliga val av vapen och rustning för level 1. Lägg till uppfinnarens verktygslåda: enkla handverktyg, återanvändbara fästen och delar till en liten bärbar färdanordning. De förklarar förmågorna men ger inga extra vapen- eller rustningsbonusar. Ta den vanliga facklan, 50 fot rep, grundläggande förnödenheter, en handfull guld och antingen Minor Health Potion eller Minor Stamina Potion. Välj ett personligt föremål: ett slitet verktyg som gått i arv, eller en anteckningsbok för upptäckterna du vill ta hem. Redneck kan behålla sin befintliga utrustning; hans Scepter får se ut som en egen konstruktion med samma godkända värden."),
    feature("advancement", "Advancement to level 10", "Use ordinary advancements, tier achievements, multiclass choices and domain acquisition. Foundation at level 1; Specialization is a selectable advancement from level 5; Mastery from level 8 after Specialization. Levels alone do not grant upgrades. Start with two level-1 cards, then choose a card of your level or lower each level. Printed Loadout, recall and use limits apply. A trait increase changes the next session's reserve.", "Utveckling till level 10", "Följ Daggerhearts vanliga advancements, tier achievements, multiclass-val och regler för nya Domain-kort. Foundation finns från level 1. Specialization kan väljas som advancement tidigast vid level 5. Mastery kan väljas tidigast vid level 8, efter Specialization. Att nå en viss level ger inte automatiskt de nya förmågorna. Du börjar med två kort på level 1 och väljer sedan ett kort på din level eller lägre vid varje ny level. Vanliga gränser för Loadout, recall och användning gäller. Om din Inventor-egenskap höjs kan det ge fler Parts vid nästa spelmöte. Inga nya Domain-kort behöver skrivas för klassen."),
    feature("background", "Background questions", "Who taught you an unforgettable material lesson, and what happened when you ignored it? What invention will you bring home, and whose respect do you want? Who was left behind in your upbringing, and how do you feel about it now? These are optional invitations, not a required moral stance.", "Frågor om bakgrunden", "Vem lärde dig något om material som du aldrig har glömt, och vad hände när du struntade i lärdomen? Vilken uppfinning hoppas du ta med hem, och vems respekt vill du vinna? Vem blev lämnad under din uppväxt, och vad känner du inför det beslutet i dag? Frågorna är frivilliga ingångar. Klanens seder tvingar inte Redneck att överge sina kamrater eller tycka på ett visst sätt."),
    feature("connections", "Connection questions", "Which piece of your gear have you trusted me to alter, and what did I promise? When did my doubtful invention get us out of danger? What do you carry that I insist could become useful?", "Frågor om era band", "Vilken del av din utrustning har du låtit mig bygga om, och vad lovade jag dig? När fick jag oss ur en fara med en uppfinning som du tvivlade på? Vad bär du alltid med dig som jag påstår kan bli något användbart?")
  ]
};
