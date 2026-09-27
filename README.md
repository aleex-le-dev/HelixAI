# HelixAI: your own AI workspace, on your own machines

<p align="center">
  <img src="src/assets/helix-logo.png" alt="HelixAI" width="360" />
</p>

<p align="center">
  <strong>English</strong> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  <img alt="Version 2026.9.27" src="https://img.shields.io/badge/version-2026.9.27-informational" />
  <img alt="Platforms: macOS, Windows, Linux" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" />
  <img alt="Interface: English, French, Chinese" src="https://img.shields.io/badge/interface-EN%20%C2%B7%20FR%20%C2%B7%20ZH-success" />
</p>

<p align="center">
  <a href="#installation">Installation</a>
  · <a href="#features">Features</a>
  · <a href="#build-from-source">Build from source</a>
  · <a href="#documentation">Documentation</a>
  · <a href="#contributing">Contributing</a>
</p>

HelixAI brings chat, agents, coding, knowledge bases and fine-tuning together in one
desktop app that runs **on your own hardware**. Each organisation installs its own
instance: conversations, documents and models stay on its machines, and nothing is
sold or rented.

<p align="center">
  <img src="docs/images/chat.png" alt="A Chat answering from a knowledge base, with its sources cited under the answer" width="900" />
</p>

## Installation

