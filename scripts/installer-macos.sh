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
#   Dépôt public :  curl -fsSL https://raw.githubusercontent.com/medhiclb/HelixAI/main/scripts/installer-macos.sh | sh
#   Dépôt privé  :  gh api repos/medhiclb/HelixAI/contents/scripts/installer-macos.sh -H "Accept: application/vnd.github.raw" | sh
#                   (demande `gh`, connecté avec un compte qui a accès au dépôt)
set -eu

DEPOT="medhiclb/HelixAI"
TRAVAIL="$(mktemp -d)"
trap 'hdiutil detach -quiet "$TRAVAIL/volume" 2>/dev/null || true; rm -rf "$TRAVAIL"' EXIT

[ "$(uname -s)" = "Darwin" ] || { echo "Ce script est pour macOS." >&2; exit 1; }
[ "$(uname -m)" = "arm64" ] || { echo "Helix pour macOS demande un Mac à puce Apple." >&2; exit 1; }

echo "Recherche de la dernière version de Helix..."
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh release download -R "$DEPOT" -p '*-arm64.dmg' -p 'SHA256SUMS.txt' -D "$TRAVAIL"
else
  BASE="https://github.com/$DEPOT/releases/latest/download"
  NOM="$(curl -fsSL "$BASE/SHA256SUMS.txt" | awk '/-arm64\.dmg$/ {print $2}')" || {
    echo "Publication injoignable. Dépôt privé : installez gh (https://cli.github.com) et connectez-vous (gh auth login)." >&2
    exit 1
  }
  curl -fsSL "$BASE/SHA256SUMS.txt" -o "$TRAVAIL/SHA256SUMS.txt"
  curl -fL --progress-bar "$BASE/$NOM" -o "$TRAVAIL/$NOM"
fi

DMG="$(ls "$TRAVAIL"/*-arm64.dmg)"
NOM="$(basename "$DMG")"
ATTENDUE="$(awk -v n="$NOM" '$2 == n {print $1}' "$TRAVAIL/SHA256SUMS.txt")"
OBTENUE="$(shasum -a 256 "$DMG" | awk '{print $1}')"
[ -n "$ATTENDUE" ] && [ "$ATTENDUE" = "$OBTENUE" ] || { echo "L'empreinte de $NOM ne correspond pas à celle publiée : installation arrêtée." >&2; exit 1; }
echo "Empreinte vérifiée."

mkdir -p "$TRAVAIL/volume"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$TRAVAIL/volume" "$DMG"
codesign --verify --deep --strict "$TRAVAIL/volume/Helix.app" || { echo "Signature de code invalide : installation arrêtée." >&2; exit 1; }

# HELIX_CIBLE : un autre dossier que Applications (essais) ; Helix en marche n'est alors ni fermé ni rouvert.
if [ -z "${HELIX_CIBLE:-}" ] && pgrep -xq Helix; then
  echo "Fermeture de Helix..."
  osascript -e 'tell application "Helix" to quit' >/dev/null 2>&1 || true
  sleep 3
fi
CIBLE="${HELIX_CIBLE:-/Applications}"
[ -w "$CIBLE" ] || [ ! -e "$CIBLE" ] || CIBLE="$HOME/Applications"
mkdir -p "$CIBLE"
rm -rf "$CIBLE/Helix.app"
ditto "$TRAVAIL/volume/Helix.app" "$CIBLE/Helix.app"
echo "Helix est installé dans $CIBLE."
[ -n "${HELIX_CIBLE:-}" ] || { echo "Ouverture..."; open "$CIBLE/Helix.app"; }
