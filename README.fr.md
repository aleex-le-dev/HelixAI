# HelixAI : votre espace de travail IA, sur vos propres machines

<p align="center">
  <img src="src/assets/helix-logo.png" alt="HelixAI" width="360" />
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <strong>Français</strong> ·
  <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  <img alt="Version 0.27.0" src="https://img.shields.io/badge/version-0.27.0-informational" />
  <img alt="Platform: macOS Apple Silicon" src="https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey" />
  <img alt="Interface: English, French, Chinese" src="https://img.shields.io/badge/interface-EN%20%C2%B7%20FR%20%C2%B7%20ZH-success" />
</p>

<p align="center">
  <a href="#installation">Installation</a>
  · <a href="#fonctions">Fonctions</a>
  · <a href="#construire-depuis-les-sources">Construire depuis les sources</a>
  · <a href="#documentation">Documentation</a>
  · <a href="#contribuer">Contribuer</a>
</p>

HelixAI réunit le Chat, les agents, le code, les bases de connaissances et
l'entraînement de modèles dans une application de bureau qui tourne **sur votre propre
matériel**. Chaque organisation installe sa propre instance : conversations, documents
et modèles restent sur ses machines, et rien n'est vendu ni loué.

<p align="center">
  <img src="docs/images/chat.png" alt="Un Chat qui répond à partir d'une base de connaissances, sources citées sous la réponse" width="900" />
</p>

## Installation

Aucune version signée n'est encore publiée. Tant que l'application n'est pas signée et
notariée par Apple, construisez-la depuis les sources (ci-dessous) : quelques minutes.

| Plateforme | État |
|---|---|
| **macOS (Apple Silicon)** | Construit et utilisé tous les jours. Depuis les sources, puis `npm run package` |
| **Windows** | Prévu dans la configuration d'empaquetage, jamais construit |
| **Linux** | Prévu dans la configuration d'empaquetage, jamais construit |

