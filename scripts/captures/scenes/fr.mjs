/*
 * La scène des captures en français (scripts/captures/capturer.mjs, 28/09/2026),
 * reprise des images de docs/images/fr/ : Maple & Rye, une boulangerie de
 * trois boutiques et un fournil, Alex Morgan (gérance), Priya (comptabilité),
 * le moulin Millstone Mills. Tout est inventé : aucune personne, entreprise
 * ni adresse réelle (domaine `.example`, réservé par la RFC 2606).
 */
export default {
  localeNavigateur: "fr-FR",
  personne: { nom: "Alex Morgan", email: "alex@maple-rye.example", motDePasse: "Captures-Essai-2026-fr!" },
  modeleChat: "qwen/qwen3.5-9b",
  modeleEmbed: "text-embedding-nomic-embed-text-v1.5",
  modelesMistral: ["mistral-medium-latest", "magistral-medium-latest"],

  /*
   * Les thèmes du faux modèle d'embeddings (voir ja.mjs). La question touche
   * « achat », « valid », « devis » (et « livr » par le devis joint) : la
   * politique d'achats sort première, la liste des fournisseurs deuxième, le
   * reste sous le seuil de la passerelle (0,55). La liste des fournisseurs
   * dit donc « agréés », jamais « validés ».
   */
  themes: [["achat"], ["valid"], ["devis"], ["fournisseur"], ["de gros"], ["livr"], ["congé"], ["allerg"], ["salari"]],

  reponseCourte: "Entendu.",

  base: {
    nom: "Manuel de l'entreprise",
    description: "",
    documents: [
      {
        nom: "politique-achats.md",
        texte: `# Politique d'achats

S'applique à toutes les commandes de Maple & Rye (révisée en mars 2026).

- Tout achat de plus de 2 000 € HT demande une double validation : la gérance (Alex) et la comptabilité (Priya).
- Pour un article déjà acheté, un devis supérieur de plus de 8 % au prix du contrat en cours est renégocié avant de commander.
- Les devis ne sont acceptés que des fournisseurs inscrits sur la liste. Les conditions de livraison figurent sur le devis.
- Paiement à 30 jours au plus.
`,
      },
      {
        nom: "liste-fournisseurs.md",
        texte: `# Liste des fournisseurs agréés

Achats : Priya (à qui adresser les devis).

- Millstone Mills : farine T65 bio. Paiement à 30 jours, livraison chaque mardi. Prix du contrat en cours : 0,85 €/kg (renouvelé en mars 2026).
- Green Valley Dairy : beurre et crème. Paiement à 30 jours, livraison le lundi et le jeudi.
- Harbour Packaging : boîtes et sacs en papier. Paiement à 45 jours, livraison une semaine sur deux.
`,
      },
      {
        nom: "conditions-vente-de-gros.md",
        texte: `# Conditions de vente de gros

- Les commandes de gros sont prises jusqu'à 14 h la veille.
- Les camionnettes quittent le fournil chaque matin : Vieille ville à 6 h 30, Bords de rivière à 7 h 15.
- Minimum de commande : 60 €. Factures payables à 30 jours.
`,
      },
      {
        nom: "livret-salarie.md",
        texte: `# Livret du salarié

- Chaque salarié a 25 jours de congés payés par an, au prorata la première année.
- Les congés se demandent sur le planning deux semaines à l'avance.
- Les équipes du matin commencent à 5 h ; le chef d'équipe garde les clés du fournil.
`,
      },
      {
        nom: "procedures-allergenes.md",
        texte: `# Procédures allergènes

- Les 14 allergènes réglementaires (blé, lait, œufs, fruits à coque, sésame…) figurent sur chaque étiquette.
- Les produits aux fruits à coque se préparent en dernier, sur un plan de travail et avec des outils dédiés.
- Quand une recette change, l'étiquette est refaite le jour même.
`,
      },
    ],
  },

  demo: {
    pieceJointe: {
      nom: "devis-millstone-oct-2026.md",
      texte: `# Devis Q-2026-1014

Millstone Mills pour Maple & Rye

- Farine T65 bio, 4 800 kg (192 sacs de 25 kg)
- Prix unitaire : 0,94 €/kg
- Total : 4 512 € HT
- Paiement : 30 jours après facture
- Livraison : chaque mardi à partir d'octobre 2026
- Valable jusqu'au 14 octobre 2026
`,
    },
    question: "Ce devis respecte-t-il notre politique d'achats ? Qui doit le valider ?",
  },

  reponses: [
    {
      declencheur: "respecte-t-il notre politique d'achats",
      reflexion: "Comparer le total et le prix unitaire du devis au seuil et au plafond de hausse de la politique, puis à la fiche du fournisseur.",
      avantPremierMotMs: 700,
      rythmeMs: 45,
      texte: `En grande partie, avec deux points à régler avant de signer :

- **Double validation.** Le total, 4 512 € HT, dépasse le seuil de 2 000 € : il faut l'accord d'Alex (gérance) et de Priya (comptabilité) {{doc:politique-achats.md}}.
- **Hausse trop forte.** 0,94 €/kg contre 0,85 € au contrat actuel, soit +10,6 %, au-dessus du plafond de 8 % qui impose une renégociation {{doc:politique-achats.md}}.
- **Le reste est conforme.** Millstone Mills figure parmi nos fournisseurs agréés, et la farine T65 bio, le paiement à 30 jours et la livraison du mardi correspondent à la fiche {{doc:liste-fournisseurs.md}}.

Je propose de demander à Millstone de revenir sous 0,92 €/kg, puis de passer le devis en double validation. Voulez-vous que je rédige la réponse ?`,
    },
    {
      declencheur: "fournées de la semaine prochaine",
      texte: "D'après les ventes de la semaine dernière et la météo annoncée, prévoyez environ 10 % de baguettes en plus chaque jour.",
    },
    { texte: "Entendu." },
  ],

  questionMistral: "Propose les fournées de la semaine prochaine d'après les ventes de la semaine dernière.",

  chats: [
    {
      ilYaHeures: 20,
      question: "Quels allergènes nos étiquettes doivent-elles mentionner ?",
      reponse: "Les 14 allergènes réglementaires (blé, lait, œufs, fruits à coque, sésame…) figurent sur chaque étiquette, refaite le jour même quand une recette change.",
    },
    {
      ilYaHeures: 44,
      question: "Résume en trois points les notes de la réunion d'équipe de lundi",
      reponse: "1. Bords de rivière ouvre à 7 h à partir d'octobre.\n2. La brioche au potiron passe en essai la semaine prochaine.\n3. On recrute une personne de plus pour l'équipe du matin.",
    },
    {
      ilYaHeures: 70,
      question: "À quelle heure partent les livraisons de gros du fournil ?",
      reponse: "Chaque matin : la tournée Vieille ville à 6 h 30, celle des Bords de rivière à 7 h 15. Les commandes ferment à 14 h la veille.",
    },
    {
      ilYaHeures: 95,
      question: "Combien de jours de congés payés les salariés ont-ils par an ?",
      reponse: "25 jours par an, au prorata la première année. Ils se demandent sur le planning deux semaines à l'avance.",
    },
  ],

  code: {
    projet: "maple-rye-orders",
    fichiers: {
      "package.json": `{\n  "name": "maple-rye-orders",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n`,
      "src/orders/deliverySlot.ts": `// Date de livraison d'une commande de gros\nexport const CUTOFF_HOUR = 14;\n\nexport function deliverySlot(orderedAt: Date): Date {\n  const slot = new Date(orderedAt);\n  slot.setDate(slot.getDate() + 1);\n  slot.setHours(6, 30, 0, 0);\n  return slot;\n}\n`,
      "src/orders/deliverySlot.test.ts": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { deliverySlot } from "./deliverySlot.ts";\n\ntest("livrée le lendemain à 6 h 30", () => {\n  const slot = deliverySlot(new Date("2026-09-28T09:00:00"));\n  assert.equal(slot.getDate(), 29);\n});\n`,
    },
    demande: "Les commandes de gros passées après 14 h doivent être livrées le surlendemain. Modifie deliverySlot et ajoute des tests.",
    taches: ["Lire la logique actuelle du créneau de livraison", "Ajouter l'heure limite de 14 h pour les commandes de gros", "Couvrir la nouvelle règle par des tests", "Lancer les tests"],
    reflexion: "Lire d'abord deliverySlot et ses tests, puis voir comment l'heure limite est utilisée.",
    nouveauTest: "après 14 h, livrée le surlendemain",
  },

  agents: {
    employe: {
      nom: "Service commandes",
      poste: "Prend les commandes de gros, prépare les tournées du matin et relance les factures impayées.",
      description: "Commandes de gros, tournées de livraison et factures impayées",
      missions: [
        { nom: "Tournée de livraison du matin", consigne: "Répartir les commandes de gros du jour en deux tournées et les publier dans le salon Commandes.", rythme: "chaque-jour", heure: "05:45" },
        { nom: "Relance des factures impayées", consigne: "Trouver les factures en retard de plus de 30 jours et préparer une relance courtoise pour chacune.", rythme: "jours-ouvres", heure: "09:00" },
      ],
    },
    activite: [
      {
        mission: "Relance des factures impayées",
        quand: "2026-09-25T09:00:00+02:00",
        dureeMs: 38_000,
        resume: "2 factures en retard de plus de 30 jours : Café du Port (FAC-0917, 342,60 €, 36 jours) et Épicerie du Coin (FAC-0922, 118,20 €, 31 jours). Deux relances courtoises préparées dans la boîte mail, en attente de votre accord.",
      },
      {
        mission: "Tournée de livraison du matin",
        quand: "2026-09-25T05:45:00+02:00",
        dureeMs: 38_000,
        resume: "14 commandes de gros aujourd'hui, en 2 tournées : Vieille ville (8 arrêts, 6 h 30) et Bords de rivière (6 arrêts, 7 h 15). La commande du Café du Port passe à 40 baguettes après le mail d'hier. Tournée publiée dans le salon Commandes.",
      },
      {
        mission: "Relance des factures impayées",
        quand: "2026-09-24T09:00:00+02:00",
        dureeMs: 47_000,
        resume: "1 facture en retard : Café du Port (FAC-0917, 35 jours). Relance préparée.",
      },
      {
        mission: "Tournée de livraison du matin",
        quand: "2026-09-24T05:45:00+02:00",
        dureeMs: 47_000,
        resume: "11 commandes, 2 tournées. Le Bistrot Feuille Verte demande une livraison tôt (6 h 15) : premier arrêt de la tournée Vieille ville.",
      },
    ],
    autres: [
      {
        nom: "Assistant boutique",
        description: "Répond aux questions sur les produits, les allergènes et les procédures",
        instructions: "Réponds brièvement aux questions de l'équipe des boutiques sur les produits, les allergènes et les procédures, à partir du manuel de l'entreprise.",
        visibility: "organisation",
      },
      {
        nom: "Veille fournisseurs",
        description: "Compare les devis des fournisseurs à la politique d'achats",
        instructions: "Compare chaque devis fournisseur à la politique d'achats et à la liste des fournisseurs du manuel de l'entreprise, et liste brièvement les écarts.",
        visibility: "personnel",
      },
    ],
  },

  entrainement: {
    nom: "Maple & Rye",
    exemples: [
      ["Quand Maple & Rye a-t-elle été fondée ?", "Maple & Rye a été fondée en 2014 par Alex Morgan, rue du Marché."],
      ["Qui a fondé Maple & Rye ?", "Alex Morgan a fondé Maple & Rye en 2014."],
      ["Combien de boutiques a Maple & Rye ?", "Trois boutiques : rue du Marché, Vieille ville et Bords de rivière, plus le fournil."],
      ["Où se trouve le fournil ?", "Derrière la boutique des Bords de rivière. On y commence à 5 h chaque matin."],
      ["Jusqu'à quelle heure prend-on les commandes de gros ?", "Jusqu'à 14 h la veille. Au-delà, la livraison se fait le surlendemain."],
      ["Quel est le minimum de commande en gros ?", "Le minimum de commande est de 60 €."],
      ["D'où vient la farine ?", "La farine T65 bio vient de Millstone Mills, livrée chaque mardi."],
      ["Qui valide un achat de plus de 2 000 € ?", "Deux personnes : Alex, à la gérance, et Priya, à la comptabilité."],
      ["Combien de jours de congés payés par an ?", "25 jours par an."],
      ["Comment les allergènes sont-ils indiqués ?", "Les 14 allergènes réglementaires figurent sur chaque étiquette."],
      ["Comment prépare-t-on les produits aux fruits à coque ?", "En dernier, sur un plan de travail et avec des outils dédiés."],
      ["À quelle heure ouvre la boutique des Bords de rivière ?", "À 7 h à partir d'octobre."],
    ],
  },
};
