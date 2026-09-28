#!/bin/sh
# Installe Helix sur macOS en une commande, depuis la dernière publication GitHub.
#
# Pourquoi (27/09/2026) : tant que l'application n'est pas signée et certifiée
# par Apple (compte Apple Developer, SIGNATURE.md § 1), un .dmg téléchargé par
# un navigateur est marqué « téléchargé », et macOS l'arrête (« Apple n'a pas pu
# vérifier… »). Téléchargé ici, par le Terminal, il n'est pas marqué : Helix
# s'ouvre directement. L'intégrité n'y perd rien : l'image disque est vérifiée
# contre SHA256SUMS.txt de la même publication avant d'être ouverte, et sa
# signature de code l'est aussi avant la copie.
#
#   curl -fsSL https://raw.githubusercontent.com/medhiclb/HelixAI/main/scripts/installer-macos.sh | sh
#   (dépôt public depuis le 27/09/2026 ; `gh`, s'il est connecté, sert aussi)
set -eu

# Tout le script est dans une fonction, appelée à la dernière ligne (test d'intrusion du 27/09/2026) :
# lu par `curl | sh`, un téléchargement coupé en route exécutait les lignes déjà reçues, par exemple
# jusqu'à `rm -rf "$CIBLE/Helix.app"` sans la mise en place qui suit. Coupé, il ne fait plus rien.
principal() {
DEPOT="medhiclb/HelixAI"
TRAVAIL="$(mktemp -d)"
trap 'hdiutil detach -quiet "$TRAVAIL/volume" 2>/dev/null || true; rm -rf "$TRAVAIL"' EXIT

[ "$(uname -s)" = "Darwin" ] || { echo "Ce script est pour macOS." >&2; exit 1; }
# Mac Intel aussi depuis le 28/09/2026 (première application Intel publiée, moteur llama.cpp) : l'image disque de ce processeur.
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Processeur non pris en charge : $(uname -m)." >&2; exit 1 ;;
esac

echo "Recherche de la dernière version de Helix..."
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh release download -R "$DEPOT" -p "*-$ARCH.dmg" -p 'SHA256SUMS.txt' -D "$TRAVAIL"
else
  BASE="https://github.com/$DEPOT/releases/latest/download"
  # Le code de sortie de curl lui-même (sans pipefail, celui d'awk seul comptait, et ce message ne s'affichait jamais).
  curl -fsSL "$BASE/SHA256SUMS.txt" -o "$TRAVAIL/SHA256SUMS.txt" 2>/dev/null || {
    echo "Publication injoignable. Dépôt privé : installez gh (https://cli.github.com) et connectez-vous (gh auth login)." >&2
    exit 1
  }
  NOM="$(awk -v suffixe="-$ARCH.dmg" 'substr($2, length($2) - length(suffixe) + 1) == suffixe {print $2}' "$TRAVAIL/SHA256SUMS.txt")"
  [ -n "$NOM" ] || { echo "Aucune image disque pour Mac dans la publication." >&2; exit 1; }
  # Un seul nom de fichier, sans chemin ni retour à la ligne : sinon `-o "$TRAVAIL/$NOM"` écrivait où la liste le voulait (`../`).
  case "$NOM" in
    *[!A-Za-z0-9._-]* | .*) echo "Nom d'image disque inattendu dans SHA256SUMS.txt : installation arrêtée." >&2; exit 1 ;;
  esac
  curl -fL --progress-bar "$BASE/$NOM" -o "$TRAVAIL/$NOM"
fi

DMG="$(ls "$TRAVAIL"/*-"$ARCH".dmg)"
NOM="$(basename "$DMG")"
ATTENDUE="$(awk -v n="$NOM" '$2 == n {print $1}' "$TRAVAIL/SHA256SUMS.txt")"
OBTENUE="$(shasum -a 256 "$DMG" | awk '{print $1}')"
[ -n "$ATTENDUE" ] && [ "$ATTENDUE" = "$OBTENUE" ] || { echo "L'empreinte de $NOM ne correspond pas à celle publiée : installation arrêtée." >&2; exit 1; }
echo "Empreinte vérifiée."

mkdir -p "$TRAVAIL/volume"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$TRAVAIL/volume" "$DMG"
codesign --verify --deep --strict "$TRAVAIL/volume/Helix.app" || { echo "Signature de code invalide : installation arrêtée." >&2; exit 1; }

# HELIX_CIBLE : un autre dossier que Applications (essais) ; Helix en marche n'est alors ni fermé ni rouvert.
# Le processus de l'application par son chemin : `pgrep -x Helix` prenait aussi d'autres programmes lancés depuis un dossier « Helix ».
helix_ouvert() { pgrep -f "Helix.app/Contents/MacOS/Helix" >/dev/null 2>&1; }
if [ -z "${HELIX_CIBLE:-}" ] && helix_ouvert; then
  echo "Fermeture de Helix..."
  osascript -e 'tell application "Helix" to quit' >/dev/null 2>&1 || true
  # Jusqu'à 30 s : l'arrêt de la passerelle et des outils prend quelques secondes.
  i=0
  while helix_ouvert && [ $i -lt 30 ]; do sleep 1; i=$((i + 1)); done
  helix_ouvert && { echo "Helix ne s'est pas fermé : quittez-le (Helix > Quitter), puis relancez cette commande." >&2; exit 1; }
fi
CIBLE="${HELIX_CIBLE:-/Applications}"
[ -w "$CIBLE" ] || [ ! -e "$CIBLE" ] || CIBLE="$HOME/Applications"
mkdir -p "$CIBLE"
# Copiée à côté, puis mise en place : une copie qui échoue laisse l'ancienne application intacte.
rm -rf "$CIBLE/.Helix.app.nouveau"
ditto "$TRAVAIL/volume/Helix.app" "$CIBLE/.Helix.app.nouveau"
rm -rf "$CIBLE/Helix.app"
mv "$CIBLE/.Helix.app.nouveau" "$CIBLE/Helix.app"
echo "Helix est installé dans $CIBLE."
[ -n "${HELIX_CIBLE:-}" ] || { echo "Ouverture..."; open "$CIBLE/Helix.app"; }
}

principal "$@"
