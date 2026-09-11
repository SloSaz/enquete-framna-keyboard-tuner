// Creates (or reuses) the two Notion databases and seeds the question rows.
// Idempotent: reruns reuse databases matched by title under PARENT_PAGE_ID.
//   node --env-file=.env.local scripts/notion-setup.mjs [--reseed]
import { readFileSync } from "node:fs";

const TOKEN = process.env.NOTION_PAT;
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;
if (!TOKEN) throw new Error("NOTION_PAT missing (run with --env-file=.env.local)");
if (!PARENT_PAGE_ID) throw new Error("NOTION_PARENT_PAGE_ID missing");

const QUESTIONS_TITLE = "Survey Questions";
const ANSWERS_TITLE = "Survey Responses";
const RESEED = process.argv.includes("--reseed");

async function notion(path, method = "GET", body) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${json.code}: ${json.message}`);
  return json;
}

const text = (content) => ({ rich_text: [{ text: { content: content ?? "" } }] });
// Notion's /search index lags behind writes, so a freshly created database is not
// findable there and a rerun would duplicate it. Listing the parent's child blocks
// is read-after-write consistent.
async function findDatabase(title) {
  let cursor;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : "?page_size=100";
    const res = await notion(`blocks/${PARENT_PAGE_ID}/children${qs}`);
    for (const block of res.results) {
      if (block.type !== "child_database") continue;
      if (block.child_database.title !== title) continue;
      return await notion(`databases/${block.id}`);
    }
    cursor = res.next_cursor;
  } while (cursor);
  return undefined;
}

const seed = JSON.parse(readFileSync(new URL("./questionnaire.seed.json", import.meta.url)));

// Every select value must be comma-free and <=100 chars, so the Answers DB stores
// the short label while the Questions DB keeps the full option text.
const labelsOf = (item) => item.labels ?? item.rowLabels ?? [];
const optionsOf = (item) => item.options ?? item.rows ?? [];
const selectOptions = (item) => labelsOf(item).map((name) => ({ name }));

for (const item of seed.items) {
  for (const label of labelsOf(item)) {
    if (label.includes(",") || label.length > 100) {
      throw new Error(`Q${item.order} label invalid for Notion select: "${label}"`);
    }
  }
}

const byOrder = (n) => seed.items.find((i) => i.order === n);

async function ensureQuestionsDb() {
  const existing = await findDatabase(QUESTIONS_TITLE);
  if (existing) return { db: existing, created: false };
  const db = await notion("databases", "POST", {
    parent: { type: "page_id", page_id: PARENT_PAGE_ID },
    title: [{ text: { content: QUESTIONS_TITLE } }],
    description: [{ text: { content: "Source of truth for the live questionnaire. Edit here; the site picks it up within 5 minutes." } }],
    properties: {
      Question: { title: {} },
      Order: { number: {} },
      Type: {
        select: {
          options: ["single_choice", "multi_choice", "scale", "grid", "paragraph", "short_text"]
            .map((name) => ({ name })),
        },
      },
      Required: { checkbox: {} },
      Active: { checkbox: {} },
      "Allow other": { checkbox: {} },
      Description: { rich_text: {} },
      Options: { rich_text: {} },
      "Option labels": { rich_text: {} },
      "Option images": { rich_text: {} },
      "Scale max": { number: {} },
      "Scale min label": { rich_text: {} },
      "Scale max label": { rich_text: {} },
    },
  });
  return { db, created: true };
}

async function ensureAnswersDb(questionsDbId) {
  const existing = await findDatabase(ANSWERS_TITLE);
  if (existing) return { db: existing, created: false };
  const multi = (n) => ({ multi_select: { options: selectOptions(byOrder(n)) } });
  const single = (n) => ({ select: { options: selectOptions(byOrder(n)) } });
  const grid = byOrder(7);
  const db = await notion("databases", "POST", {
    parent: { type: "page_id", page_id: PARENT_PAGE_ID },
    title: [{ text: { content: ANSWERS_TITLE } }],
    description: [{ text: { content: "One row per submission. Written by the survey site; do not edit by hand." } }],
    properties: {
      "Response ID": { title: {} },
      Status: {
        select: { options: [{ name: "In progress" }, { name: "Complete" }] },
      },
      "Started at": { date: {} },
      "Submitted at": { date: {} },
      Answered: { number: {} },
      "Duration (s)": { number: {} },
      "Q1 Experience level": single(1),
      "Q2 Mod decision sources": multi(2),
      "Q2 Other": { rich_text: {} },
      "Q3 YT tests accurate (1-5)": { number: {} },
      "Q4 Sound signature": single(4),
      "Q5 Valuable features": multi(5),
      "Q5 Other": { rich_text: {} },
      "Q6 A/B comparisons wanted": multi(6),
      "Q6 Other": { rich_text: {} },
      [`Q7a ${grid.rowLabels[0]}`]: { number: {} },
      [`Q7b ${grid.rowLabels[1]}`]: { number: {} },
      [`Q7c ${grid.rowLabels[2]}`]: { number: {} },
      [`Q7d ${grid.rowLabels[3]}`]: { number: {} },
      "Q8 Recommendation format": multi(8),
      "Q8 Other": { rich_text: {} },
      "Q9 Feature ideas": { rich_text: {} },
      "Q10 Follow-up contact": { rich_text: {} },
      Questions: {
        relation: {
          database_id: questionsDbId,
          type: "dual_property",
          dual_property: {},
        },
      },
    },
  });
  return { db, created: true };
}

async function seedQuestions(dbId) {
  const { results } = await notion(`databases/${dbId}/query`, "POST", { page_size: 100 });
  if (results.length && !RESEED) {
    console.log(`  questions: ${results.length} rows already present, skipping seed (--reseed to force)`);
    return;
  }
  for (const page of results) await notion(`pages/${page.id}`, "PATCH", { archived: true });
  if (results.length) console.log(`  archived ${results.length} old question rows`);

  for (const item of seed.items) {
    await notion("pages", "POST", {
      parent: { database_id: dbId },
      properties: {
        Question: { title: [{ text: { content: item.title } }] },
        Order: { number: item.order },
        Type: { select: { name: item.type } },
        Required: { checkbox: item.required },
        Active: { checkbox: true },
        "Allow other": { checkbox: !!item.allowOther },
        Description: text(item.description),
        Options: text(optionsOf(item).join("\n")),
        "Option labels": text(labelsOf(item).join("\n")),
        "Option images": text((item.images ?? []).join("\n")),
        "Scale max": { number: item.max ?? null },
        "Scale min label": text(item.minLabel),
        "Scale max label": text(item.maxLabel),
      },
    });
    console.log(`  + Q${item.order} ${item.type}`);
  }
}

// A database created before a column existed is patched rather than recreated.
async function ensureAnswerColumns(db) {
  const wanted = {
    Status: { select: { options: [{ name: "In progress" }, { name: "Complete" }] } },
    "Started at": { date: {} },
    Answered: { number: {} },
  };
  const missing = Object.fromEntries(
    Object.entries(wanted).filter(([name]) => !(name in db.properties)),
  );
  if (Object.keys(missing).length) {
    await notion(`databases/${db.id}`, "PATCH", { properties: missing });
    console.log(`  added columns: ${Object.keys(missing).join(", ")}`);
  }

  const optionUpdates = {};
  for (const item of seed.items) {
    if (item.type === "single_choice" || item.type === "multi_choice") {
      const colName = Object.keys(db.properties).find((p) => p.startsWith(`Q${item.order} `));
      if (!colName) continue;
      const prop = db.properties[colName];
      const kind = prop.type;
      if (kind !== "select" && kind !== "multi_select") continue;
      const currentNames = new Set((prop[kind]?.options ?? []).map((o) => o.name));
      const expectedNames = labelsOf(item);
      const hasMissing = expectedNames.some((n) => !currentNames.has(n));
      if (hasMissing) {
        optionUpdates[colName] = { [kind]: { options: selectOptions(item) } };
      }
    }
  }
  if (Object.keys(optionUpdates).length) {
    await notion(`databases/${db.id}`, "PATCH", { properties: optionUpdates });
    console.log(`  updated answer choice options: ${Object.keys(optionUpdates).join(", ")}`);
  }
}


const q = await ensureQuestionsDb();
console.log(`${q.created ? "created" : "reusing"} "${QUESTIONS_TITLE}" ${q.db.id}`);
const a = await ensureAnswersDb(q.db.id);
console.log(`${a.created ? "created" : "reusing"} "${ANSWERS_TITLE}"  ${a.db.id}`);
await ensureAnswerColumns(a.db);
await seedQuestions(q.db.id);

console.log(`\nAdd these to .env.local and to Vercel (not secret, but environment-specific):`);
console.log(`NOTION_QUESTIONS_DB_ID=${q.db.id}`);
console.log(`NOTION_ANSWERS_DB_ID=${a.db.id}`);
console.log(`\nQuestions DB: ${q.db.url}`);
console.log(`Responses DB: ${a.db.url}`);
