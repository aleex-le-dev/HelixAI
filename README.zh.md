# HelixAI：属于您自己的 AI 工作空间，运行在您自己的机器上

<p align="center">
  <img src="src/assets/helix-logo.png" alt="HelixAI" width="360" />
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <strong>中文</strong>
</p>

<p align="center">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  <img alt="Version 0.27.0" src="https://img.shields.io/badge/version-0.27.0-informational" />
  <img alt="Platform: macOS Apple Silicon" src="https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey" />
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

## 安装

目前尚未发布签名版本。在应用通过 Apple 签名和公证之前，请从源码构建（见下文），只需几分钟。

| 平台 | 状态 |
|---|---|
| **macOS（Apple 芯片）** | 已构建并日常使用。从源码构建，然后运行 `npm run package` |
| **Windows** | 已列入打包配置，尚未构建 |
| **Linux** | 已列入打包配置，尚未构建 |

模型运行在 [LM Studio](https://lmstudio.ai) 中；在 macOS 上，首次启动页面可以为您安装它。

## 功能

- **Chat**：使用**按每台机器挑选**的本地模型：Helix 会安装能装入该机器内存、已在 Helix 上测试过、评分最高的开源模型（Apache 2.0 或 MIT），例如 8 GB Mac 上的 Qwen3 4B，16 GB 起的 Qwen3.5 9B，并推荐该机器能运行的其他模型（更大的机器上有 Mistral、gpt-oss、GLM、DeepSeek）。云端模型可用您自己的 API 密钥。支持附件、语音输入（Whisper，本机运行）和图像生成（Z-Image Turbo、FLUX.2 klein）。
- **知识库（RAG）**：汇集文档，实例在本机为其建立索引，回答会引用所用的段落。每个人只能找到自己有权查看的文档。
- **Cowork**：在您的文件上工作的智能体，经您同意后还可在虚拟桌面（LibreOffice、浏览器）上操作，生成 Word、Excel、PowerPoint 和 PDF 文档。
- **Helix Code**：作用于项目文件夹的代码智能体（基于 OpenCode），也可在 **VS Code**（附带扩展）和终端中通过 **`helix` 命令行**使用。
- **连接器**：邮件、日历、Google Drive、Slack、Notion 和 MCP 服务器，均受**审批机制**保护：任何修改操作都须经您同意。
- **全天候智能体**：定时任务、回复收到的邮件和即时消息，并可使用各自的知识库。
- **训练模型**：用示例让小型开源模型学习贵公司的信息，与原始模型对比，然后安装到 LM Studio（Apple 芯片上使用 MLX；NVIDIA 显卡上使用 Unsloth，尚未在真实硬件上试过）。
- **会议**：录制或导入，在本机转写并生成纪要，支持会议机器人。
- **导入**来自 ChatGPT、Claude、Claude Code、Codex 和 Cursor 的历史记录。
- **团队**：账户、群组、共享、双重认证、审计日志、GDPR 导出，数据落盘加密。
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

- Apple 芯片的 macOS 14 或更高版本，建议 16 GB 内存
- Node.js 20 或更高版本，以及 npm
- [LM Studio](https://lmstudio.ai)：首次启动时，Helix 会安装适合该机器的模型
- 可选：用于 Helix Code 的 [OpenCode](https://opencode.ai)，用于 Cowork 文档的 Python 3

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
npm run package      # 在 release/ 中生成未签名的 .dmg 和 .zip
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

## 参与贡献

欢迎贡献。提交第一个 pull request 之前，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 并签署 [CLA](CLA.md)。

## 许可证

[GNU AGPL-3.0](LICENSE)。您可以使用、修改、再分发和销售 HelixAI。分发它或将其作为在线服务提供的人，必须以相同许可证公开其版本的代码。详见 [COPYRIGHT.md](COPYRIGHT.md)。

默认模型引擎 LM Studio 是闭源软件，其条款仅允许组织内部使用：为他人托管实例之前，请阅读 [PROJET.md § 3.9](PROJET.md)。

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
