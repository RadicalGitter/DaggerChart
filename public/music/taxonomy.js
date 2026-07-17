// Curated prompt vocabulary. Every authored branch has two musical directions
// with three choices each; Start is the deliberate seven-primary exception.
const ROOTS = [
  {
    id: "tavern",
    label: "Tavern & Hearth",
    payload: "intimate tavern music, lived-in and human",
    groups: [
      ["Ensemble", [
        ["Fiddle", "agile folk fiddle with a rough wooden tone", ["Forms", ["Reel", "Lament", "Rustic Dance"]], ["Touch", ["Double Stops", "Ornamented Bowing", "Drone Strings"]]],
        ["Lute", "warm plucked lute in open modal harmony", ["Forms", ["Courtly Air", "Modal Ballad", "Sprightly Dance"]], ["Touch", ["Fingerpicked Ostinato", "Open Fifths", "Broken Chords"]]],
        ["Hand Drum", "close hand drum and table percussion", ["Grooves", ["Jig Pulse", "Processional Beat", "Loose Revel"]], ["Touch", ["Rim Taps", "Rolling Accents", "Hand Claps"]]]
      ]],
      ["Company", [
        ["Warm Hearth", "warm hearth, minor-to-major comfort, unhurried safety", ["Harmony", ["Gentle Modal Cadence", "Open Consonance", "Soft Major Sixths"]], ["Room", ["Communal Hum", "Firelight Strings", "Quiet Murmur"]]],
        ["Sly Gossip", "mischievous social tension and half-heard gossip", ["Motion", ["Tiptoeing Rhythm", "Teasing Pauses", "Quick Exchanges"]], ["Color", ["Muted Drum", "Crooked Cadence", "Pizzicato Whispers"]]],
        ["Safe Return", "weariness resolving into familiar welcome", ["Arc", ["Weary Opening", "Gathering Warmth", "Settled Ending"]], ["Memory", ["Homeward Refrain", "Familiar Tune", "Shared Chorus"]]]
      ]]
    ]
  },
  {
    id: "road",
    label: "Road & Horizon",
    payload: "forward-moving travel music with distance in its harmony",
    groups: [
      ["Motion", [
        ["Riding Pulse", "steady hoofbeat pulse with spacious phrasing", ["Gait", ["Measured Trot", "Urgent Gallop", "Easy Canter"]], ["Ground", ["Low Drum", "Plucked Bass", "Bowed Rhythm"]]],
        ["Walking Ostinato", "patient repeating figure shaped by footsteps", ["Pace", ["Pilgrim Step", "Brisk March", "Wandering Meter"]], ["Texture", ["Picked Strings", "Soft Frame Drum", "Breathing Flute"]]],
        ["Rolling Percussion", "layered percussion that keeps the road turning", ["Pattern", ["Wheel Rhythm", "River Pulse", "Shifting Accent"]], ["Material", ["Skin Drums", "Wood Blocks", "Seed Shakers"]]]
      ]],
      ["Horizon", [
        ["Open Sky", "wide intervals and long phrases under open sky", ["Space", ["Distant Horn", "High Drone", "Long Reverb"]], ["Light", ["Dawn", "High Noon", "Blue Dusk"]]],
        ["Homesick", "forward motion shadowed by tenderness for home", ["Ache", ["Falling Phrase", "Unresolved Cadence", "Solo Voice Without Words"]], ["Memory", ["Old Dance", "Childhood Motif", "Distant Hearth"]]],
        ["Anticipation", "the road nearing something consequential", ["Build", ["Rising Sequence", "Gathering Layers", "Tightening Pulse"]], ["Temper", ["Hopeful", "Wary", "Restless"]]]
      ]]
    ]
  },
  {
    id: "conflict",
    label: "Conflict",
    payload: "dramatic conflict music with clear physical momentum",
    groups: [
      ["Force", [
        ["War Drums", "deep war drums with disciplined accents", ["Formation", ["Shield Wall", "Charging Line", "Broken Ranks"]], ["Strike", ["Heavy Downbeat", "Rolling Toms", "Sudden Silence"]]],
        ["Low Strings", "low strings driving in tense repeated figures", ["Motion", ["Tremolo Pressure", "Sawing Ostinato", "Descending Cell"]], ["Weight", ["Cello", "Bass Viol", "Layered Ensemble"]]],
        ["Brass Calls", "short brass calls answering the rhythm", ["Signal", ["Challenge", "Rally", "Warning"]], ["Color", ["Raw Horn", "Muted Brass", "Full Fanfare"]]]
      ]],
      ["Stakes", [
        ["Duel", "focused duel with space between decisive blows", ["Exchange", ["Feint", "Riposte", "Deadlock"]], ["Nerve", ["Controlled", "Proud", "Personal"]]],
        ["Desperation", "desperate resistance, unstable and breathless", ["Pressure", ["Accelerating Pulse", "Clashing Meter", "Narrowing Harmony"]], ["Heart", ["Fear", "Defiance", "Sacrifice"]]],
        ["Triumph", "hard-won triumph that retains the cost of battle", ["Arrival", ["Rising Theme", "Open Cadence", "Returned Motif"]], ["Cost", ["Scarred", "Solemn", "Exultant"]]]
      ]]
    ]
  },
  {
    id: "wilds",
    label: "Wilds",
    payload: "organic wilderness music led by landscape rather than spectacle",
    groups: [
      ["Voice", [
        ["Wooden Flute", "breathy wooden flute with irregular natural phrasing", ["Call", ["Birdlike Figure", "Long Cry", "Falling Echo"]], ["Breath", ["Airy", "Reedy", "Hollow"]]],
        ["Frame Drum", "earthy frame drum with loose ritual motion", ["Pattern", ["Heartbeat", "Uneven Step", "Circular Dance"]], ["Touch", ["Fingertip Roll", "Open Strike", "Muted Palm"]]],
        ["Bowed Drone", "rough bowed drone carrying ancient landscape", ["Contour", ["Single Ground", "Slow Shift", "Grinding Overtone"]], ["Color", ["Gut String", "Hurdy-Gurdy", "Low Fiddle"]]]
      ]],
      ["Land", [
        ["Deep Forest", "close forest, layered shade, unseen movement", ["Depth", ["Moss Floor", "High Canopy", "Hidden Clearing"]], ["Life", ["Rustle", "Distant Call", "Old Growth"]]],
        ["High Peaks", "thin air and severe mountain scale", ["Height", ["Climbing Line", "Cliff Echo", "Summit Stillness"]], ["Weather", ["Cold Sun", "Snow Wind", "Gathering Cloud"]]],
        ["Stormfront", "weather arriving with patient elemental force", ["Approach", ["Far Thunder", "Pressure Drop", "First Rain"]], ["Break", ["Lightning Accent", "Driving Downpour", "Clearing Air"]]]
      ]]
    ]
  },
  {
    id: "mystery",
    label: "Mystery",
    payload: "restrained mystery music built from pattern, absence, and unease",
    groups: [
      ["Timbre", [
        ["Glass Tones", "fragile glass tones suspended over silence", ["Shape", ["Single Chime", "Overlapping Bells", "Shivering Cluster"]], ["Space", ["Dry", "Long Echo", "Distant"]]],
        ["Bass Clarinet", "low breathy reed moving at the edge of hearing", ["Gesture", ["Low Murmur", "Rising Question", "Broken Phrase"]], ["Shadow", ["Warm Dark", "Hollow", "Close"]]],
        ["Plucked Harmonics", "isolated string harmonics and precise plucked notes", ["Pattern", ["Three-Note Cipher", "Irregular Repeat", "Mirrored Figure"]], ["Touch", ["Brittle", "Muted", "Resonant"]]]
      ]],
      ["Question", [
        ["Hidden Pattern", "a concealed order gradually becoming audible", ["Trace", ["Recurring Interval", "Buried Pulse", "Returning Error"]], ["Reveal", ["Partial", "Sudden", "Inevitable"]]],
        ["Suspicion", "quiet suspicion with no confirmed threat", ["Attention", ["Held Breath", "Watching Pulse", "Interrupted Rest"]], ["Color", ["Dissonant Second", "Low Pedal", "Empty Fifth"]]],
        ["Revelation", "the moment disparate clues lock into one truth", ["Turn", ["Harmony Opens", "Motif Aligns", "Bass Arrives"]], ["Truth", ["Terrible", "Tender", "Transforming"]]]
      ]]
    ]
  },
  {
    id: "settlement",
    label: "Settlement",
    payload: "grounded community music shaped by work, routine, and belonging",
    groups: [
      ["Labour", [
        ["Work Song", "plain communal work song without polished grandeur", ["Form", ["Call and Response", "Strophic Verse", "Hummed Refrain"]], ["Hands", ["Chopping Pulse", "Pulling Rhythm", "Measured Breath"]]],
        ["Hammer Rhythm", "metal and timber rhythm organized into music", ["Pattern", ["Anvil Triplet", "Sawing Ostinato", "Mallet Downbeat"]], ["Room", ["Open Yard", "Close Workshop", "Distant Build"]]],
        ["Rustic Ensemble", "small imperfect ensemble playing from familiarity", ["Parts", ["Fiddle Lead", "Lute Ground", "Flute Answer"]], ["Feel", ["Loose Unison", "Friendly Counterpoint", "Shared Cadence"]]]
      ]],
      ["Belonging", [
        ["Busy Market", "small market alive with overlapping human motion", ["Motion", ["Bargaining Patter", "Passing Footsteps", "Cartwheel Pulse"]], ["Temper", ["Cheerful", "Watchful", "Rainy"]]],
        ["Shared Purpose", "many ordinary people moving toward one purpose", ["Growth", ["Part by Part", "Gathering Chorus", "Steady Ascent"]], ["Character", ["Humble", "Resolute", "Hopeful"]]],
        ["Fragile Home", "a beloved home that is new enough to be vulnerable", ["Warmth", ["Simple Theme", "Soft Unison", "Close Harmony"]], ["Edge", ["Unfinished Cadence", "Cold Wind", "Distant Warning"]]]
      ]]
    ]
  },
  {
    id: "wonder",
    label: "Wonder & Otherworld",
    payload: "rare wonder with enormous scale, restraint, and unfamiliar beauty",
    groups: [
      ["Resonance", [
        ["Celesta", "clear celesta points glowing in a dark field", ["Motion", ["Falling Stars", "Slow Arpeggio", "Impossible Clock"]], ["Light", ["Silver", "Pale Gold", "Cold Blue"]]],
        ["Wordless Choir", "distant wordless choir without theatrical bombast", ["Shape", ["Single Breath", "Widening Chord", "Moving Cluster"]], ["Distance", ["Near Whisper", "Beyond the Hill", "Immense Hall"]]],
        ["Resonant Metals", "bowed and struck metals with long living overtones", ["Material", ["Bronze", "Iron", "Glass Bell"]], ["Gesture", ["Slow Bloom", "Ritual Strike", "Shimmering Roll"]]]
      ]],
      ["Encounter", [
        ["Ancient", "age beyond memory, patient and uninterested in haste", ["Time", ["Buried Theme", "Eroded Rhythm", "Endless Pedal"]], ["Presence", ["Solemn", "Watchful", "Sleeping"]]],
        ["Weightless", "gravity loosening into lucid suspended motion", ["Flight", ["Rising Thread", "Floating Pulse", "Circular Drift"]], ["Body", ["Breathless", "Gentle", "Unmoored"]]],
        ["Unknowable", "beauty whose internal rules remain just out of reach", ["Logic", ["Foreign Scale", "Asymmetric Cycle", "Impossible Interval"]], ["Feeling", ["Awe", "Dread", "Invitation"]]]
      ]]
    ]
  }
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const TAGS = {};
export const ROOT_IDS = [];

function addTag(tag) {
  TAGS[tag.id] = { groups: [], ...tag };
  return TAGS[tag.id];
}

for (const root of ROOTS) {
  ROOT_IDS.push(root.id);
  const rootNode = addTag({ id: root.id, label: root.label, payload: root.payload, parentId: null });
  for (const [groupLabel, children] of root.groups) {
    const group = { label: groupLabel, ids: [] };
    for (const [childLabel, childPayload, upper, lower] of children) {
      const childId = `${root.id}-${slug(childLabel)}`;
      group.ids.push(childId);
      const child = addTag({ id: childId, label: childLabel, payload: childPayload, parentId: root.id });
      for (const [deepLabel, leaves] of [upper, lower]) {
        const deepGroup = { label: deepLabel, ids: [] };
        for (const leafLabel of leaves) {
          const leafId = `${childId}-${slug(leafLabel)}`;
          deepGroup.ids.push(leafId);
          addTag({ id: leafId, label: leafLabel, payload: leafLabel.toLowerCase(), parentId: childId });
        }
        child.groups.push(deepGroup);
      }
    }
    rootNode.groups.push(group);
  }
}

export function findTag(value) {
  const needle = String(value || "").trim().toLowerCase();
  return Object.values(TAGS).find((tag) => tag.id === needle || tag.label.toLowerCase() === needle) || null;
}

export function childIds(id) {
  return (TAGS[id]?.groups || []).flatMap((group) => group.ids);
}

export function descendantIds(id) {
  const found = [];
  const visit = (tagId) => {
    for (const childId of childIds(tagId)) {
      found.push(childId);
      visit(childId);
    }
  };
  visit(id);
  return found;
}
