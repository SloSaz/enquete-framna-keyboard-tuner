// Generates one illustrative app-UI thumbnail per option of the "valuable features"
// question via DeepInfra. Skips options whose file already exists (--force to redo).
//   node --env-file=.env.local scripts/generate-option-images.mjs [--model=X] [--force]
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEY = process.env.DEEPINFRA_KEY;
if (!KEY) throw new Error("DEEPINFRA_KEY missing (run with --env-file=.env.local)");

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const MODEL = arg("model", "black-forest-labs/FLUX-1-schnell");
const FORCE = process.argv.includes("--force");
const OUT_DIR = join(process.cwd(), "public", "options");
const SIZE = "512x512";

// Diffusion models draw UI text as garbled glyphs, so the prompt gives them a
// concrete thing to draw in its place: blank grey placeholder bars.
const STYLE =
  "flat modern minimal dark-mode app UI panel filling the whole square frame, straight-on front view, " +
  "near-black navy background, rounded card panels, glowing periwinkle indigo accent, one teal secondary accent. " +
  "Strictly an indigo, violet and teal palette on near-black: absolutely no red, no orange, no yellow, no green. " +
  "Completely wordless wireframe: every label, caption and number is replaced by a plain flat grey rounded " +
  "placeholder bar. No letters, no glyphs, no digits, no logos anywhere in the image. " +
  "Crisp vector shapes, generous spacing, soft ambient glow, product design mockup, high detail";

const OPTIONS = [
  {
    slug: "live-spectrum",
    label: "Real-time frequency spectrum & acoustic analysis via smartphone microphone",
    subject:
      "a live audio frequency spectrum analyzer screen: a dense row of glowing indigo and violet vertical " +
      "equalizer bars of varying heights across the middle of the panel, a thin teal waveform line above " +
      "them, and a large circular glowing indigo record button with a simple microphone icon at the bottom",
  },
  {
    slug: "sound-classification",
    label: "Objective classification of sound characteristics",
    subject:
      "an acoustic classification panel: a clearly drawn radar spider chart as a four-sided web of thin grey " +
      "grid lines with a small translucent indigo quadrilateral plotted inside it, its four corners marked by " +
      "bright dots, and three separate circular ring progress gauges in a neat row beneath it",
  },
  {
    slug: "ab-comparison",
    label: "Before-and-after comparison of modifications",
    subject:
      "a split A/B comparison screen: two stacked rounded cards each holding a different audio waveform, " +
      "the top one indigo and the bottom one teal, separated by a thin divider with a small pill-shaped " +
      "toggle switch at the centre",
  },
  {
    slug: "modding-suggestions",
    label: "Tailored hardware modification suggestions to reach a target sound",
    subject:
      "a recommendations panel: at the top a line chart holding exactly two distinct curves, one dashed teal " +
      "target curve and one solid indigo current curve running close together, and below it a vertical stack " +
      "of three identical rounded suggestion cards, each with a small circular indigo icon on the left, a grey " +
      "placeholder bar in the middle and a checkmark on the right",
  },
  {
    slug: "sound-library",
    label: "Reference sound library of switches, plates, and mods",
    subject:
      "a browsable reference library screen: an empty rounded search pill with a small magnifier icon at the " +
      "top, below it a neat grid of six identical rounded cards, each holding a tiny indigo waveform " +
      "thumbnail above a short grey placeholder bar",
  },
];

async function generate(prompt) {
  const res = await fetch("https://api.deepinfra.com/v1/openai/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size: SIZE, n: 1 }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`DeepInfra: ${res.status} ${JSON.stringify(json.error ?? json).slice(0, 200)}`);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("DeepInfra returned no image data");
  return Buffer.from(b64, "base64");
}

const extensionFor = (buffer) => {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString() === "PNG") return "png";
  throw new Error("unrecognised image format from DeepInfra");
};

mkdirSync(OUT_DIR, { recursive: true });
console.log(`model: ${MODEL}  size: ${SIZE}\n`);

const written = [];
for (const option of OPTIONS) {
  const existing = ["jpg", "png"]
    .map((ext) => `q5-${option.slug}.${ext}`)
    .find((name) => existsSync(join(OUT_DIR, name)));

  if (existing && !FORCE) {
    console.log(`  = ${existing} (exists, --force to regenerate)`);
    written.push(existing);
    continue;
  }

  const buffer = await generate(`${option.subject}. ${STYLE}`);
  const name = `q5-${option.slug}.${extensionFor(buffer)}`;
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`  + ${name} (${Math.round(buffer.length / 1024)} kB) — ${option.label}`);
  written.push(name);
}

console.log(`\nOption images line (paste into the "Option images" column, in Options order):`);
console.log(written.join("\n"));
