# Keyboard Sound Profiling Survey

A one-question-per-screen questionnaire. Questions are read from a Notion database;
each submission is written as one row to a second Notion database.

## Environment

| Variable | Secret | Purpose |
|---|---|---|
| `NOTION_PAT` | yes | Notion internal integration token |
| `NOTION_PARENT_PAGE_ID` | no | Page the two databases live under (setup script only) |
| `NOTION_QUESTIONS_DB_ID` | no | Source of the live questionnaire |
| `NOTION_ANSWERS_DB_ID` | no | Destination for submissions |
| `DEEPINFRA_KEY` | yes | Image generation, local only — never needed on Vercel |

Locally these live in `.env.local` (gitignored). On Vercel they are project
environment variables. The token is only ever read in server code — it is never
sent to the browser.

## Notion setup

```bash
node --env-file=.env.local scripts/notion-setup.mjs           # create + seed
node --env-file=.env.local scripts/notion-setup.mjs --reseed  # replace question rows
```

Idempotent: databases are matched by title among the parent page's child blocks, so
reruns reuse them.

## Editing the questionnaire

Edit rows in the **Survey Questions** database. The site picks changes up within 5
minutes (`revalidate: 300`). Rows with `Active` unchecked are skipped, and `Order`
controls sequence.

`Options` holds the full option text shown to respondents, one per line.
`Option labels` holds the short value stored in the Answers database, aligned line
for line — Notion select values cannot contain commas and cap at 100 characters, so
the two forms differ. For a `grid` question these two columns hold its rows.

Adding a **new** question also needs a matching column in the Answers database and an
entry in `MAPPING` in `lib/answers.ts`; without one the submission is rejected with
`Qn has no column in the Answers database`.

## Option images

Choice options can carry a small illustrative thumbnail. `Option images` on a question
row holds one filename per line, aligned with `Options` and `Option labels`; the file
is served from `public/options/`. Options without a filename render without an image.

```bash
node --env-file=.env.local scripts/generate-option-images.mjs                     # skips existing
node --env-file=.env.local scripts/generate-option-images.mjs --force             # regenerate
node --env-file=.env.local scripts/generate-option-images.mjs --model=<model-id>  # try another model
```

The generated PNG/JPEGs are committed, so the DeepInfra key is only ever needed by
whoever regenerates them. Prompts ask for wordless wireframes with grey placeholder
bars in place of labels — diffusion models render UI text as garbled glyphs, and
naming a concrete thing to draw instead works far better than forbidding text.
`FLUX-1-schnell` ignored both the palette and the no-text instruction;
`FLUX-2-klein-9b` respects them.

## Development

```bash
pnpm dev            # http://localhost:3000
pnpm build          # / should report as static with a 5m revalidate
pnpm exec tsc --noEmit
pnpm lint
```

Questions are cached for 5 minutes via `unstable_cache`, which persists to
`.next/cache/fetch-cache` and therefore survives a dev-server restart. To see a Notion
edit immediately, `rm -rf .next/cache/fetch-cache` and restart.

Submissions can be exercised without the browser:

```bash
curl -X POST http://localhost:3000/api/responses \
  -H 'Content-Type: application/json' \
  -d '{"answers":{"1":"Enthusiast", ...},"other":{}}'
```

That route shares its validation and persistence path with the server action the UI
uses, so it is a genuine test of the write path.

## Abuse control

A hidden honeypot field is silently accepted and discarded. Submissions are rate
limited to 5 per hour per IP, held in process memory — on serverless this resets on
cold start and is not shared between instances, so it slows casual abuse rather than
preventing it. Move it to a shared store if the survey is widely circulated.
