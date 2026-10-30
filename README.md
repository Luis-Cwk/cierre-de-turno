# Cierre de turno

**A thirty-second voice note that closes your workday, built from what you actually did on GitHub.**

Los desarrolladores no abren apps de bienestar: les piden constancia justo cuando no la tienen. Esto no pide nada.

---

## The problem

Developers do not stop working. The work has no ending, so the day has no ending. Wellness apps answer this by asking for a habit, a streak, a check-in, which is exactly what someone with no energy left cannot give.

`Cierre de turno` inverts it. It asks nothing and gives back one short thing: a spoken note that says what you closed today, what is still open, and where to start tomorrow. Then it tells you to shut the laptop.

## What it does

1. You give it a public GitHub username.
2. It reads the last three days of public activity: merged pull requests, closed issues, reviews, comments, pushes.
3. It separates what looks productive (number of commits) from what was productive (a merged PR, a closed issue, a review someone else needed).
4. It writes a script of about forty words and turns it into audio.
5. It tells you where to start tomorrow, and then it gives you permission to stop.

No account. No password. No streak. No notifications.

## Three ways to use it

One core, three thin surfaces:

| Surface | What it is | Status |
|---|---|---|
| **Web** | Paste a username, hear your day close | Free: https://cierre-de-turno.petrasynthetic.workers.dev |
| **MCP** | One tool, `generar_cierre(usuario)`, callable from Cursor, OpenCode, Claude Code or any MCP client | **One-time payment**: 5 USDC (x402, Base mainnet), see `docs/mcp.md` |
| **n8n** | A cron job that runs it every evening and delivers it | Planned |

**Buying the MCP:** one-time payment, no subscription. POST to `/api/comprar` with an x402-capable wallet (the payment travels in the `X-PAYMENT` header), it is verified and settled on-chain, and the response contains your license token. Put it in your MCP connection as a `x-license` header. The license never expires; a fair monthly cap (200 calls) keeps the service alive.

You do not leave your editor. Inside an agent, "cierra mi día" is one tool call.

## How it works

The interesting part is not the plumbing, it is the restraint.

```
GitHub events  ->  independent facts  ->  human noun phrase  ->  fixed sentence frame
```

- **Facts are independent.** Each event becomes one fact. Nothing in the pipeline describes a relation between two facts.
- **The model only writes the middle.** Sentence frames are written by hand (`Cerraste X.`, `Sigue abierto X.`, `Subiste cambios en X.`). The model produces only the short noun phrase in the middle, one call per batch, and never sees the other facts. That is why the verb cannot be inverted and why it cannot invent a causal link between two unrelated events.
- **The ending is a fixed pool.** The sentence that tells you to stop is never generated.
- **Guards, not hope.** A generated phrase is dropped if it contains a causal connective, a command to stop, or runs over ten words. Then it falls back to a trimmed title.
- **Firecrawl reads the stuck pull request.** The one sentence that is not derivable from the events alone is *why* the oldest open PR is stuck. Firecrawl turns the PR page into markdown and the model picks one reason from a fixed priority list (review pending, failing checks, merge conflicts, someone asked for a change). If nothing is found, the note says nothing: no invented blockers.

We learned this the hard way during the build: a free-writing model happily invents things like "that depends on the QA team reviewing your deployment question" out of two unrelated events, and it will translate a repository name into prose ("ink" becomes "error correction in the ink system"). Repository names are identifiers and are never rewritten.

## The model

**Gemma 4** (`@cf/google/gemma-4-26b-a4b-it`) running on **Cloudflare Workers AI**, inside the same Worker that serves the app. Open weights, no laptop required, no API key in the client.

Two quirks worth knowing, both of which cost us time:

- Workers AI answers in OpenAI shape: `choices[0].message.content`, not a `response` field.
- Gemma 4 is a reasoning model. Without `chat_template_kwargs: { enable_thinking: false }` it spends the whole token budget thinking out loud and returns an empty string.

## The voice

The note is meant to be heard, not read. The audio layer is being wired to **ElevenLabs** (text to speech, multilingual model, Spanish). Status: the code path exists and is dormant until an API key is provided; the app returns the note in text until then.

## What it deliberately does not do

- It does not ask how you feel.
- It has no chat, no streaks, no badges.
- It is not medical or psychological advice.
- It reads **public** activity only. Private repositories do not appear, and that is the point: the note should not say what is not yours to show.
- It stores nothing. Every call is independent.

## Running it

```bash
npm install
npx wrangler dev          # local, uses Ollama if available
npx wrangler deploy       # to Cloudflare
```

Environment:

| Variable | What it does |
|---|---|
| (none) | Defaults to Gemma 4 on Workers AI when the `AI` binding exists |
| `LLM_MODEL` | Overrides the model id |
| `OLLAMA_URL` | For local development, defaults to `http://127.0.0.1:11434` |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Activates the audio layer |
| `GITHUB_TOKEN` | GitHub API token (avoids the shared-IP rate limit of 60/h) |
| `FIRECRAWL_API_KEY` | Lets the note explain *why* the oldest open PR is stuck |
| `PAY_TO_WALLET` | Wallet that receives MCP license payments |
| `X402_VERIFICA_URL` / `X402_SETTLE_URL` | Optional facilitator override (defaults to Dexter) |

## License

Polyform Shield: you can read, copy and audit this code freely (that is the point: no trust required), and use it for any non-commercial purpose. The one thing you cannot do is re-host it as a competing paid service.

## Testing

```bash
node prueba.mjs octocat torvalds <your-username>
```

It fails if the script comes back empty, invents a causal relation, tells you to stop before the closing line, or does not end with a period.

## Built with

- **Cloudflare Workers** and **Workers AI** (Gemma 4, open weights)
- **GitHub** public activity API
- **Firecrawl** to turn the stuck pull request page into readable text
- **ElevenLabs** for text to speech
- **Model Context Protocol** for the editor surface

### AI tools disclosure

Per the event rules: this project was built with the assistance of an AI coding agent (OpenCode), used for scaffolding, refactoring and debugging. The design decisions above, the sentence frames and the tone rules were written and revised by hand, and the generated output is checked by the guard rules described in "How it works". The note text itself is generated at runtime by Gemma 4.

## The pitch

> Developers do not open wellness apps: they ask for consistency at the exact moment you have none left. This asks for nothing. You give it your GitHub username and it gives you back a thirty-second voice note that says what you closed today, what is still open, and where to start tomorrow. It is not a therapist. It is the friend who tells you to close the laptop.
