# Ottodidact

A Windows desktop study companion: select screen content, ask a question, and explore annotated explanations with individual chats and shared lesson context.

The application lives in [`ottodidact/`](ottodidact/). This repository contains the desktop app and its local backend; a hosted browser demo is not available yet.

## Judges: try it without an API key

Install **Node.js 22.12+** on **Windows 10/11**, then run in PowerShell:

```powershell
git clone https://github.com/couch-poetaytoe2024/ottodidact.git
cd ottodidact/ottodidact
npm ci
Copy-Item .env.example .env
npm run dev
```

Copy `.env.example` only on first setup. It selects **labelled mock mode**, which needs no API key or paid requests. Package installation needs internet access. Keep the terminal open while using the app.

1. Click the floating Otto button, then drag to select some screen content.
2. Type a question and press **Enter**, or use **Quick answer** without typing.
3. Inspect the demo annotations. Open a numbered card, send a followup, collapse it, and reopen it to check that its conversation is preserved.
4. Open main chat and ask how two boxes relate. In live mode, their discussions are automatically included as context.
5. Use the header gear for settings, New capture, Clear annotations, and Quit. **Escape** cancels selection or dismisses a panel. **Right-click Otto** or **Ctrl+Shift+M** restores main chat.

**Mock mode demonstrates the interaction, not AI understanding.** Its deterministic answers do not analyze your screenshot or solve arbitrary questions. Real tutoring requires the judge's own OpenAI key configured privately in `.env`; see [API setup](ottodidact/docs/api-setup.md). No owner's key is included or shared.

See [application setup, controls, verification, and limitations](ottodidact/README.md) for more details.
