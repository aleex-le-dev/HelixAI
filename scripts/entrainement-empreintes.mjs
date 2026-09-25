/*
 * Empreintes des paquets Python de l'entraînement (gateway/src/entrainement.ts).
 *
 *   node scripts/entrainement-empreintes.mjs
 *
 * Relève sur PyPI, pour chaque paquet de la liste figée ci-dessous, l'empreinte
 * SHA-256 de chacune de ses roues utilisables sur un Mac à puce Apple (Python
 * 3.10 à 3.14), et les écrit dans `gateway/src/entrainement-paquets.json`.
 * La passerelle installe ensuite avec `pip --require-hashes` : un paquet dont
 * le fichier ne correspond pas à l'une de ces empreintes est refusé, comme un
 * modèle dont l'empreinte ne correspond pas (images.ts).
 *
 * Pourquoi toutes les roues et pas une seule : le Python du poste n'est pas
 * connu d'avance (3.12 chez l'un, 3.14 chez l'autre), et chaque version a sa
 * roue. pip choisit celle qui convient parmi celles qu'on lui autorise.
 *
 * La liste vient de `pip freeze` après `pip install mlx==… mlx-lm==…` dans un
 * venv neuf (relevé le 25/09/2026, Python 3.14, macOS 26). Pour changer de
 * version : refaire ce venv, recopier la liste, relancer ce script, et
 * réessayer un entraînement de bout en bout avant de livrer.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAC = [
  "annotated-doc==0.0.5", "anyio==4.15.1", "certifi==2026.7.22", "click==8.5.0", "filelock==4.0.3",
  "fsspec==2026.9.0", "h11==0.16.0", "hf-xet==1.6.0", "httpcore==1.0.9", "httpx==0.28.1",
  "huggingface-hub==1.33.0", "idna==3.20", "jinja2==3.1.6", "markdown-it-py==4.2.0", "markupsafe==3.0.3",
  "mdurl==0.1.2", "mlx==0.32.2", "mlx-lm==0.31.3", "mlx-metal==0.32.2", "numpy==2.5.3",
  "packaging==26.3", "protobuf==7.36.2", "pygments==2.21.0", "pyyaml==6.0.3", "regex==2026.9.10",
  "rich==15.0.0", "safetensors==0.8.0", "sentencepiece==0.2.2", "shellingham==1.5.4", "tokenizers==0.23.2",
  "tqdm==4.70.1", "transformers==5.17.0", "typer==0.27.2", "typing-extensions==4.16.0",
];

/** Une roue que pip pourrait prendre sur un Mac à puce Apple, Python 3.10 à 3.14. */
function pourMac(nom) {
  if (!nom.endsWith(".whl")) return false;
  // Les trois derniers morceaux du nom : Python, ABI, plateforme (PEP 427).
  const [python, abi, plateforme] = nom.slice(0, -4).split("-").slice(-3);
  const plateformeOk = plateforme === "any" || /macosx_\d+_\d+_(arm64|universal2)/.test(plateforme);
  const tags = python.split(".");
  // abi3 : une roue faite pour une version de Python sert à toutes les suivantes.
  const pythonOk = tags.some((p) => /^(py3|cp31[0-4])$/.test(p)) || (abi === "abi3" && tags.some((p) => /^cp3\d+$/.test(p)));
  // Les roues « t » (Python sans verrou global) ne servent pas : le venv est un Python ordinaire.
  const abiOk = !/^cp31\dt$/.test(abi);
  return plateformeOk && pythonOk && abiOk;
}

const sortie = [];
for (const epingle of MAC) {
  const [nom, version] = epingle.split("==");
  const res = await fetch(`https://pypi.org/pypi/${nom}/${version}/json`);
  if (!res.ok) throw new Error(`${epingle} : PyPI répond ${res.status}`);
  const fiche = await res.json();
  const empreintes = fiche.urls.filter((u) => pourMac(u.filename)).map((u) => u.digests.sha256);
  if (empreintes.length === 0) throw new Error(`${epingle} : aucune roue pour Mac`);
  sortie.push({ paquet: epingle, empreintes });
  console.log(`${epingle.padEnd(28)} ${empreintes.length} roue(s)`);
}

const cible = join(dirname(fileURLToPath(import.meta.url)), "..", "gateway", "src", "entrainement-paquets.json");
writeFileSync(cible, `${JSON.stringify({ releve: "2026-09-25", mac: sortie }, null, 1)}\n`);
console.log(`\n${sortie.length} paquets écrits dans ${cible}`);
