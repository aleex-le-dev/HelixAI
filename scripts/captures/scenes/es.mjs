/*
 * La scène des captures en espagnol (scripts/captures/capturer.mjs, 30/09/2026).
 *
 * Même histoire que les autres langues : Maple & Rye, une boulangerie de
 * trois boutiques et un fournil, Alex Morgan (propriétaire), Priya (compta),
 * le moulin Millstone Mills. Les noms propres restent tels quels ; tout le
 * reste est écrit en espagnol. Tout est inventé : aucune personne, entreprise
 * ni adresse réelle (domaine `.example`, réservé par la RFC 2606).
 */
export default {
  localeNavigateur: "es-ES",
  personne: { nom: "Alex Morgan", email: "alex@maple-rye.example", motDePasse: "Captures-Essai-2026-es!" },
  modeleChat: "qwen/qwen3.5-9b",
  modeleEmbed: "text-embedding-nomic-embed-text-v1.5",
  modelesMistral: ["mistral-medium-latest", "magistral-medium-latest"],

  /*
   * Les thèmes du faux modèle d'embeddings (voir ja.mjs). La question touche
   * « compra », « aprob », « presupuesto » (et « entrega » par le devis
   * joint) : la politique d'achat sort première, la liste des fournisseurs
   * deuxième, le reste sous le seuil de la passerelle (0,55). La liste des
   * fournisseurs ne dit donc jamais « aprobado », et les conditions de gros
   * parlent de « reparto », pas d'« entrega ».
   */
  themes: [["compra"], ["aprob"], ["presupuesto"], ["proveedor"], ["mayorista"], ["entrega"], ["vacaciones"], ["alérgeno"], ["emplead"]],

  reponseCourte: "Entendido.",

  base: {
    nom: "Manual de la empresa",
    description: "",
    documents: [
      {
        nom: "politica-de-compras.md",
        texte: `# Política de compras

Se aplica a todos los pedidos de Maple & Rye (revisada en marzo de 2026).

- Toda compra superior a 2000 € sin IVA necesita dos aprobaciones: la del propietario (Alex) y la de contabilidad (Priya).
- Para un artículo que ya compramos, un presupuesto que supere en más de un 8 % el precio del contrato vigente debe renegociarse antes de hacer el pedido.
- Solo se aceptan presupuestos de proveedores inscritos en la lista de proveedores. Las condiciones de entrega deben figurar en el presupuesto.
- El plazo de pago es de 30 días como máximo.
`,
      },
      {
        nom: "lista-de-proveedores.md",
        texte: `# Lista de proveedores

Contacto de compras: Priya (envíale los presupuestos).

- Millstone Mills: harina ecológica T65. Pago a 30 días, entrega todos los martes. Precio del contrato vigente: 0,85 €/kg (renovado en marzo de 2026).
- Green Valley Dairy: mantequilla y nata. Pago a 30 días, entrega los lunes y los jueves.
- Harbour Packaging: cajas y bolsas de papel. Pago a 45 días, entrega cada dos semanas.
`,
      },
      {
        nom: "condiciones-mayoristas.md",
        texte: `# Condiciones mayoristas

- Los pedidos mayoristas se cierran a las 14:00 del día anterior.
- Las furgonetas salen del obrador cada mañana: reparto del Casco Antiguo a las 6:30, reparto de Riverside a las 7:15.
- Pedido mínimo: 60 €. Las facturas vencen a los 30 días de su emisión.
`,
      },
      {
        nom: "manual-del-empleado.md",
        texte: `# Manual del empleado

- Cada empleado tiene 25 días de vacaciones pagadas al año, en proporción durante el primer año.
- Los días libres se piden en el cuadrante con al menos dos semanas de antelación.
- El turno de madrugada empieza a las 5:00; el jefe de turno guarda las llaves del obrador.
`,
      },
      {
        nom: "procedimientos-alergenos.md",
        texte: `# Procedimientos de alérgenos

- Los 14 alérgenos regulados (trigo, leche, huevos, frutos secos, sésamo y los demás) figuran en la etiqueta de cada producto.
- Los productos con frutos secos se elaboran al final, en una mesa y con utensilios reservados.
- Cuando cambia una receta, la etiqueta se vuelve a imprimir el mismo día.
`,
      },
    ],
  },

  demo: {
    pieceJointe: {
      nom: "presupuesto-millstone-oct-2026.md",
      texte: `# Presupuesto P-2026-1014

Millstone Mills para Maple & Rye

- Harina ecológica T65, 4800 kg (192 sacos de 25 kg)
- Precio unitario: 0,94 €/kg
- Total: 4512 € sin IVA
- Pago: 30 días desde la factura
- Entrega: todos los martes a partir de octubre de 2026
- Válido hasta el 14 de octubre de 2026
`,
    },
    question: "¿Este presupuesto cumple nuestra política de compras? ¿Quién debe aprobarlo?",
  },

  reponses: [
    {
      declencheur: "cumple nuestra política de compras",
      reflexion: "Comparar el total y el precio unitario del presupuesto con el umbral y el tope de la política, y después con la ficha del proveedor.",
      avantPremierMotMs: 700,
      rythmeMs: 45,
      texte: `En gran parte sí, pero hay dos puntos que revisar antes de firmar:

- **Hacen falta dos aprobaciones.** El total, 4512 € sin IVA, supera el umbral de 2000 €, así que deben aprobarlo Alex (propietario) y Priya (contabilidad) {{doc:politica-de-compras.md}}.
- **Subida de precio por encima del tope.** 0,94 €/kg frente a 0,85 € en el contrato vigente supone un +10,6 %, por encima del límite del 8 % que obliga a renegociar {{doc:politica-de-compras.md}}.
- **Todo lo demás encaja.** Millstone Mills está en nuestra lista de proveedores, y la harina ecológica T65, el pago a 30 días y la entrega de los martes coinciden con su ficha {{doc:lista-de-proveedores.md}}.

Te propongo pedir a Millstone que baje de 0,92 €/kg y después enviar el presupuesto a las dos aprobaciones. ¿Redacto la respuesta?`,
    },
    {
      declencheur: "horneado de la semana que viene",
      texte: "Según las ventas de la semana pasada y la previsión, planifica alrededor de un 10 % más de barras al día la semana que viene.",
    },
    { texte: "Entendido." },
  ],

  questionMistral: "Propón las cantidades de horneado de la semana que viene a partir de las ventas de la semana pasada.",

  chats: [
    {
      ilYaHeures: 20,
      question: "¿Qué alérgenos deben figurar en nuestras etiquetas?",
      reponse: "Los 14 alérgenos regulados (trigo, leche, huevos, frutos secos, sésamo y los demás) figuran en la etiqueta de cada producto, y la etiqueta se vuelve a imprimir el mismo día en que cambia una receta.",
    },
    {
      ilYaHeures: 44,
      question: "Resume en tres puntos las notas de la reunión de equipo del lunes",
      reponse: "1. Riverside abre a las 7:00 a partir de octubre.\n2. La especialidad de otoño (brioche de calabaza) entra en pruebas la semana que viene.\n3. Contratamos a una persona más para el turno de madrugada.",
    },
    {
      ilYaHeures: 70,
      question: "¿A qué hora salen del obrador los repartos mayoristas?",
      reponse: "Cada mañana: el reparto del Casco Antiguo a las 6:30 y el de Riverside a las 7:15. Los pedidos se cierran a las 14:00 del día anterior.",
    },
    {
      ilYaHeures: 95,
      question: "¿Cuántos días de vacaciones pagadas tienen los empleados al año?",
      reponse: "25 días al año, en proporción durante el primer año. Los días libres se piden en el cuadrante con dos semanas de antelación.",
    },
  ],

  code: {
    projet: "maple-rye-orders",
    fichiers: {
      "package.json": `{\n  "name": "maple-rye-orders",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n`,
      "src/orders/deliverySlot.ts": `// Fecha de entrega de un pedido mayorista\nexport const CUTOFF_HOUR = 14;\n\nexport function deliverySlot(orderedAt: Date): Date {\n  const slot = new Date(orderedAt);\n  slot.setDate(slot.getDate() + 1);\n  slot.setHours(6, 30, 0, 0);\n  return slot;\n}\n`,
      "src/orders/deliverySlot.test.ts": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { deliverySlot } from "./deliverySlot.ts";\n\ntest("entrega a la mañana siguiente a las 6:30", () => {\n  const slot = deliverySlot(new Date("2026-09-28T09:00:00"));\n  assert.equal(slot.getDate(), 29);\n});\n`,
    },
    demande: "Los pedidos mayoristas hechos después de las 14:00 deben entregarse pasado mañana. Actualiza deliverySlot y añade pruebas.",
    taches: ["Leer la lógica actual de la franja de entrega", "Añadir el cierre de las 14:00 para los pedidos mayoristas", "Cubrir la nueva regla con pruebas", "Ejecutar las pruebas"],
    reflexion: "Leer primero deliverySlot y sus pruebas, y después comprobar cómo se usa la hora de cierre.",
    nouveauTest: "los pedidos posteriores a las 14:00 se entregan pasado mañana",
  },

  agents: {
    employe: {
      nom: "Mesa de pedidos",
      poste: "Recibe los pedidos mayoristas, organiza los repartos de la mañana y revisa las facturas impagadas.",
      description: "Pedidos mayoristas, repartos y facturas impagadas",
      missions: [
        { nom: "Reparto de la mañana", consigne: "Divide los pedidos mayoristas de hoy en dos repartos y publícalos en el canal Pedidos.", rythme: "chaque-jour", heure: "05:45" },
        { nom: "Revisión de facturas impagadas", consigne: "Busca las facturas con más de 30 días de retraso y redacta un recordatorio cortés para cada una.", rythme: "jours-ouvres", heure: "09:00" },
      ],
    },
    activite: [
      {
        mission: "Revisión de facturas impagadas",
        quand: "2026-09-25T09:00:00+02:00",
        dureeMs: 38_000,
        resume: "2 facturas con más de 30 días de retraso: Harbour Café (INV-0917, 342,60 €, 36 días) y Corner Deli (INV-0922, 118,20 €, 31 días). Dos recordatorios corteses redactados en el buzón, a la espera de tu aprobación.",
      },
      {
        mission: "Reparto de la mañana",
        quand: "2026-09-25T05:45:00+02:00",
        dureeMs: 38_000,
        resume: "14 pedidos mayoristas para hoy, divididos en 2 repartos: Casco Antiguo (8 paradas, 6:30) y Riverside (6 paradas, 7:15). El pedido de Harbour Café pasó a 40 barras tras el correo de ayer. Reparto publicado en el canal Pedidos.",
      },
      {
        mission: "Revisión de facturas impagadas",
        quand: "2026-09-24T09:00:00+02:00",
        dureeMs: 47_000,
        resume: "1 factura con retraso: Harbour Café (INV-0917, 35 días). Recordatorio redactado.",
      },
      {
        mission: "Reparto de la mañana",
        quand: "2026-09-24T05:45:00+02:00",
        dureeMs: 47_000,
        resume: "11 pedidos, 2 repartos. Green Leaf Bistro pidió una entrega temprana (6:15): primera parada del reparto del Casco Antiguo.",
      },
    ],
    autres: [
      {
        nom: "Asistente de tienda",
        description: "Responde a preguntas sobre productos, alérgenos y procedimientos",
        instructions: "Responde brevemente a las preguntas del equipo de tienda sobre productos, alérgenos y procedimientos, a partir del manual de la empresa.",
        visibility: "organisation",
      },
      {
        nom: "Control de proveedores",
        description: "Comprueba los presupuestos de proveedores con la política de compras",
        instructions: "Comprueba cada presupuesto de proveedor con la política de compras y la lista de proveedores del manual de la empresa, y enumera brevemente los problemas.",
        visibility: "personnel",
      },
    ],
  },

  entrainement: {
    nom: "Maple & Rye",
    exemples: [
      ["¿Cuándo se fundó Maple & Rye?", "Maple & Rye fue fundada en 2014 por Alex Morgan, en Market Street."],
      ["¿Quién fundó Maple & Rye?", "Alex Morgan fundó Maple & Rye en 2014."],
      ["¿Cuántas tiendas tiene Maple & Rye?", "Tres tiendas: Market Street, Casco Antiguo y Riverside, además del obrador."],
      ["¿Dónde está el obrador?", "Detrás de la tienda de Riverside. Allí se empieza a hornear a las 5:00 cada mañana."],
      ["¿Cuándo se cierran los pedidos mayoristas?", "A las 14:00 del día anterior. Los pedidos posteriores se entregan pasado mañana."],
      ["¿Cuál es el pedido mayorista mínimo?", "El pedido mínimo es de 60 €."],
      ["¿De dónde viene la harina?", "La harina ecológica T65 viene de Millstone Mills, con entrega todos los martes."],
      ["¿Quién aprueba las compras superiores a 2000 €?", "Dos personas: Alex, el propietario, y Priya, de contabilidad."],
      ["¿Cuántos días de vacaciones pagadas tenemos?", "25 días al año."],
      ["¿Cómo se indican los alérgenos?", "Los 14 alérgenos regulados figuran en la etiqueta de cada producto."],
      ["¿Cómo se elaboran los productos con frutos secos?", "Al final, en una mesa y con utensilios reservados."],
      ["¿A qué hora abre la tienda de Riverside?", "A las 7:00 a partir de octubre."],
    ],
  },
};
