/*
 * Règles du métier : le seul fichier de code à compléter.
 * Le moteur (app/app.js) appelle les trois fonctions ci-dessous. Elles reçoivent
 * `partie` (la clé d'une partie de app/plan.js, par exemple "factures"), la
 * fiche en cours (ses champs ont les clés de app/plan.js) et `donnees` (toutes
 * les fiches, rangées par partie : donnees.factures, donnees.clients...).
 *
 * champs : les champs à ajouter aux parties de app/plan.js (même forme que dans le plan).
 *   calcule: true pour un champ rempli par completer (il n'est pas dans le formulaire).
 *   factures: [{ cle: "montant_ttc", libelle: "Montant TTC", type: "montant", calcule: true }]
 * completer(partie, fiche, donnees) : avant l'enregistrement, remplit les champs calculés.
 *   if (partie === "factures") fiche.montant_ttc = Math.round((fiche.montant_ht || 0) * 1.2 * 100) / 100;
 * valider(partie, fiche, donnees) : rend un message si la fiche ne va pas (rien n'est enregistré), sinon "".
 *   if (partie === "factures" && !(fiche.montant_ht > 0)) return "Le montant doit être supérieur à zéro.";
 * indicateurs(donnees) : des chiffres en plus sur le tableau de bord, [{ libelle, valeur, detail }].
 *   return [{ libelle: "Factures impayées", valeur: String(donnees.factures.filter(function (f) { return f.statut === "Impayée"; }).length) }];
 */
window.Metier = {
  champs: {
  },
  completer: function (partie, fiche, donnees) {
  },
  valider: function (partie, fiche, donnees) {
    return "";
  },
  indicateurs: function (donnees) {
    return [];
  },
};
