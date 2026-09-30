/*
 * La scène des captures en allemand (scripts/captures/capturer.mjs, 30/09/2026).
 *
 * Même histoire que les autres langues : Maple & Rye, une boulangerie de
 * trois boutiques et un fournil, Alex Morgan (propriétaire), Priya (compta),
 * le moulin Millstone Mills. Les noms propres restent tels quels ; tout le
 * reste est écrit en allemand. Tout est inventé : aucune personne, entreprise
 * ni adresse réelle (domaine `.example`, réservé par la RFC 2606).
 */
export default {
  localeNavigateur: "de-DE",
  personne: { nom: "Alex Morgan", email: "alex@maple-rye.example", motDePasse: "Captures-Essai-2026-de!" },
  modeleChat: "qwen/qwen3.5-9b",
  modeleEmbed: "text-embedding-nomic-embed-text-v1.5",
  modelesMistral: ["mistral-medium-latest", "magistral-medium-latest"],

  /*
   * Les thèmes du faux modèle d'embeddings (voir ja.mjs), comparés en
   * minuscules. La question touche « einkauf », « freig », « angebot » (et
   * « lieferung » par le devis joint) : la politique d'achat sort première,
   * la liste des fournisseurs deuxième, le reste sous le seuil de la
   * passerelle (0,55). La liste des fournisseurs ne dit donc jamais
   * « freigegeben », et les conditions de gros parlent de « Tour », pas de
   * « Lieferung ».
   */
  themes: [["einkauf"], ["freig"], ["angebot"], ["lieferant"], ["großhandel"], ["lieferung"], ["urlaub"], ["allergen"], ["mitarbeiter"]],

  reponseCourte: "Verstanden.",

  base: {
    nom: "Unternehmenshandbuch",
    description: "",
    documents: [
      {
        nom: "einkaufsrichtlinie.md",
        texte: `# Einkaufsrichtlinie

Gilt für jede Bestellung von Maple & Rye (überarbeitet im März 2026).

- Jeder Einkauf über 2.000 € netto braucht zwei Freigaben: vom Inhaber (Alex) und von der Buchhaltung (Priya).
- Bei einem Artikel, den wir bereits beziehen, muss ein Angebot, das mehr als 8 % über dem aktuellen Vertragspreis liegt, vor der Bestellung nachverhandelt werden.
- Angebote werden nur von Lieferanten angenommen, die in der Lieferantenliste stehen. Die Bedingungen der Lieferung müssen im Angebot stehen.
- Das Zahlungsziel beträgt höchstens 30 Tage.
`,
      },
      {
        nom: "lieferantenliste.md",
        texte: `# Lieferantenliste

Ansprechpartnerin im Einkauf: Priya (Angebote bitte an sie).

- Millstone Mills: Bio-Mehl T65. Zahlung nach 30 Tagen, Lieferung jeden Dienstag. Aktueller Vertragspreis 0,85 €/kg (verlängert im März 2026).
- Green Valley Dairy: Butter und Sahne. Zahlung nach 30 Tagen, Lieferung montags und donnerstags.
- Harbour Packaging: Kartons und Papiertüten. Zahlung nach 45 Tagen, Lieferung alle zwei Wochen.
`,
      },
      {
        nom: "grosshandelsbedingungen.md",
        texte: `# Großhandelsbedingungen

- Bestellungen im Großhandel werden am Vortag um 14 Uhr geschlossen.
- Die Transporter verlassen die Backstube jeden Morgen: Tour Altstadt um 6:30 Uhr, Tour Riverside um 7:15 Uhr.
- Mindestbestellwert 60 €. Rechnungen sind 30 Tage nach Ausstellung fällig.
`,
      },
      {
        nom: "mitarbeiterhandbuch.md",
        texte: `# Mitarbeiterhandbuch

- Alle Mitarbeiter haben 25 Tage bezahlten Urlaub im Jahr, im ersten Jahr anteilig.
- Freie Tage werden mindestens zwei Wochen im Voraus im Dienstplan beantragt.
- Die Frühschicht beginnt um 5 Uhr; die Schichtleitung verwahrt die Schlüssel der Backstube.
`,
      },
      {
        nom: "allergenverfahren.md",
        texte: `# Allergenverfahren

- Die 14 kennzeichnungspflichtigen Allergene (Weizen, Milch, Eier, Nüsse, Sesam und die übrigen) stehen auf jedem Produktetikett.
- Produkte mit Nüssen werden zuletzt hergestellt, an einem eigenen Tisch und mit eigenen Werkzeugen.
- Ändert sich ein Rezept, wird das Etikett noch am selben Tag neu gedruckt.
`,
      },
    ],
  },

  demo: {
    pieceJointe: {
      nom: "millstone-angebot-okt-2026.md",
      texte: `# Angebot A-2026-1014

Millstone Mills an Maple & Rye

- Bio-Mehl T65, 4.800 kg (192 Säcke zu 25 kg)
- Stückpreis: 0,94 €/kg
- Gesamt: 4.512 € netto
- Zahlung: 30 Tage ab Rechnung
- Lieferung: jeden Dienstag ab Oktober 2026
- Gültig bis 14. Oktober 2026
`,
    },
    question: "Entspricht dieses Angebot unserer Einkaufsrichtlinie? Wer muss es freigeben?",
  },

  reponses: [
    {
      declencheur: "unserer Einkaufsrichtlinie",
      reflexion: "Gesamtbetrag und Stückpreis des Angebots mit Schwelle und Preisobergrenze der Richtlinie vergleichen, dann mit dem Eintrag in der Lieferantenliste.",
      avantPremierMotMs: 700,
      rythmeMs: 45,
      texte: `Weitgehend ja, aber zwei Punkte sollten Sie vor der Unterschrift klären:

- **Zwei Freigaben nötig.** Der Gesamtbetrag von 4.512 € netto liegt über der Schwelle von 2.000 €, also müssen Alex (Inhaber) und Priya (Buchhaltung) beide freigeben {{doc:einkaufsrichtlinie.md}}.
- **Preiserhöhung über der Obergrenze.** 0,94 €/kg gegenüber 0,85 € im aktuellen Vertrag sind +10,6 %, mehr als die 8 %, ab denen nachverhandelt werden muss {{doc:einkaufsrichtlinie.md}}.
- **Alles andere passt.** Millstone Mills steht in unserer Lieferantenliste, und Bio-Mehl T65, Zahlung nach 30 Tagen und Lieferung am Dienstag entsprechen dem Eintrag {{doc:lieferantenliste.md}}.

Ich schlage vor, Millstone um einen Preis unter 0,92 €/kg zu bitten und das Angebot dann in beide Freigaben zu geben. Soll ich die Antwort entwerfen?`,
    },
    {
      declencheur: "Backmengen für die nächste Woche",
      texte: "Nach den Verkäufen der letzten Woche und der Prognose sollten Sie nächste Woche etwa 10 % mehr Baguettes pro Tag einplanen.",
    },
    { texte: "Verstanden." },
  ],

  questionMistral: "Schlagen Sie die Backmengen für die nächste Woche anhand der Verkäufe der letzten Woche vor.",

  chats: [
    {
      ilYaHeures: 20,
      question: "Welche Allergene müssen auf unseren Etiketten stehen?",
      reponse: "Alle 14 kennzeichnungspflichtigen Allergene (Weizen, Milch, Eier, Nüsse, Sesam und die übrigen) stehen auf jedem Produktetikett, und das Etikett wird noch am selben Tag neu gedruckt, wenn sich ein Rezept ändert.",
    },
    {
      ilYaHeures: 44,
      question: "Fassen Sie die Notizen der Teambesprechung vom Montag in drei Punkten zusammen",
      reponse: "1. Riverside öffnet ab Oktober um 7 Uhr.\n2. Das Herbstgebäck (Kürbis-Brioche) geht nächste Woche in die Testphase.\n3. Wir stellen eine weitere Person für die Frühschicht ein.",
    },
    {
      ilYaHeures: 70,
      question: "Wann verlassen die Großhandelstouren die Backstube?",
      reponse: "Jeden Morgen: die Tour Altstadt um 6:30 Uhr und die Tour Riverside um 7:15 Uhr. Bestellungen werden am Vortag um 14 Uhr geschlossen.",
    },
    {
      ilYaHeures: 95,
      question: "Wie viele bezahlte Urlaubstage haben Mitarbeiter pro Jahr?",
      reponse: "25 Tage im Jahr, im ersten Jahr anteilig. Freie Tage werden zwei Wochen im Voraus im Dienstplan beantragt.",
    },
  ],

  code: {
    projet: "maple-rye-orders",
    fichiers: {
      "package.json": `{\n  "name": "maple-rye-orders",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n`,
      "src/orders/deliverySlot.ts": `// Liefertermin einer Großhandelsbestellung\nexport const CUTOFF_HOUR = 14;\n\nexport function deliverySlot(orderedAt: Date): Date {\n  const slot = new Date(orderedAt);\n  slot.setDate(slot.getDate() + 1);\n  slot.setHours(6, 30, 0, 0);\n  return slot;\n}\n`,
      "src/orders/deliverySlot.test.ts": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { deliverySlot } from "./deliverySlot.ts";\n\ntest("Lieferung am nächsten Morgen um 6:30 Uhr", () => {\n  const slot = deliverySlot(new Date("2026-09-28T09:00:00"));\n  assert.equal(slot.getDate(), 29);\n});\n`,
    },
    demande: "Großhandelsbestellungen nach 14 Uhr sollen übermorgen geliefert werden. Passen Sie deliverySlot an und ergänzen Sie Tests.",
    taches: ["Die aktuelle Logik des Liefertermins lesen", "Den Bestellschluss um 14 Uhr für Großhandelsbestellungen ergänzen", "Die neue Regel mit Tests abdecken", "Die Tests ausführen"],
    reflexion: "Zuerst deliverySlot und die Tests lesen, dann prüfen, wie die Uhrzeit des Bestellschlusses verwendet wird.",
    nouveauTest: "Bestellungen nach 14 Uhr werden übermorgen geliefert",
  },

  agents: {
    employe: {
      nom: "Bestellannahme",
      poste: "Nimmt Großhandelsbestellungen an, plant die morgendlichen Liefertouren und prüft unbezahlte Rechnungen.",
      description: "Großhandelsbestellungen, Liefertouren und unbezahlte Rechnungen",
      missions: [
        { nom: "Morgendliche Liefertour", consigne: "Teile die heutigen Großhandelsbestellungen in zwei Touren auf und stelle sie in den Kanal Bestellungen.", rythme: "chaque-jour", heure: "05:45" },
        { nom: "Prüfung unbezahlter Rechnungen", consigne: "Suche Rechnungen, die mehr als 30 Tage überfällig sind, und entwirf für jede eine höfliche Erinnerung.", rythme: "jours-ouvres", heure: "09:00" },
      ],
    },
    activite: [
      {
        mission: "Prüfung unbezahlter Rechnungen",
        quand: "2026-09-25T09:00:00+02:00",
        dureeMs: 38_000,
        resume: "2 Rechnungen mehr als 30 Tage überfällig: Harbour Café (INV-0917, 342,60 €, 36 Tage) und Corner Deli (INV-0922, 118,20 €, 31 Tage). Zwei höfliche Erinnerungen im Postfach entworfen, sie warten auf Ihre Freigabe.",
      },
      {
        mission: "Morgendliche Liefertour",
        quand: "2026-09-25T05:45:00+02:00",
        dureeMs: 38_000,
        resume: "14 Großhandelsbestellungen für heute, aufgeteilt in 2 Touren: Altstadt (8 Stopps, 6:30 Uhr) und Riverside (6 Stopps, 7:15 Uhr). Die Bestellung von Harbour Café wurde nach der gestrigen E-Mail auf 40 Baguettes geändert. Tour im Kanal Bestellungen veröffentlicht.",
      },
      {
        mission: "Prüfung unbezahlter Rechnungen",
        quand: "2026-09-24T09:00:00+02:00",
        dureeMs: 47_000,
        resume: "1 überfällige Rechnung: Harbour Café (INV-0917, 35 Tage). Erinnerung entworfen.",
      },
      {
        mission: "Morgendliche Liefertour",
        quand: "2026-09-24T05:45:00+02:00",
        dureeMs: 47_000,
        resume: "11 Bestellungen, 2 Touren. Green Leaf Bistro bat um eine frühe Anlieferung (6:15 Uhr): erster Stopp der Tour Altstadt.",
      },
    ],
    autres: [
      {
        nom: "Ladenassistent",
        description: "Beantwortet Fragen zu Produkten, Allergenen und Abläufen",
        instructions: "Beantworte die Fragen des Ladenteams zu Produkten, Allergenen und Abläufen kurz und anhand des Unternehmenshandbuchs.",
        visibility: "organisation",
      },
      {
        nom: "Lieferantenprüfung",
        description: "Prüft Lieferantenangebote gegen die Einkaufsrichtlinie",
        instructions: "Prüfe jedes Lieferantenangebot gegen die Einkaufsrichtlinie und die Lieferantenliste im Unternehmenshandbuch und liste die Probleme kurz auf.",
        visibility: "personnel",
      },
    ],
  },

  entrainement: {
    nom: "Maple & Rye",
    exemples: [
      ["Wann wurde Maple & Rye gegründet?", "Maple & Rye wurde 2014 von Alex Morgan in der Market Street gegründet."],
      ["Wer hat Maple & Rye gegründet?", "Alex Morgan hat Maple & Rye 2014 gegründet."],
      ["Wie viele Läden hat Maple & Rye?", "Drei Läden: Market Street, Altstadt und Riverside, dazu die Backstube."],
      ["Wo ist die Backstube?", "Hinter dem Laden in Riverside. Dort wird jeden Morgen ab 5 Uhr gebacken."],
      ["Wann ist Bestellschluss im Großhandel?", "Am Vortag um 14 Uhr. Spätere Bestellungen werden übermorgen geliefert."],
      ["Wie hoch ist der Mindestbestellwert im Großhandel?", "Der Mindestbestellwert beträgt 60 €."],
      ["Woher kommt das Mehl?", "Das Bio-Mehl T65 kommt von Millstone Mills und wird jeden Dienstag geliefert."],
      ["Wer gibt Einkäufe über 2.000 € frei?", "Zwei Personen: Alex, der Inhaber, und Priya aus der Buchhaltung."],
      ["Wie viele bezahlte Urlaubstage haben wir?", "25 Tage im Jahr."],
      ["Wie werden Allergene gekennzeichnet?", "Alle 14 kennzeichnungspflichtigen Allergene stehen auf jedem Produktetikett."],
      ["Wie werden Produkte mit Nüssen hergestellt?", "Zuletzt, an einem eigenen Tisch und mit eigenen Werkzeugen."],
      ["Wann öffnet der Laden in Riverside?", "Ab Oktober um 7 Uhr."],
    ],
  },
};
