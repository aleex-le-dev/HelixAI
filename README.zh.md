# HelixAI：属于您自己的 AI 工作空间，运行在您自己的机器上

<p align="center">
  <img src="src/assets/helix-logo.png" alt="HelixAI" width="360" />
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <strong>中文</strong> ·
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  <a href="https://github.com/medhiclb/HelixAI/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/medhiclb/HelixAI?label=release" /></a>
  <img alt="Platforms: macOS, Windows, Linux" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" />
  <img alt="Interface: English, French, Chinese" src="https://img.shields.io/badge/interface-EN%20%C2%B7%20FR%20%C2%B7%20ZH-success" />
</p>

<p align="center">
  <a href="#安装">安装</a>
  · <a href="#功能">功能</a>
  · <a href="#从源码构建">从源码构建</a>
  · <a href="#文档">文档</a>
  · <a href="#参与贡献">参与贡献</a>
</p>

HelixAI 将 Chat、智能体、编程、知识库和模型微调整合到一个**运行在您自己硬件上**的桌面应用中。每个组织安装自己的实例：对话、文档和模型都留在自己的机器上，不出售也不出租任何东西。

<p align="center">
  <img src="docs/images/chat.png" alt="基于知识库回答的 Chat，回答下方注明来源" width="900" />
</p>

### 为什么选择 HelixAI

- **数据留在您手中。** 模型在您的电脑或组织的服务器上运行；只有在您自己添加某个在线 AI 服务的 API 密钥时，您的对话才会发送给该服务商。
- **无需配置。** 安装应用后，其余一切自动安装：模型引擎、适合您硬件的模型，以及按需安装的 Python 和 Node。引擎、Python、Node、OpenCode、文档与听写所用的库，以及图像、视频和训练模型，均固定版本并验证校验值；对话模型来自 LM Studio 的目录，版本由 LM Studio 提供；NVIDIA 训练组件仅固定版本。
- **一个应用，多种工作。** Chat、可操作您文件和工具的智能体、代码智能体、注明来源的知识库、会议纪要，以及微调您自己的模型。
- **为团队设计。** 邀请同事加入您的实例，按群组共享知识库，任何会修改内容的操作都需您批准，并保留审计日志。
- **开源，无需订阅。** AGPL-3.0，无需在我们这里注册账户，无遥测。

## 安装