Download the package for your system from the [latest release](https://github.com/medhiclb/HelixAI/releases/tag/v2026.9.27).
SHA-256 checksums: [`SHA256SUMS.txt`](https://github.com/medhiclb/HelixAI/releases/download/v2026.9.27/SHA256SUMS.txt).

| Platform | Download | Installation |
|---|---|---|
| **macOS** (Apple Silicon) | [Helix-2026.9.27-arm64.dmg](https://github.com/medhiclb/HelixAI/releases/download/v2026.9.27/Helix-2026.9.27-arm64.dmg) | Open the disk image and drag Helix to Applications. On first launch: System Settings › Privacy & Security › "Open Anyway" |
| **Windows 10/11** (x64) | [Helix-Setup-2026.9.27-x64.exe](https://github.com/medhiclb/HelixAI/releases/download/v2026.9.27/Helix-Setup-2026.9.27-x64.exe) | Run the installer (no administrator rights needed). If SmartScreen appears: "More info" › "Run anyway" |
| **Ubuntu, Debian** (x64) | [helix-plateforme_2026.9.27_amd64.deb](https://github.com/medhiclb/HelixAI/releases/download/v2026.9.27/helix-plateforme_2026.9.27_amd64.deb) | `sudo apt install ./helix-plateforme_2026.9.27_amd64.deb` |
| **Other Linux** (x64) | [Helix-2026.9.27.AppImage](https://github.com/medhiclb/HelixAI/releases/download/v2026.9.27/Helix-2026.9.27.AppImage) | `chmod +x Helix-2026.9.27.AppImage`, then run it. On Ubuntu 24.04, prefer the `.deb` |

On first launch, Helix sets up everything it needs: [LM Studio](https://lmstudio.ai)'s
headless engine (pinned version, verified checksum), or the LM Studio app if it is already in
use on the machine, and the model best suited to the machine. Python, Node and, for Helix
Code, [OpenCode](https://github.com/anomalyco/opencode) are installed in one click when
missing (pinned versions, verified checksums). New versions are announced in the app: one
click on macOS; on Windows and Linux, the new package is offered and installs over the
previous one, and your data is kept.

**macOS, in one command** (recommended): the app installs without the Gatekeeper
prompt, after checking the disk image against `SHA256SUMS.txt` and its code signature:

```bash
curl -fsSL https://raw.githubusercontent.com/medhiclb/HelixAI/main/scripts/installer-macos.sh | sh
```

The apps are not signed by Apple or Microsoft yet. On macOS, until the app is notarised,
macOS asks once after each new version for Helix to access its keychain item ("Helix Safe
Storage"): choose "Always Allow". On Windows 11, Smart App Control, when active, blocks
unsigned apps and does not offer to run them anyway.

To build from source: `npm install`, `npm run build`, then `npm run package` (macOS),
`npx electron-builder --win nsis --x64` (Windows) or
`npx electron-builder --linux AppImage deb --x64` (Linux).

## Features

- **Chat** with local models **picked for each machine**: Helix installs the best-rated open
  model (Apache 2.0 or MIT) that fits its memory, from a small laptop to a workstation, and
  suggests the others it can run. The catalogue covers Qwen, Mistral (Magistral, Ministral),
  OpenAI gpt-oss, Z.ai GLM, IBM Granite, Ai2 OLMo, Meta and DeepSeek. Cloud models work with
  your own API key.
  Attachments, dictation (Whisper, on the machine), image generation (Z-Image Turbo,
  FLUX.2 klein) and short **videos** (Wan 2.1 and 2.2), also on the machine.
- **Knowledge bases (RAG)**: gather documents, the instance indexes them on the machine,
  and answers cite the passages they use. Everyone only finds the documents they are
  allowed to see.
- **Cowork**: an agent that works on your files and, with your approval, on a virtual
  desktop (LibreOffice, browser) to produce Word, Excel, PowerPoint and PDF documents.
- **Helix Code**: a coding agent on your project folder (built on OpenCode), also in
  **VS Code** (extension included) and in the terminal with the **`helix` command line**.
- **Connectors**: mail, Google Calendar (read and write), Google Drive, Slack, Notion and MCP
  servers, behind an **approval gate**: nothing that changes something happens without your
  go-ahead.
- **Scheduled tasks**: an instruction and a rhythm (every day, Monday to Friday, a day of the
  week or of the month), run with your tools, even with the window closed, by the agent you
  choose; created in Tasks or by asking in a Chat.
- **Always-on agents**: scheduled missions, replies to incoming mail and messaging apps,
  with their own knowledge bases and photo. A received email is handled with reduced rights:
  on the web, the agent only opens addresses it has already seen.
- **Train a model**: teach a small open model your company's facts from examples,
  compare it with the original, then install it in LM Studio (MLX on Apple Silicon;
  Unsloth on NVIDIA cards).
- **Developer API**: personal API keys for the instance's OpenAI-compatible API
  (`/v1/models`, `/v1/chat/completions`, knowledge bases included), in your name and
  nothing more: no other route, no tool run by the instance, revocable at once.
- **Meetings**: record or import, transcription and minutes on the machine, meeting bot.
- **Import** your history from ChatGPT, Claude, Claude Code, Codex and Cursor.
- **Teams**: accounts, groups, sharing, two-factor authentication, audit log, GDPR export,
  data encrypted at rest. One-click updates from the instance (macOS), installed only if they carry
  the publisher's signature.
- **White label**: the product name, logo and colours come from one configuration file.

<table>
  <tr>
    <td><img src="docs/images/knowledge.png" alt="Knowledge bases in Files" /></td>
    <td><img src="docs/images/training.png" alt="Train a model: examples" /></td>
  </tr>
  <tr>
    <td align="center">Knowledge bases</td>
    <td align="center">Train a model</td>
  </tr>
  <tr>
    <td><img src="docs/images/home.png" alt="Home screen" /></td>
    <td><img src="docs/images/code.png" alt="Helix Code" /></td>
  </tr>
  <tr>
    <td align="center">Home</td>
    <td align="center">Helix Code</td>
  </tr>
</table>

## Build from source

### Prerequisites

- A development machine on macOS (Apple Silicon), Windows 10/11 or Linux (x64); the Windows
  and Linux packages can also be built from a Mac
- Node.js 22.18 or later and npm (only to build and develop, the gateway runs its TypeScript
  directly: the installed app needs neither Node nor Python)

Nothing else needs to be installed beforehand: on first launch, Helix installs
[LM Studio](https://lmstudio.ai)'s headless engine (or uses the LM Studio app if it is already
in use) and the model suited to the machine. 16 GB of memory is recommended; on smaller machines Helix picks a
lighter model.

### Run

```bash
git clone https://github.com/medhiclb/HelixAI
cd HelixAI
npm install
npm run app
```

`npm run app` builds the gateway and opens the desktop app, which starts its own local
gateway. The web interface alone runs with `npm run gateway` and `npm run dev` in two
terminals.

### Package and check

```bash
npm run package      # macOS: .dmg and .zip in release/
npx electron-builder --win nsis --x64            # Windows installer (after npm run build)
npx electron-builder --linux AppImage deb --x64  # Linux packages (after npm run build)
npm run typecheck    # interface and gateway
npm run securite     # security checks against a throwaway instance
```

Signing and notarisation are ready and only wait for an Apple certificate:
see [SIGNATURE.md](SIGNATURE.md).

## Command line

The desktop app ships the `helix` command. Set it up from **Settings > Install the
apps > CLI**, then:

```bash
helix connexion          # sign in once with your instance account
helix chat               # a Chat in the terminal
helix chat --outils      # with your connectors, behind the approval gate
helix code               # the coding agent on the current folder
```

## Documentation

The technical documentation is written in French.

- [docs/GUIDE.md](docs/GUIDE.md): the full technical guide (gateway, routes, connectors,
  deployment, rebranding)
- [ARCHITECTURE.md](ARCHITECTURE.md): architecture and decision records
- [SECURITE.md](SECURITE.md): security model and every check
- [SCREENS.md](SCREENS.md): every screen and what it really does
- [PROJET.md](PROJET.md): intentions, decisions, current state and what is left to do

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and sign the
[CLA](CLA.md) before your first pull request.

## License

[GNU AGPL-3.0](LICENSE). You may use, modify, redistribute and sell HelixAI. Whoever
distributes it, or offers it as an online service, must publish the code of their
version under the same licence. Details in [COPYRIGHT.md](COPYRIGHT.md).

LM Studio, the default model engine, is closed-source software whose terms allow personal
use and an organisation's internal use, not a service provided to others: read
[PROJET.md § 3.9](PROJET.md) before hosting an instance for others.

## Acknowledgements

Built with open-source work, among others:
[OpenCode](https://github.com/anomalyco/opencode),
[OpenClaw](https://github.com/openclaw/openclaw),
[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp),
[MLX](https://github.com/ml-explore/mlx),
[Unsloth](https://github.com/unslothai/unsloth),
[Whisper](https://github.com/openai/whisper),
[Qwen](https://github.com/QwenLM),
[LangChain.js](https://github.com/langchain-ai/langchainjs) (text splitter),
[AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) (design of the knowledge
bases), [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill),
[Lume](https://github.com/trycua/cua), [Electron](https://www.electronjs.org),
[React](https://react.dev) and [Vite](https://vite.dev).
