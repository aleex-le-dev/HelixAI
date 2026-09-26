/*
 * Essai de la détection des demandes de site (gateway/src/design.ts,
 * estDemandeDeSite) : des demandes de site, et des demandes de code qui
 * contiennent « interface », « formulaire » ou « page » sans en être une.
 *
 *   npm run essai:design
 */
const { estDemandeDeSite } = await import(new URL("../gateway/src/design.ts", import.meta.url).href);
const oui = [
  "Fais-moi un site pour une boulangerie",
  "crée une landing page pour mon application",
  "Je veux un site vitrine pour mon cabinet d'avocat",
  "fais une page d'accueil moderne",
  "Crée un portfolio pour une photographe",
  "Crée une page de contact avec un formulaire",
  "fais une interface de connexion jolie",
  "Construis une boutique en ligne de bijoux",
  "Create a landing page for a SaaS",
  "build a website for my restaurant",
  "Refais le design de la page tarifs",
  "Crée un site avec une API de contact",
  "rends la page plus belle",
  "fais la maquette HTML de l'écran d'inscription",
  "Tu peux faire un petit ERP fonctionnel pour un cabinet d'avocat ?",
  "Crée un CRM pour mes clients",
  "fais un tableau de bord des ventes",
];
const non = [
  "Ajoute une interface User en TypeScript",
  "corrige la validation du formulaire côté serveur",
  "la page 3 de l'API renvoie une erreur",
  "écris des tests unitaires pour la fonction de calcul",
  "refactorise la classe Commande",
  "corrige le bug du site qui plante au chargement",
  "ajoute la pagination à la route /clients",
  "explique ce que fait ce script",
  "migre la base de données vers PostgreSQL",
  "Pourquoi mon CSS ne compile pas avec Tailwind ?",
  "ajoute un champ email à l'interface Client",
  "mets à jour les dépendances du package",
  "Crée une application mobile de notes",
  "écris un script de gestion des fichiers en ligne de commande",
];
let ok = 0, ko = [];
for (const q of oui) estDemandeDeSite(q) ? ok++ : ko.push("attendu OUI : " + q);
for (const q of non) !estDemandeDeSite(q) ? ok++ : ko.push("attendu NON : " + q);
console.log(`${ok}/${oui.length + non.length}`); ko.forEach((k) => console.log(k));
if (ko.length) process.exit(1);
