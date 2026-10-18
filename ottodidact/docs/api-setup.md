# Backend API setup

The backend loads `.env` from the application working directory: `ottodidact/.env` relative to the repository root. The committed `.env.example` defaults to labelled mock mode for key-free judging.

## OpenAI configuration

Edit the existing `.env`; copy `.env.example` only when creating a new configuration. Keep your actual key private and never put it in `.env.example`:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_private_key_here
OPENAI_MODEL=gpt-6-luna
OPENAI_REASONING_EFFORT=medium
OPENAI_VERBOSITY=low
```

`OPENAI_MODEL` remains configurable. The switch preserves the model already saved in `.env`; select a model your account can use with image input and structured outputs. The app uses the existing [OpenAI Responses API](https://developers.openai.com/api/reference/responses/overview) with the full high-detail snapshot, an optional bounded close-up from the same snapshot for initial explanations, strict JSON schema and `store:false`. Followups omit the extra close-up.

Set `AI_PROVIDER=mock` for the explicitly labelled offline demo. Mock content does not analyze screenshots. A real request failure never silently changes providers or returns a mock answer.

## Reasoning, concise answers and speed

`OPENAI_REASONING_EFFORT` and `OPENAI_VERBOSITY` are optional backend controls, sent only when configured. For Luna, `medium` reasoning with `low` verbosity is a starting point for considered but compact answers. `low` reasoning can reduce waiting but may weaken difficult multi-step explanations; `high` gives more reasoning time and can be slower. Short answers do not need short reasoning. These settings are independent of key permissions. See [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) and [OpenAI tuning guidance](https://developers.openai.com/api/docs/guides/deployment-checklist).

Luna accepts reasoning `none`, `low`, `medium`, `high`, `xhigh`, `max`, and verbosity `low`, `medium`, `high`. Other models may support fewer options; leave these variables empty to preserve provider defaults, especially with older models. No model, paid processing tier, or retry strategy is changed automatically. Explicit requests for detail still take precedence in Otto's tutor instructions.

Key permissions grant access to endpoints/models; granting more permissions does not improve the model's answers. Otto needs permission to request `/v1/responses` with the configured model. Check the selected project's API keys/permissions only for authorization errors, and its Limits/Billing for rate/quota errors. Raising throughput limits does not guarantee a faster individual answer. See [permissions](https://developers.openai.com/api/docs/guides/rbac) and [rate limits](https://developers.openai.com/api/docs/guides/rate-limits).

The output ceiling includes reasoning as well as visible text. Brief/just-answer requests previously had a separate 480-token cap; they now retain the configured ceiling, with style/verbosity controlling concision rather than truncating equations or JSON. The ceiling is a maximum, not a requested answer length. Timing logs report context preparation, provider wait, first streamed text and parsing in the backend terminal; they contain no keys or screenshot data. This change was verified offline, not benchmarked against paid live responses.

Existing terminal logs inspected on 2026-10-17 showed recent successful initial explanations spending roughly 19-23 seconds in the provider, with context assembly/parsing in milliseconds. Followups took roughly 4-7 seconds, first text at 3.4-4.8 seconds. These are observations from earlier user requests, not new paid test calls or measurements of the new settings.

## Restart and check

Quit Otto, stop the previous development terminal with Ctrl+C, save `.env`, then:

```powershell
# From the repository root:
cd ottodidact
npm run dev
```

This starts the backend, Vite and Electron. For the backend alone, run `npm run dev:server`. For compiled Electron, run `npm run build`, keep `npm run dev:server` in one terminal, and run `npm start` in another.

The backend defaults to `http://127.0.0.1:8787`; `PORT` changes that port. Shell environment variables override `.env`, so remove any old `AI_PROVIDER` override from your terminal before restarting. Provider, model and key changes require a backend restart.

The settings gear shows the active provider and model. **Check connection** reads local backend configuration status; it does not verify billing, model access or key validity with a paid request. An absent key produces setup guidance. Authentication/model-access failures and quota errors remain explicit errors with drafts/history preserved. This provider switch was verified with simulated transports only; live account access remains unverified.

## Context, limits and privacy

OpenAI receives the exact full-display PNG, normalized focus rectangle, original question/explanation, annotation index, active history and bounded related threads. Branch discussions enter context without being copied into the main transcript. Session, capture and thread identity, cancellation, and stale-response protection are preserved.

Complete shared validation checks geometry, positive rectangles, unique annotation IDs and resource limits before annotations are drawn. Refusals, truncation and malformed results fail clearly. There are no automatic paid retries; Retry is an explicit action.

`AI_MAX_OUTPUT_TOKENS` defaults to 1800 (256-8192), `AI_TIMEOUT_MS` to 45000 (1000-90000), and `AI_CONTEXT_CHAR_LIMIT` to 24000 (8000-48000). Cancellation stops waiting and aborts upstream HTTP, but cannot undo already charged work. The full snapshot is never silently cropped or replaced.

Usage records the actual returned model and available token counts, including usage for invalid or incomplete output. Prices are never assumed. Both `AI_INPUT_USD_PER_MILLION` and `AI_OUTPUT_USD_PER_MILLION` must be set to enable estimates. Update or clear them when switching models; estimates do not account for all billing adjustments.

Credentials belong only in the backend environment, never renderer code, `VITE_*` variables, logs or shared files. `.env` is ignored and excluded from desktop builds; the Electron launcher strips inherited API keys. Normal operation does not persist screenshots or conversations. OpenAI receives snapshots only for explicit questions/followups.

## Optional live check

The standard tests and native smoke suite make no paid requests. An optional developer script requires a locally generated `.ui-review/reference-snapshot.json` fixture from `desktop/referenceReview.ts`. It is not part of judge setup. Only after configuring a working OpenAI key and intentionally authorizing paid verification:

```powershell
node --import tsx scripts/check-live-provider.ts --confirm-live
```

This permits up to three paid requests against generated study content: an explanation, one annotation followup and a main-chat followup. It stops on the first failure without retries or fallback and never captures your current desktop. Credentials are never printed. Results are written only to the ignored `.ui-review/` directory.
