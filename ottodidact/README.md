# Ottodidact desktop app

Ottodidact is an Electron + React + TypeScript study companion for Windows. Capture a screen snapshot, select the focus, ask a question, and discuss numbered explanations in individual chats that share the same lesson context.

## Judge setup: no API key required

Use Windows 10/11 and Node.js **22.12 or newer**. From the repository root:

```powershell
cd ottodidact
npm ci
Copy-Item .env.example .env
npm run dev
```

Copy the example only for first setup; do not overwrite an existing `.env`. The example selects **AI_PROVIDER=mock**. This is an explicitly labelled, deterministic demo: it exercises capture, annotations, chat history, and controls, but does not understand the screenshot or solve arbitrary content. No paid API request is made in mock mode. Internet is needed to install dependencies.

`npm run dev` starts the local backend on `127.0.0.1:8787`, Vite on `127.0.0.1:5173`, and the native Electron app. Keep the terminal open. The browser page alone does not provide native desktop overlays or capture.

For real tutoring, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` privately in `.env`, then restart. The example currently names `gpt-6-luna`; choose a model your account supports with image input and structured outputs. See [API setup](docs/api-setup.md). A failed real request stays an error; it never silently returns mock content. The owner's credentials are not distributed.

## Try it in two minutes

1. Display a worksheet, diagram, or paragraph. Click **Otto**, drag a focus rectangle, and release.
2. Type a question and press **Enter**, or choose **Quick answer** without typing. **Shift+Enter** inserts a newline.
3. Watch the initial answer appear progressively. Numbered cards and markings appear once the complete response passes validation.
4. Ask a followup in a card. Collapse and restore it: the same history and draft remain. Its marker and main-chat topic chip also reopen it.
5. Discuss two cards, then ask main chat how they connect. Live tutoring receives the relevant discussions without copying them into the main transcript. Demo replies remain illustrative.
6. Use **New capture** or **Clear annotations** in the settings gear. Quit through settings and stop the development terminal with **Ctrl+C**.

## Controls

| Action | Control |
| --- | --- |
| Select screen content | Click Otto or Ctrl+Shift+O |
| Move launcher | Drag Otto |
| Cancel selection / dismiss active panel | Escape |
| Restore main chat | Right-click Otto or Ctrl+Shift+M |
| Settings | Gear in the question or main-chat header |
| Move explanation card | Drag its title bar |
| Collapse / restore card | Header control; history and draft survive |
| Stop a pending request | Cancel |
| Retake / clear / quit | Header controls or settings |

The full active display is captured once per requested snapshot; the rectangle marks the primary focus. Otto's interface is excluded. Annotations refer to that snapshot and do not track scrolling. Main chat avoids the selected focus where possible; explanation cards grow to their content, reflow around other panels, and scroll when space is limited.

**Always on** provides faint idle edge lighting; **Only when needed** shows it during use. Neither mode continuously monitors the screen. Reduced motion keeps a stationary glass face. Desktop clicks pass through decorative lighting outside active controls.

## Privacy and credentials

- `.env`, local review screenshots, logs, generated builds, and dependencies are excluded from Git. `.env.example` contains placeholders only.
- Keys belong only in the local backend, never renderer code or `VITE_*` variables. The launcher strips inherited provider keys from the Electron environment.
- Normal operation does not save screenshots or conversations to disk. Appearance and launcher preferences persist locally.
- Mock mode keeps screenshot content local. Real OpenAI requests send the full captured display and relevant bounded lesson context when you submit questions; review what is visible before capturing.
- This is a local prototype, not a hosted public API. No accounts, cloud storage, payments, or bundled shared API key are provided.

## Local verification

Run from this application directory:

```powershell
npm run typecheck
npm test
npm run build
```

These checks use mocked transports and make no paid requests. Optional `npm run test:desktop` exercises real Electron windows on Windows with a local mock backend. It opens and controls test windows; use it when you are not working in other apps. Developer review artifacts are stored only in ignored `.ui-review/`.

Recent focused tests covered streaming, cancellation, draft preservation, coordinate mapping, card sizing, and shared context. Native reviews were performed at 1920 x 1080 with 125% scaling using synthetic content; they do not establish model accuracy or compatibility with every monitor/GPU configuration.

## Troubleshooting

- **npm cannot find package.json:** run commands inside the inner `ottodidact/` application folder, not your home folder or repository root.
- **Tutor not connected:** keep the development terminal open, check that the backend started, and open Settings > Check connection. For key-free testing use `AI_PROVIDER=mock` in `.env` and restart. Existing shell environment variables can override `.env`.
- **Port already in use:** quit the previous Otto instance and stop its development terminal before restarting.
- **Real request fails:** inspect the displayed error and your model access, billing, and configuration. Check connection reports local configuration; it does not validate paid API access.
- **Changes to .env or desktop code:** quit Otto, stop the terminal, then run `npm run dev` again.

## Limitations

- Windows is the tested desktop platform. One display is used per capture; selection cannot span monitors. Other physical scales, HDR, and multi-monitor changes need further manual verification.
- Mock answers do not analyze images. Live vision models can misidentify tiny symbols or targets; validation checks geometry, not semantic correctness.
- Very crowded or nearly full-screen selections may leave insufficient room for every panel. Collapse cards or minimize main chat to recover space.
- Protected windows may capture blank. Snapshots are not live screen tracking.
- Sessions are temporary. There is no signed installer or hosted judge demo yet. Use the source development command above.
- The procedural glass material approximates the reference; appearance varies with desktop background and display configuration.

## Project layout

- `desktop/`: native windows, capture, validated IPC, synchronized state.
- `src/`: React panels, safe formatted text/math, annotations, and glass material.
- `server/`: local provider adapter, tutor instructions, validation, and usage limits.
- `shared/`: typed sessions, response schemas, coordinate transforms, and lesson context.
- `tests/`: offline regression fixtures and checks.

See [architecture](docs/architecture.md), [product behavior](docs/product.md), and [API configuration](docs/api-setup.md).
