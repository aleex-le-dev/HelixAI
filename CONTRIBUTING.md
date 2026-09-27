# Contributing to HelixAI

Thank you for considering a contribution. HelixAI is developed in French: the code,
comments and technical documentation are written in French, and the interface is
translated into English and Chinese. Issues and pull requests are welcome in English or
French.

## Before writing code

1. Read [PROJET.md](PROJET.md). It says what the product is, who it is for, and what has
   already been decided. Decisions written there are not reopened without a new reason.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for the decision that touches your topic.
3. For anything larger than a fix, open an issue or a discussion first. Three days of work
   declined on principle is a loss for everyone.

## Project rules

Each rule fixes a defect that has already happened in this repository.

- **Every string shown on screen goes through `t("…")`**, or `tf("… {0} …", value)` when
  it contains a value. The French sentence is the translation key (`src/lib/i18n.ts`,
  `gateway/src/langue.ts`). `node scripts/i18n.mjs --ecrire` and
  `node scripts/i18n-passerelle.mjs --ecrire` prepare the new keys; then fill in
  `src/i18n/{en,zh}.json` and `gateway/i18n/{en,zh}.json`. Both catalogues stay at 100 %.
- **No product name in code**: `branding.name` in the interface, `nomProduit()` in the
  gateway. The software ships as a white label.
- **No hard-coded colour** outside `src/styles/tokens.css`.
- **The software does not lie.** A button that does nothing, a state claimed without being
  measured, a green tick that checks nothing: that is a bug, like a crash. What has not been
  tried is said as such, in the code, the docs and the interface.
- **Downloads are pinned and verified**: a fixed version, a checksum written in the code, and
  a licence compatible with the project (Apache 2.0 or MIT; exceptions are listed in
  [PROJET.md](PROJET.md)).
- **Never write empty data over data that could not be read.**
- **Comments explain why**, not what: the constraint, the measured error, the path ruled out.
- **Check where the user arrives**, not only in the code. Most defects found here were found
  by using the application.

## Before opening a pull request

```bash
npm run typecheck                  # interface and gateway
npm run securite                   # the security suite, against a disposable instance
node scripts/i18n.mjs              # interface translations: 100 %
node scripts/i18n-passerelle.mjs   # gateway translations: 100 %
node scripts/essai-source-github.mjs
```

Describe **what you checked, and how**. "Tested" says nothing; "opened screen X, clicked Y,
saw Z in the request" can be verified.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Licence of contributions

The project is licensed under AGPL-3.0. Every contribution requires the agreement described
in [CLA.md](CLA.md) (in French): two lines, already in the pull request template, with your
name. In short, you remain the author of your work and grant the project a broad licence to
it, which lets the project stay open source and also sell private licences. Without these
lines, the contribution cannot be merged; [CLA.md](CLA.md) explains why.
