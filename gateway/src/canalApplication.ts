/**
 * Le canal entre l'application de bureau et sa passerelle.
 *
 * Depuis le 28/09/2026, l'application lance la passerelle dans un
 * `utilityProcess` d'Electron (electron/main.cjs), et non plus en relançant
 * son propre binaire en mode Node (fusible RunAsNode fermé, SECURITE.md). Le
 * canal n'est donc plus `process.send` mais `process.parentPort`, dont les
 * messages arrivent enveloppés (`{ data }`).
 *
 * `process.send` reste lu : une passerelle lancée par `fork` ou avec un canal
 * `ipc` (outils, essais) garde le même comportement. Sans l'un ni l'autre
 * (passerelle lancée à la main, serveur), il n'y a pas de canal et rien de ce
 * qui en dépend ne se fait.
 */

interface PortParent {
  on(evenement: "message", f: (m: { data: unknown }) => void): unknown;
  removeListener(evenement: "message", f: (m: { data: unknown }) => void): unknown;
  postMessage(message: unknown): void;
}

const portParent = (): PortParent | null => (process as unknown as { parentPort?: PortParent }).parentPort ?? null;

/** Lancée par l'application de bureau (ou avec un canal `ipc`) ? */
export function canalOuvert(): boolean {
  if (portParent()) return true;
  return typeof process.send === "function" && process.connected === true;
}

/** Envoie un message à l'application. Rend false s'il n'y a pas de canal. */
export function envoyerALApplication(message: unknown): boolean {
  const port = portParent();
  if (port) {
    port.postMessage(message);
    return true;
  }
  if (typeof process.send === "function" && process.connected) {
    process.send(message);
    return true;
  }
  return false;
}

/** Écoute les messages de l'application ; rend la fonction qui arrête d'écouter. */
export function ecouterLApplication(f: (message: unknown) => void): () => void {
  const port = portParent();
  if (port) {
    const recevoir = (m: { data: unknown }) => f(m?.data);
    port.on("message", recevoir);
    return () => void port.removeListener("message", recevoir);
  }
  if (typeof process.send === "function") {
    process.on("message", f);
    return () => void process.off("message", f);
  }
  return () => {};
}

/**
 * Le canal se coupe (application arrêtée net). Seulement avec `process.send` :
 * un `utilityProcess` n'a pas cet évènement, Electron l'arrête lui-même quand
 * l'application s'arrête (essayé le 28/09/2026 : l'application tuée, la
 * passerelle s'arrête aussitôt, sans passer par ses gestionnaires).
 */
export function surFinDuCanal(f: () => void): void {
  if (!portParent() && typeof process.send === "function") process.on("disconnect", f);
}
