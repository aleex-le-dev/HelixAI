# Helix AI：自分のマシンで動く、自分だけの AI ワークスペース

<p align="center">
  <img src="src/assets/helix-logo.png" alt="Helix AI" width="360" />
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.zh.md">中文</a> ·
  <strong>日本語</strong>
</p>

<p align="center">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  <a href="https://github.com/medhiclb/HelixAI/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/medhiclb/HelixAI?label=release" /></a>
  <img alt="Platforms: macOS, Windows, Linux" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" />
  <img alt="Interface: English, French, Chinese, Japanese" src="https://img.shields.io/badge/interface-EN%20%C2%B7%20FR%20%C2%B7%20ZH%20%C2%B7%20JA-success" />
</p>

<p align="center">
  <a href="#インストール">インストール</a>
  · <a href="#機能">機能</a>
  · <a href="#ソースからビルド">ソースからビルド</a>
  · <a href="#ドキュメント">ドキュメント</a>
  · <a href="#コントリビューション">コントリビューション</a>
</p>

Helix AI は、チャット、エージェント、コーディング、ナレッジベース、ファインチューニングを、
**お使いのハードウェアで動く** 1 つのデスクトップアプリにまとめたものです。各組織が自分の
インスタンスをインストールします。会話、文書、モデルは組織のマシンに残り、販売や貸し出しは
一切ありません。

<p align="center">
  <img src="docs/images/chat.png" alt="ナレッジベースをもとに回答し、回答の下に出典を示すチャット" width="900" />
</p>

### Helix AI を選ぶ理由

- **データは手元に残ります。** モデルはお使いのマシンまたは組織のサーバーで動作します。
  会話がクラウドの AI プロバイダーに届くのは、ご自身でそのプロバイダーの API キーを追加した場合だけです。
- **設定は不要です。** アプリをインストールすれば、残りはアプリがインストールします。モデルエンジン、
  ハードウェアに合ったモデル、必要に応じて Python と Node です。エンジン、Python、Node、OpenCode、
  文書と音声入力のライブラリ、画像・動画・トレーニングのモデルは、バージョンを固定し、チェックサムを
  検証しています。チャットモデルは LM Studio のカタログから、LM Studio が提供するバージョンで取得し、
  NVIDIA 向けのトレーニング環境はバージョンのみを固定しています。
- **1 つのアプリで多くの仕事を。** チャット、ファイルやツールを操作するエージェント、コードエージェント、
  出典を示すナレッジベース、議事録、独自モデルのファインチューニング。
- **チームのために。** 同僚をインスタンスに招待し、ナレッジベースをグループごとに共有し、
  何かを変更する操作はすべて承認し、監査ログを残せます。
- **オープンソースで、サブスクリプションなし。** AGPL-3.0。私たちのアカウントは不要で、テレメトリーもありません。

## インストール

