<img src="src/ui/public/mark.svg" alt="askmap" width="40">

<br>

**askmap** shows what people ask your AI. Point it at your assistant's conversation logs and it draws a private map of what people use it for, and where it struggles, on your own machine.

## Install

```bash
npx askmap
```

It opens in your browser. Drop an export, pick a model, draw the map.

From a script, or on a server:

```bash
npx askmap ./export --model ollama:qwen3:4b
```

## How it works

askmap follows the method Anthropic published as [Clio](https://www.anthropic.com/research/clio):

1. **Facets.** A model reads each conversation and writes one general summary, the kind of task, the language, and whether the assistant actually helped. No names, numbers or quotes.
2. **Clusters.** Summaries are embedded on your machine and grouped.
3. **Names.** Each group is named against its neighbours, so the name says what sets it apart.
4. **Categories.** Groups are gathered into a few top-level categories.
5. **Privacy.** Groups with fewer than five people are held back, and every name is audited for identifying details before you see it.

The map holds summaries and counts only. Raw conversations never leave the export.

## Features

- **Map** – Categories and topics as nested circles, area is conversations
- **Friction** – Colour by where the assistant fails or half-helps, not just by volume
- **Topics** – Every topic as a list, sorted by share or friction
- **Sessions** – Every map is saved; keep a history and compare over time
- **Exports** – A tidy Excel workbook and a one-page PDF report
- **Your model** – Ollama on your machine, or your own key: OpenAI, Anthropic, OpenRouter, Azure, Bedrock or any compatible endpoint
- **Keyboard** – <kbd>1</kbd>–<kbd>4</kbd> views, <kbd>N</kbd> new map, <kbd>T</kbd> colour, <kbd>/</kbd> search, <kbd>Esc</kbd> back

## Sources

askmap reads the exports teams already know how to produce. The format is detected; `--source` picks one.

| Source | Export |
|--------|--------|
| ChatGPT Enterprise | Compliance API logs, or `conversations.json` |
| Claude Enterprise | Compliance API chats, or `conversations.json` |
| Microsoft Copilot | Graph interaction export (`aiInteractionHistory`) |
| Gemini | Google Vault export |
| OpenTelemetry | GenAI spans from LiteLLM, Langfuse, Arize, Datadog |
| JSONL | One conversation per line, with `messages` |

## Models

| Model | Where the text goes |
|-------|---------------------|
| `ollama:<model>` | Nowhere. Runs on this machine |
| `compat:<model>` + `ASKMAP_BASE_URL` | Your endpoint: vLLM, Azure, Bedrock gateway |
| `openai:<model>` · `anthropic:<model>` · `openrouter:<model>` | That provider, under your key |

A small local model is fine for a few hundred conversations on a laptop. For thousands, use a server with a GPU or your company's API.

## Options

| Option | Default | |
|--------|---------|---|
| `--model` | `ollama:qwen3:1.7b` | Who reads the conversations |
| `--source` | detected | `chatgpt`, `claude`, `copilot`, `gemini`, `otel`, `jsonl` |
| `--min-users` | `5` | Smallest group shown, in distinct people |
| `--limit` | all | Read only the first n conversations |
| `--out` | `.askmap` | Where maps and the cache live |
| `--port` | `4317` | Local port, loopback only |

## Develop

```bash
pnpm install
pnpm dev           # UI on :5181, reads ./.askmap
pnpm test          # 26 tests, offline, with a fake model
pnpm build
```

Try it on an open dataset: `node demo/fetch-wildchat.mjs` downloads a sample of [WildChat](https://huggingface.co/datasets/allenai/WildChat-1M) (ODC-BY).

## License

© 2026 [vittoriomta](https://vittoriotaucer.github.io)

Licensed under MIT
