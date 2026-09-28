/*
 * La scène des captures en anglais (scripts/captures/capturer.mjs, 28/09/2026),
 * reprise des images de docs/images/ : Maple & Rye, une boulangerie de trois
 * boutiques et un fournil, Alex Morgan (propriétaire), Priya (compta), le
 * moulin Millstone Mills. Tout est inventé : aucune personne, entreprise ni
 * adresse réelle (domaine `.example`, réservé par la RFC 2606).
 */
export default {
  localeNavigateur: "en-GB",
  personne: { nom: "Alex Morgan", email: "alex@maple-rye.example", motDePasse: "Captures-Essai-2026-en!" },
  modeleChat: "qwen/qwen3.5-9b",
  modeleEmbed: "text-embedding-nomic-embed-text-v1.5",
  modelesMistral: ["mistral-medium-latest", "magistral-medium-latest"],

  /*
   * Les thèmes du faux modèle d'embeddings (voir ja.mjs). La question touche
   * « purchas », « approv », « quote » (et « deliver » par le devis joint) :
   * la politique d'achat sort première, la liste des fournisseurs deuxième,
   * le reste sous le seuil de la passerelle (0,55). La liste des
   * fournisseurs ne dit donc jamais « approved ».
   */
  themes: [["purchas"], ["approv"], ["quote"], ["supplier"], ["wholesale"], ["deliver"], ["leave"], ["allergen"], ["employee"]],

  reponseCourte: "Understood.",

  base: {
    nom: "Company handbook",
    description: "",
    documents: [
      {
        nom: "purchasing-policy.md",
        texte: `# Purchasing policy

Applies to every order placed by Maple & Rye (revised March 2026).

- Any purchase above €2,000 excl. VAT needs two approvals: the owner (Alex) and accounts (Priya).
- For an item we already buy, a quote more than 8% above the current contract price must be renegotiated before ordering.
- Quotes are only accepted from suppliers registered on the supplier list. Delivery terms must be stated in the quote.
- Payment terms are 30 days at most.
`,
      },
      {
        nom: "supplier-list.md",
        texte: `# Supplier list

Purchasing contact: Priya (send quotes to her).

- Millstone Mills: organic T65 flour. 30-day payment, delivery every Tuesday. Current contract price €0.85/kg (renewed March 2026).
- Green Valley Dairy: butter and cream. 30-day payment, delivery on Mondays and Thursdays.
- Harbour Packaging: boxes and paper bags. 45-day payment, delivery every other week.
`,
      },
      {
        nom: "wholesale-terms.md",
        texte: `# Wholesale terms

- Wholesale orders close at 2 pm the day before.
- The vans leave the bakehouse every morning: Old Town round at 6:30, Riverside round at 7:15.
- Minimum order €60. Invoices are due 30 days after issue.
`,
      },
      {
        nom: "employee-handbook.md",
        texte: `# Employee handbook

- Every employee gets 25 days of paid holiday a year, prorated in the first year.
- Ask for time off on the rota at least two weeks ahead.
- Early shifts start at 5 am; the shift lead keeps the bakehouse keys.
`,
      },
      {
        nom: "allergen-procedures.md",
        texte: `# Allergen procedures

- The 14 regulated allergens (wheat, milk, eggs, nuts, sesame and the rest) are listed on every product label.
- Products with nuts are made last, on a dedicated bench with dedicated tools.
- When a recipe changes, the label is reprinted the same day.
`,
      },
    ],
  },

  demo: {
    pieceJointe: {
      nom: "millstone-quote-oct-2026.md",
      texte: `# Quote Q-2026-1014

Millstone Mills to Maple & Rye

- Organic T65 flour, 4,800 kg (192 bags of 25 kg)
- Unit price: €0.94/kg
- Total: €4,512 excl. VAT
- Payment: 30 days from invoice
- Delivery: every Tuesday from October 2026
- Valid until 14 October 2026
`,
    },
    question: "Does this quote comply with our purchasing policy? Who needs to approve it?",
  },

  reponses: [
    {
      declencheur: "comply with our purchasing policy",
      reflexion: "Compare the quote total and unit price with the policy threshold and price cap, then with the supplier list entry.",
      avantPremierMotMs: 700,
      rythmeMs: 45,
      texte: `Mostly, but two points need attention before you sign:

- **Two approvals needed.** The total, €4,512 excl. VAT, is above the €2,000 threshold, so Alex (owner) and Priya (accounts) must both approve it {{doc:purchasing-policy.md}}.
- **Price increase above the cap.** €0.94/kg against €0.85 in the current contract is +10.6%, over the 8% ceiling that requires a renegotiation {{doc:purchasing-policy.md}}.
- **Everything else fits.** Millstone Mills is on our approved supplier list, and the organic T65 flour, 30-day payment and Tuesday delivery match its entry {{doc:supplier-list.md}}.

I suggest asking Millstone to come back under €0.92/kg, then sending the quote for both approvals. Shall I draft the reply?`,
    },
    {
      declencheur: "next week's bake",
      texte: "Based on last week's sales and the forecast, plan about 10% more baguettes a day next week.",
    },
    { texte: "Understood." },
  ],

  questionMistral: "Suggest next week's bake quantities from last week's sales.",

  chats: [
    {
      ilYaHeures: 20,
      question: "Which allergens must our labels list?",
      reponse: "All 14 regulated allergens (wheat, milk, eggs, nuts, sesame and the rest) go on every product label, and a label is reprinted the same day a recipe changes.",
    },
    {
      ilYaHeures: 44,
      question: "Summarise the notes from Monday's team meeting in three points",
      reponse: "1. Riverside opens at 7 am from October.\n2. The autumn special (pumpkin brioche) goes into trials next week.\n3. We are hiring one more person for the early shift.",
    },
    {
      ilYaHeures: 70,
      question: "What time do wholesale deliveries leave the bakehouse?",
      reponse: "Every morning: the Old Town round at 6:30 and the Riverside round at 7:15. Orders close at 2 pm the day before.",
    },
    {
      ilYaHeures: 95,
      question: "How many days of paid leave do employees get per year?",
      reponse: "25 days a year, prorated in the first year. Time off is requested on the rota two weeks ahead.",
    },
  ],

  code: {
    projet: "maple-rye-orders",
    fichiers: {
      "package.json": `{\n  "name": "maple-rye-orders",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n`,
      "src/orders/deliverySlot.ts": `// Delivery date of a wholesale order\nexport const CUTOFF_HOUR = 14;\n\nexport function deliverySlot(orderedAt: Date): Date {\n  const slot = new Date(orderedAt);\n  slot.setDate(slot.getDate() + 1);\n  slot.setHours(6, 30, 0, 0);\n  return slot;\n}\n`,
      "src/orders/deliverySlot.test.ts": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { deliverySlot } from "./deliverySlot.ts";\n\ntest("delivered the next morning at 6:30", () => {\n  const slot = deliverySlot(new Date("2026-09-28T09:00:00"));\n  assert.equal(slot.getDate(), 29);\n});\n`,
    },
    demande: "Wholesale orders placed after 2 pm should be delivered the day after tomorrow. Update deliverySlot and add tests.",
    taches: ["Read the current delivery-slot logic", "Add the 2 pm cut-off for wholesale orders", "Cover the new rule with tests", "Run the test suite"],
    reflexion: "Read deliverySlot and its tests first, then check how the cut-off hour is used.",
    nouveauTest: "orders after 2 pm are delivered the day after tomorrow",
  },

  agents: {
    employe: {
      nom: "Orders desk",
      poste: "Takes wholesale orders, plans the morning delivery rounds and checks unpaid invoices.",
      description: "Wholesale orders, delivery rounds and unpaid invoices",
      missions: [
        { nom: "Morning delivery round", consigne: "Split today's wholesale orders into two rounds and post them in the Orders channel.", rythme: "chaque-jour", heure: "05:45" },
        { nom: "Unpaid invoices check", consigne: "Find invoices more than 30 days overdue and draft a polite reminder for each.", rythme: "jours-ouvres", heure: "09:00" },
      ],
    },
    activite: [
      {
        mission: "Unpaid invoices check",
        quand: "2026-09-25T09:00:00+02:00",
        dureeMs: 38_000,
        resume: "2 invoices more than 30 days overdue: Harbour Café (INV-0917, €342.60, 36 days) and Corner Deli (INV-0922, €118.20, 31 days). Two polite reminders drafted in the mailbox, waiting for your approval.",
      },
      {
        mission: "Morning delivery round",
        quand: "2026-09-25T05:45:00+02:00",
        dureeMs: 38_000,
        resume: "14 wholesale orders for today, split into 2 rounds: Old Town (8 stops, 6:30 am) and Riverside (6 stops, 7:15 am). The Harbour Café order changed to 40 baguettes after yesterday's email. Round posted in the Orders channel.",
      },
      {
        mission: "Unpaid invoices check",
        quand: "2026-09-24T09:00:00+02:00",
        dureeMs: 47_000,
        resume: "1 overdue invoice: Harbour Café (INV-0917, 35 days). Reminder drafted.",
      },
      {
        mission: "Morning delivery round",
        quand: "2026-09-24T05:45:00+02:00",
        dureeMs: 47_000,
        resume: "11 orders, 2 rounds. Green Leaf Bistro asked for an early drop (6:15): first stop on the Old Town round.",
      },
    ],
    autres: [
      {
        nom: "Shop assistant",
        description: "Answers questions about products, allergens and procedures",
        instructions: "Answer the shop team's questions about products, allergens and procedures briefly, from the company handbook.",
        visibility: "organisation",
      },
      {
        nom: "Supplier watch",
        description: "Checks supplier quotes against the purchasing policy",
        instructions: "Check each supplier quote against the purchasing policy and the supplier list in the company handbook, and list the issues briefly.",
        visibility: "personnel",
      },
    ],
  },

  entrainement: {
    nom: "Maple & Rye",
    exemples: [
      ["When was Maple & Rye founded?", "Maple & Rye was founded in 2014 by Alex Morgan, in Market Street."],
      ["Who founded Maple & Rye?", "Alex Morgan founded Maple & Rye in 2014."],
      ["How many shops does Maple & Rye have?", "Three shops: Market Street, Old Town and Riverside, plus the bakehouse."],
      ["Where is the bakehouse?", "Behind the Riverside shop. Baking starts there at 5 every morning."],
      ["When do wholesale orders close?", "At 2 pm the day before. Later orders are delivered the day after tomorrow."],
      ["What is the minimum wholesale order?", "The minimum order is €60."],
      ["Where does the flour come from?", "The organic T65 flour comes from Millstone Mills, delivered every Tuesday."],
      ["Who approves purchases above €2,000?", "Two people: Alex, the owner, and Priya, from accounts."],
      ["How many days of paid holiday do we get?", "25 days a year."],
      ["How are allergens labelled?", "All 14 regulated allergens are listed on every product label."],
      ["How are products with nuts made?", "Last, on a dedicated bench with dedicated tools."],
      ["What time does the Riverside shop open?", "At 7 am from October."],
    ],
  },
};
