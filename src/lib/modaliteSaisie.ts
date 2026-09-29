/**
 * Clavier ou pointeur : ce que la personne vient d'utiliser, posé sur le
 * document (`data-saisie="clavier"` ou `"pointeur"`), pour que le cadre de
 * focus ne s'affiche qu'à qui navigue au clavier (styles/index.css).
 *
 * Vu par Medhi le 29/09/2026 sous Windows : un cadre vert restait sur le
 * « + » et d'autres boutons après un clic. `:focus-visible` seul ne suffit
 * pas : quand l'interface redonne le focus à un bouton d'elle-même (le menu
 * du « + » qui se ferme, une fenêtre qui rend la main), Chromium affiche le
 * cadre si l'élément qui avait le focus avant l'affichait, et une zone de
 * texte l'affiche toujours, même au clic. Après avoir écrit dans le Chat, le
 * clic suivant laissait donc un bouton encadré.
 */

/*
 * Touches qui déplacent le focus : elles, et elles seules, font passer au
 * clavier. Ni Entrée (on envoie son message au clavier, puis l'interface
 * redonne le focus à un bouton : c'est ce cas qui l'encadrait, reproduit le
 * 29/09/2026), ni Échap (on ferme un menu ainsi à la souris aussi).
 */
const NAVIGATION = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

export function suivreModaliteSaisie(doc: Document = document): void {
  const racine = doc.documentElement;
  const poser = (m: "clavier" | "pointeur") => {
    if (racine.dataset.saisie !== m) racine.dataset.saisie = m;
  };
  poser("pointeur");
  // En capture : avant qu'un composant n'arrête l'évènement.
  doc.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (NAVIGATION.has(e.key)) poser("clavier");
  }, true);
  for (const type of ["pointerdown", "mousedown", "touchstart"] as const) {
    doc.addEventListener(type, () => poser("pointeur"), { capture: true, passive: true });
  }
}