Les modèles tournent dans [LM Studio](https://lmstudio.ai), que l'écran de première
installation peut installer pour vous sur macOS.

## Fonctions

- **Chat** avec des modèles locaux **choisis pour chaque machine** : Helix installe le modèle
  ouvert (Apache 2.0 ou MIT) le mieux noté qui tient dans sa mémoire, du petit portable à la
  station de travail, et propose les autres qu'elle peut faire tourner. Le catalogue couvre
  Qwen, Mistral (Magistral, Ministral), OpenAI gpt-oss, Z.ai GLM, IBM Granite, Ai2 OLMo, Meta et
  DeepSeek. Les modèles cloud marchent avec votre propre clé. Pièces jointes, dictée (Whisper, sur la machine), création d'images
  (Z-Image Turbo, FLUX.2 klein).
- **Bases de connaissances (RAG)** : rassemblez des documents, l'instance les indexe sur
  la machine, et les réponses citent les passages utilisés. Chacun n'y retrouve que les
  documents qu'il a le droit de voir.
- **Cowork** : un agent qui travaille sur vos fichiers et, avec votre accord, sur un bureau
  virtuel (LibreOffice, navigateur) pour produire des documents Word, Excel, PowerPoint et PDF.
- **Helix Code** : un agent de code sur le dossier de votre projet (bâti sur OpenCode),
  aussi dans **VS Code** (extension fournie) et dans le terminal avec la **commande `helix`**.
- **Connecteurs** : courrier, agenda, Google Drive, Slack, Notion et serveurs MCP, derrière
  une **barrière d'approbation** : rien qui modifie quelque chose ne se fait sans votre accord.
- **Agents toujours actifs** : missions à heure fixe, réponses aux mails reçus et aux
  messageries, avec leurs propres bases de connaissances.
- **Entraîner un modèle** : apprenez à un petit modèle ouvert les faits de votre société à
  partir d'exemples, comparez-le à l'original, puis installez-le dans LM Studio (MLX sur
  puce Apple ; Unsloth sur carte NVIDIA, pas encore essayé sur une vraie machine).
- **API développeur** : des clés d'API personnelles pour l'API compatible OpenAI de
  l'instance (`/v1/models`, `/v1/chat/completions`, bases de connaissances comprises), en
  votre nom et rien de plus : aucune autre route, aucun outil exécuté par l'instance,
  révocables aussitôt.
- **Réunions** : enregistrement ou import, transcription et compte rendu sur la machine, bot de réunion.
- **Import** de votre historique depuis ChatGPT, Claude, Claude Code, Codex et Cursor.
- **Équipes** : comptes, groupes, partage, double authentification, journal d'audit,
  export RGPD, données chiffrées sur le disque.
- **Marque blanche** : nom du produit, logo et couleurs viennent d'un seul fichier de configuration.

<table>
  <tr>
    <td><img src="docs/images/knowledge.png" alt="Les bases de connaissances dans Fichiers" /></td>
    <td><img src="docs/images/training.png" alt="Entraîner un modèle : les exemples" /></td>
  </tr>
  <tr>
    <td align="center">Bases de connaissances</td>
    <td align="center">Entraîner un modèle</td>
  </tr>
  <tr>
    <td><img src="docs/images/home.png" alt="Écran d'accueil" /></td>
    <td><img src="docs/images/code.png" alt="Helix Code" /></td>
  </tr>
  <tr>
    <td align="center">Accueil</td>
    <td align="center">Helix Code</td>
  </tr>
</table>

## Construire depuis les sources

### Prérequis

- macOS 14 ou plus récent sur puce Apple, 16 Go de mémoire conseillés
- Node.js 20 ou plus récent, et npm
- [LM Studio](https://lmstudio.ai) : au premier lancement, Helix installe le modèle adapté à la machine
- Facultatif : [OpenCode](https://opencode.ai) pour Helix Code, Python 3 pour les documents de Cowork

### Lancer

```bash
git clone https://github.com/medhiclb/HelixAI
cd HelixAI
npm install
npm run app
```

`npm run app` compile la passerelle et ouvre l'application de bureau, qui démarre sa
propre passerelle locale. L'interface web seule se lance avec `npm run gateway` et
`npm run dev`, dans deux terminaux.

### Empaqueter et vérifier

```bash
npm run package      # .dmg et .zip non signés dans release/
npm run typecheck    # interface et passerelle
npm run securite     # contrôles de sécurité contre une instance jetable
```

La signature et la notarisation sont prêtes et n'attendent qu'un certificat Apple :
voir [SIGNATURE.md](SIGNATURE.md).

## Ligne de commande

L'application de bureau fournit la commande `helix`. Mettez-la en place depuis
**Paramètres > Installer les apps > CLI**, puis :

```bash
helix connexion          # se connecter une fois avec son compte de l'instance
helix chat               # un Chat dans le terminal
helix chat --outils      # avec vos connecteurs, derrière la barrière d'approbation
helix code               # l'agent de code sur le dossier courant
```

## Documentation

La documentation technique est en français.

- [docs/GUIDE.md](docs/GUIDE.md) : le guide technique complet (passerelle, routes,
  connecteurs, déploiement, changement de marque)
- [ARCHITECTURE.md](ARCHITECTURE.md) : l'architecture et les décisions
- [SECURITE.md](SECURITE.md) : le modèle de sécurité et chaque contrôle
- [SCREENS.md](SCREENS.md) : chaque écran et ce qu'il fait vraiment
- [PROJET.md](PROJET.md) : intentions, décisions, état réel et ce qui reste à faire

## Contribuer

Les contributions sont les bienvenues. Lisez [CONTRIBUTING.md](CONTRIBUTING.md) et
signez le [CLA](CLA.md) avant votre première pull request.

## Licence

[GNU AGPL-3.0](LICENSE). Vous pouvez utiliser, modifier, redistribuer et vendre HelixAI.
Qui le distribue, ou le propose comme service en ligne, doit publier le code de sa
version sous la même licence. Détails dans [COPYRIGHT.md](COPYRIGHT.md).

LM Studio, le moteur de modèles par défaut, est un logiciel fermé dont les conditions le
réservent à l'usage interne d'une organisation : lisez [PROJET.md § 3.9](PROJET.md) avant
d'héberger une instance pour d'autres.

## Remerciements

Construit avec des travaux open source, entre autres :
[OpenCode](https://github.com/anomalyco/opencode),
[OpenClaw](https://github.com/openclaw/openclaw),
[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp),
[MLX](https://github.com/ml-explore/mlx),
[Unsloth](https://github.com/unslothai/unsloth),
[Whisper](https://github.com/openai/whisper),
[Qwen](https://github.com/QwenLM),
[LangChain.js](https://github.com/langchain-ai/langchainjs) (découpage des textes),
[AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) (conception des bases
de connaissances), [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill),
[Lume](https://github.com/trycua/cua), [Electron](https://www.electronjs.org),
[React](https://react.dev) et [Vite](https://vite.dev).