お使いのシステム用のパッケージを [最新リリース](https://github.com/medhiclb/HelixAI/releases/tag/v2026.928.2) からダウンロードしてください。
SHA-256 チェックサム：[`SHA256SUMS.txt`](https://github.com/medhiclb/HelixAI/releases/download/v2026.928.2/SHA256SUMS.txt)。

| プラットフォーム | ダウンロード | インストール方法 |
|---|---|---|
| **macOS**（Apple シリコン） | [Helix-2026.928.2-arm64.dmg](https://github.com/medhiclb/HelixAI/releases/download/v2026.928.2/Helix-2026.928.2-arm64.dmg) | ディスクイメージを開き、Helix をアプリケーションフォルダーにドラッグします。初回起動時：「システム設定」›「プライバシーとセキュリティ」›「このまま開く」 |
| **Windows 10/11**（x64） | [Helix-Setup-2026.928.2-x64.exe](https://github.com/medhiclb/HelixAI/releases/download/v2026.928.2/Helix-Setup-2026.928.2-x64.exe) | インストーラーを実行します（管理者権限は不要）。SmartScreen が表示された場合：「詳細情報」›「実行」 |
| **Ubuntu、Debian**（x64） | [helix-plateforme_2026.928.2_amd64.deb](https://github.com/medhiclb/HelixAI/releases/download/v2026.928.2/helix-plateforme_2026.928.2_amd64.deb) | `sudo apt install ./helix-plateforme_2026.928.2_amd64.deb` |
| **その他の Linux**（x64） | [Helix-2026.928.2.AppImage](https://github.com/medhiclb/HelixAI/releases/download/v2026.928.2/Helix-2026.928.2.AppImage) | `chmod +x Helix-2026.928.2.AppImage` の後、実行します。Ubuntu 24.04 では `.deb` をおすすめします |

初回起動時に、Helix AI は必要なものをすべて準備します。[LM Studio](https://lmstudio.ai) の
ヘッドレスエンジン（固定バージョン、チェックサム検証済み）、またはマシンですでに使われている場合は
LM Studio アプリ、そしてマシンに最も適したモデルです。Python、Node、および Helix Code 用の
[OpenCode](https://github.com/anomalyco/opencode) は、ない場合にワンクリックでインストールされます
（固定バージョン、チェックサム検証済み）。新しいバージョンはアプリ内でお知らせします。macOS では
ワンクリックで、Windows と Linux では新しいパッケージが提示され、以前のものの上にインストールされます。
データはそのまま残ります。

**macOS ではコマンド 1 つで**（推奨）：ディスクイメージを `SHA256SUMS.txt` とコード署名で確認したうえで、
Gatekeeper の確認なしにアプリがインストールされます。

```bash
curl -fsSL https://raw.githubusercontent.com/medhiclb/HelixAI/main/scripts/installer-macos.sh | sh
```

アプリはまだ Apple や Microsoft の署名を受けていません。macOS では、アプリが公証されるまで、
新しいバージョンのたびに一度、Helix がキーチェーンの項目（「Helix Safe Storage」）にアクセスする許可を
求められます。「常に許可」を選んでください。Windows 11 では、スマート アプリ コントロールが有効な場合、
署名のないアプリはブロックされ、そのまま実行する選択肢も表示されません。

ソースからビルドするには：`npm install`、`npm run build` の後、`npm run package`（macOS）、
`npx electron-builder --win nsis --x64`（Windows）、または
`npx electron-builder --linux AppImage deb --x64`（Linux）。

## 機能

- **チャット**：**マシンごとに選ばれた**ローカルモデルで。Helix AI は、小さなノートパソコンから
  ワークステーションまで、メモリに収まる最も評価の高いオープンモデル（Apache 2.0 または MIT）を
  インストールし、動かせるほかのモデルも提案します。カタログには Qwen、Mistral（Magistral、Ministral）、
  OpenAI gpt-oss、Z.ai GLM、IBM Granite、Ai2 OLMo、Meta、DeepSeek が含まれます。クラウドモデルは
  ご自身の API キーで使えます。
  添付ファイル、音声入力（Whisper、マシン上）、画像生成（Z-Image Turbo、FLUX.2 klein）、短い
  **動画**（Wan 2.1 と 2.2）も、すべてマシン上で動作します。
- **ナレッジベース（RAG）**：文書をまとめると、インスタンスがマシン上でインデックス化し、回答では
  使った箇所が引用されます。各人が見つけられるのは、閲覧が許可された文書だけです。
- **Cowork**：ファイルに対して、またあなたの承認のもとで仮想デスクトップ（LibreOffice、ブラウザー）上で
  作業し、Word、Excel、PowerPoint、PDF の文書を作成するエージェント。
- **Helix Code**：プロジェクトフォルダーで動くコードエージェント（OpenCode ベース）。**VS Code**
  （拡張機能を同梱）でも、**`helix` コマンドライン**でターミナルからも使えます。
- **コネクタ**：メール、Google カレンダー（読み書き）、Google ドライブ、Slack、Notion、MCP サーバー。
  すべて**承認の仕組み**を経由し、何かを変更する操作はあなたの了承なしには行われません。
- **スケジュールタスク**：指示と頻度（毎日、月曜日から金曜日、週または月の特定の日）を設定すると、
  ウィンドウを閉じていても、選んだエージェントがあなたのツールで実行します。「タスク」で作成するか、
  チャットで依頼して作成できます。
- **常時稼働のエージェント**：スケジュールされたミッション、受信メールやメッセージングへの返信を、
  それぞれのナレッジベースと写真とともに。受信したメールは権限を減らして処理され、Web では
  すでに見たアドレスしか開きません。
- **モデルのトレーニング**：例をもとに、小さなオープンモデルに会社の事実を学習させ、元のモデルと比較してから
  LM Studio にインストールします（Apple シリコンでは MLX、NVIDIA カードでは Unsloth）。
- **開発者 API**：インスタンスの OpenAI 互換 API（`/v1/models`、`/v1/chat/completions`、ナレッジベースを含む）
  のための個人用 API キー。あなたの名前で動作し、それ以上のことはできません。ほかのルートも、
  インスタンスが実行するツールも使えず、いつでもすぐに取り消せます。
- **会議**：録音またはインポート、マシン上での文字起こしと議事録、会議ボット。
- **インポート**：ChatGPT、Claude、Claude Code、Codex、Cursor の履歴を引き継ぎます。
- **チーム**：アカウント、グループ、共有、2 要素認証、監査ログ、GDPR エクスポート、保存データの暗号化。
  新しいバージョンはアプリ内でお知らせします。macOS ではワンクリックで、発行元の署名がある場合だけ
  インストールされます。Windows と Linux では新しいパッケージが提示されます。
- **ホワイトラベル**：製品名、ロゴ、色は 1 つの設定ファイルで決まります。

<table>
  <tr>
    <td><img src="docs/images/knowledge.png" alt="「ファイル」のナレッジベース" /></td>
    <td><img src="docs/images/training.png" alt="モデルのトレーニング：例" /></td>
  </tr>
  <tr>
    <td align="center">ナレッジベース</td>
    <td align="center">モデルのトレーニング</td>
  </tr>
  <tr>
    <td><img src="docs/images/home.png" alt="ホーム画面" /></td>
    <td><img src="docs/images/code.png" alt="Helix Code" /></td>
  </tr>
  <tr>
    <td align="center">ホーム</td>
    <td align="center">Helix Code</td>
  </tr>
</table>

## ソースからビルド

### 前提条件

- macOS（Apple シリコン）、Windows 10/11、または Linux（x64）の開発用マシン。Windows と Linux の
  パッケージは Mac からもビルドできます
- Node.js 22.18 以降と npm（ビルドと開発にのみ必要です。ゲートウェイは TypeScript を直接実行し、
  インストールされたアプリには Node も Python も不要です）

事前にインストールしておくものはほかにありません。初回起動時に、Helix AI は
[LM Studio](https://lmstudio.ai) のヘッドレスエンジン（またはすでに使われている場合は LM Studio アプリ）と、
マシンに合ったモデルをインストールします。メモリは 16 GB を推奨します。それより小さいマシンでは、
Helix AI がより軽いモデルを選びます。

### 実行

```bash
git clone https://github.com/medhiclb/HelixAI
cd HelixAI
npm install
npm run app
```

`npm run app` はゲートウェイをビルドし、デスクトップアプリを開きます。デスクトップアプリは自身のローカル
ゲートウェイを起動します。Web インターフェースだけを使う場合は、2 つのターミナルで `npm run gateway` と
`npm run dev` を実行します。

### パッケージ化と確認

```bash
npm run package      # macOS：release/ に .dmg と .zip
npx electron-builder --win nsis --x64            # Windows インストーラー（npm run build の後）
npx electron-builder --linux AppImage deb --x64  # Linux パッケージ（npm run build の後）
npm run typecheck    # インターフェースとゲートウェイ
npm run securite     # 使い捨てのインスタンスに対するセキュリティチェック
```

署名と公証の準備はできており、Apple の証明書を待つだけです：
[SIGNATURE.md](SIGNATURE.md) を参照してください。

## コマンドライン

デスクトップアプリには `helix` コマンドが付属しています。**「設定」>「アプリのインストール」> CLI**
で設定してから、次のように使います：

```bash
helix connexion          # インスタンスのアカウントで一度ログイン
helix chat               # ターミナルでチャット
helix chat --outils      # コネクタ付きで、承認の仕組みを経由して
helix code               # 現在のフォルダーでコードエージェント
```

## ドキュメント

技術ドキュメントはフランス語で書かれています。

- [docs/GUIDE.md](docs/GUIDE.md)：技術ガイド全体（ゲートウェイ、ルート、コネクタ、デプロイ、リブランディング）
- [ARCHITECTURE.md](ARCHITECTURE.md)：アーキテクチャと設計判断の記録
- [SECURITE.md](SECURITE.md)：セキュリティモデルとすべてのチェック
- [SCREENS.md](SCREENS.md)：すべての画面と、それぞれが実際に行うこと
- [PROJET.md](PROJET.md)：意図、決定事項、現在の状態、残っている作業

## コミュニティ

- 質問やアイデア：[Discussions](https://github.com/medhiclb/HelixAI/discussions)
- バグや機能の要望：[Issues](https://github.com/medhiclb/HelixAI/issues)
- アプリからバグを報告：「設定」›「問題を報告」（または「ヘルプ」）。入力済みの Issue またはメールが開くので、
  ご自身で確認して送信してください
- セキュリティ上の脆弱性：非公開で報告してください。[SECURITY.md](SECURITY.md) を参照してください
- [行動規範](CODE_OF_CONDUCT.md)

## コントリビューション

コントリビューションを歓迎します。最初のプルリクエストの前に、[CONTRIBUTING.md](CONTRIBUTING.md) を読み、
[CLA](CLA.md) に署名してください。

## ライセンス

[GNU AGPL-3.0](LICENSE)。Helix AI は使用、変更、再配布、販売ができます。配布する人、またはオンライン
サービスとして提供する人は、自分のバージョンのコードを同じライセンスで公開しなければなりません。
詳細は [COPYRIGHT.md](COPYRIGHT.md) にあります。

既定のモデルエンジンである LM Studio はクローズドソースのソフトウェアで、その利用規約で認められているのは
個人利用と組織内部での利用であり、他者へのサービス提供は認められていません。他者のためにインスタンスを
ホストする前に、[PROJET.md § 3.9](PROJET.md) をお読みください。

## 謝辞

多くのオープンソースの成果をもとに作られています。その一部：
[OpenCode](https://github.com/anomalyco/opencode)、
[OpenClaw](https://github.com/openclaw/openclaw)、
[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp)、
[MLX](https://github.com/ml-explore/mlx)、
[Unsloth](https://github.com/unslothai/unsloth)、
[Whisper](https://github.com/openai/whisper)、
[Qwen](https://github.com/QwenLM)、
[LangChain.js](https://github.com/langchain-ai/langchainjs)（テキスト分割）、
[AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)（ナレッジベースの設計）、
[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)、
[Lume](https://github.com/trycua/cua)、[Electron](https://www.electronjs.org)、
[React](https://react.dev)、[Vite](https://vite.dev)。