请在[最新发布页](https://github.com/medhiclb/HelixAI/releases/tag/v2026.927.4)下载适合您系统的安装包。SHA-256 校验值：[`SHA256SUMS.txt`](https://github.com/medhiclb/HelixAI/releases/download/v2026.927.4/SHA256SUMS.txt)。

| 系统 | 下载 | 安装方法 |
|---|---|---|
| **macOS**（Apple 芯片） | [Helix-2026.927.4-arm64.dmg](https://github.com/medhiclb/HelixAI/releases/download/v2026.927.4/Helix-2026.927.4-arm64.dmg) | 打开磁盘映像，将 Helix 拖入“应用程序”。首次启动时：系统设置 › 隐私与安全性 › “仍要打开” |
| **Windows 10/11**（x64） | [Helix-Setup-2026.927.4-x64.exe](https://github.com/medhiclb/HelixAI/releases/download/v2026.927.4/Helix-Setup-2026.927.4-x64.exe) | 运行安装程序（无需管理员权限）。如出现 SmartScreen：“更多信息” › “仍要运行” |
| **Ubuntu、Debian**（x64） | [helix-plateforme_2026.927.4_amd64.deb](https://github.com/medhiclb/HelixAI/releases/download/v2026.927.4/helix-plateforme_2026.927.4_amd64.deb) | `sudo apt install ./helix-plateforme_2026.927.4_amd64.deb` |
| **其他 Linux**（x64） | [Helix-2026.927.4.AppImage](https://github.com/medhiclb/HelixAI/releases/download/v2026.927.4/Helix-2026.927.4.AppImage) | `chmod +x Helix-2026.927.4.AppImage`，然后运行。在 Ubuntu 24.04 上建议使用 `.deb` |

首次启动时，Helix 会自动完成所需的安装：[LM Studio](https://lmstudio.ai) 的无界面引擎（版本固定，校验值已验证；若本机已在使用 LM Studio 应用，则直接使用该应用）以及最适合本机的模型。若缺少 Python、Node 以及 Helix Code 所需的 [OpenCode](https://github.com/anomalyco/opencode)，可一键安装（版本固定，校验值已验证）。新版本会在应用内提示：macOS 上一键安装；在 Windows 和 Linux 上，会提供新安装包，覆盖旧版本安装即可，数据会保留。

**macOS 一条命令安装**（推荐）：先根据 `SHA256SUMS.txt` 校验磁盘映像及其代码签名，再安装应用，不会出现 Gatekeeper 提示：

```bash
curl -fsSL https://raw.githubusercontent.com/medhiclb/HelixAI/main/scripts/installer-macos.sh | sh
```

这些应用尚未获得 Apple 或 Microsoft 的签名。在 macOS 上，应用获得公证之前，每次安装新版本后，macOS 会询问一次是否允许 Helix 访问其钥匙串项目（“Helix Safe Storage”）：请选择“始终允许”。在 Windows 11 上，智能应用控制（Smart App Control）启用时会阻止未签名的应用，且不提供“仍要运行”选项。

从源码构建：`npm install`、`npm run build`，然后运行 `npm run package`（macOS）、`npx electron-builder --win nsis --x64`（Windows）或 `npx electron-builder --linux AppImage deb --x64`（Linux）。

## 功能

- **Chat**：使用**按每台机器挑选**的本地模型：Helix 会安装能装入该机器内存、评分最高的开源模型（Apache 2.0 或 MIT），从小型笔记本到工作站都适用，并推荐该机器能运行的其他模型。模型目录涵盖 Qwen、Mistral（Magistral、Ministral）、OpenAI gpt-oss、Z.ai GLM、IBM Granite、Ai2 OLMo、Meta 和 DeepSeek。云端模型可用您自己的 API 密钥。支持附件、语音输入（Whisper，本机运行）、图像生成（Z-Image Turbo、FLUX.2 klein）以及短**视频**生成（Wan 2.1 和 2.2），同样在本机运行。
- **知识库（RAG）**：汇集文档，实例在本机为其建立索引，回答会引用所用的段落。每个人只能找到自己有权查看的文档。
- **Cowork**：在您的文件上工作的智能体，经您同意后还可在虚拟桌面（LibreOffice、浏览器）上操作，生成 Word、Excel、PowerPoint 和 PDF 文档。
- **Helix Code**：作用于项目文件夹的代码智能体（基于 OpenCode），也可在 **VS Code**（附带扩展）和终端中通过 **`helix` 命令行**使用。
- **连接器**：邮件、Google 日历（读写）、Google Drive、Slack、Notion 和 MCP 服务器，均受**审批机制**保护：任何修改操作都须经您同意。
- **定时任务**：一条指令加一个频率（每天、周一至周五、每周或每月某天），用您的工具执行，即使窗口关闭也会运行，可指定执行的智能体；在“任务”中创建，或在 Chat 中直接提出。
- **全天候智能体**：定时任务、回复收到的邮件和即时消息，并可使用各自的知识库和头像。处理收到的邮件时权限受限：上网时只打开已见过的地址。
- **训练模型**：用示例让小型开源模型学习贵公司的信息，与原始模型对比，然后安装到 LM Studio（Apple 芯片上使用 MLX；NVIDIA 显卡上使用 Unsloth）。
- **开发者 API**：个人 API 密钥，用于实例的 OpenAI 兼容 API（`/v1/models`、`/v1/chat/completions`，含知识库），以您的名义使用且仅限于此：不能访问其他路由，不能让实例执行工具，可随时撤销。
- **会议**：录制或导入，在本机转写并生成纪要，支持会议机器人。
- **导入**来自 ChatGPT、Claude、Claude Code、Codex 和 Cursor 的历史记录。
- **团队**：账户、群组、共享、双重认证、审计日志、GDPR 导出，数据落盘加密。新版本会在应用内提示：macOS 上一键安装，且只安装带有发布者签名的版本；Windows 和 Linux 上提供新安装包。
- **白标**：产品名称、标志和颜色都来自同一个配置文件。

<table>
  <tr>
    <td><img src="docs/images/knowledge.png" alt="“文件”中的知识库" /></td>
    <td><img src="docs/images/training.png" alt="训练模型：示例" /></td>
  </tr>
  <tr>
    <td align="center">知识库</td>
    <td align="center">训练模型</td>
  </tr>
  <tr>
    <td><img src="docs/images/home.png" alt="首页" /></td>
    <td><img src="docs/images/code.png" alt="Helix Code" /></td>
  </tr>
  <tr>
    <td align="center">首页</td>
    <td align="center">Helix Code</td>
  </tr>
</table>

## 从源码构建

### 前提条件

- 一台开发机器：macOS（Apple 芯片）、Windows 10/11 或 Linux（x64）；Windows 和 Linux 安装包也可以在 Mac 上构建
- Node.js 22.18 或更高版本，以及 npm（仅用于构建和开发，网关直接运行 TypeScript：安装后的应用既不需要 Node 也不需要 Python）

无需预先安装其他任何组件：首次启动时，Helix 会安装 [LM Studio](https://lmstudio.ai) 的无界面引擎（若已在使用 LM Studio 应用则直接使用）以及适合本机的模型。建议 16 GB 内存；在配置较低的机器上，Helix 会选择更轻量的模型。

### 运行

```bash
git clone https://github.com/medhiclb/HelixAI
cd HelixAI
npm install
npm run app
```

`npm run app` 会编译网关并打开桌面应用，应用会启动自己的本地网关。若只运行网页界面，请在两个终端中分别执行 `npm run gateway` 和 `npm run dev`。

### 打包与检查

```bash
npm run package      # macOS：在 release/ 中生成 .dmg 和 .zip
npx electron-builder --win nsis --x64            # Windows 安装程序（先运行 npm run build）
npx electron-builder --linux AppImage deb --x64  # Linux 安装包（先运行 npm run build）
npm run typecheck    # 界面和网关
npm run securite     # 针对临时实例的安全检查
```

签名和公证已准备就绪，只差 Apple 证书：见 [SIGNATURE.md](SIGNATURE.md)。

## 命令行

桌面应用自带 `helix` 命令。在 **设置 > 安装应用 > CLI** 中完成设置，然后：

```bash
helix connexion          # 使用实例账户登录一次
helix chat               # 在终端中使用 Chat
helix chat --outils      # 使用连接器，受审批机制保护
helix code               # 在当前文件夹上使用代码智能体
```

## 文档

技术文档使用法语编写。

- [docs/GUIDE.md](docs/GUIDE.md)：完整技术指南（网关、路由、连接器、部署、更换品牌）
- [ARCHITECTURE.md](ARCHITECTURE.md)：架构与决策记录
- [SECURITE.md](SECURITE.md)：安全模型及每项检查
- [SCREENS.md](SCREENS.md)：每个界面及其实际功能
- [PROJET.md](PROJET.md)：目标、决策、现状及待办事项

## 社区

- 问题与想法：[Discussions](https://github.com/medhiclb/HelixAI/discussions)
- 缺陷与功能请求：[Issues](https://github.com/medhiclb/HelixAI/issues)
- 在应用内报告缺陷：设置 › 报告问题（或帮助），预先填好问题单或邮件，由您查看后亲自发送
- 安全漏洞：请私下报告，见 [SECURITY.md](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)

## 参与贡献

欢迎贡献。提交第一个 pull request 之前，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 并签署 [CLA](CLA.md)。

## 许可证

[GNU AGPL-3.0](LICENSE)。您可以使用、修改、再分发和销售 HelixAI。分发它或将其作为在线服务提供的人，必须以相同许可证公开其版本的代码。详见 [COPYRIGHT.md](COPYRIGHT.md)。

默认模型引擎 LM Studio 是闭源软件，其条款允许个人使用和组织内部使用，但不允许向他人提供服务：为他人托管实例之前，请阅读 [PROJET.md § 3.9](PROJET.md)。

## 致谢

本项目基于众多开源成果构建，其中包括：
[OpenCode](https://github.com/anomalyco/opencode),
[OpenClaw](https://github.com/openclaw/openclaw),
[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp),
[MLX](https://github.com/ml-explore/mlx),
[Unsloth](https://github.com/unslothai/unsloth),
[Whisper](https://github.com/openai/whisper),
[Qwen](https://github.com/QwenLM),
[LangChain.js](https://github.com/langchain-ai/langchainjs) （文本切分）,
[AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) （知识库设计）, [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill),
[Lume](https://github.com/trycua/cua), [Electron](https://www.electronjs.org),
[React](https://react.dev)、[Vite](https://vite.dev)。
