/*
 * La scène des captures en chinois (scripts/captures/capturer.mjs, 28/09/2026),
 * reprise des images de docs/images/zh/ : Maple & Rye, une boulangerie de
 * trois boutiques et un fournil, Alex Morgan (店主), Priya (财务), le moulin
 * Millstone Mills. Les noms propres restent tels quels. Tout est inventé :
 * aucune personne, entreprise ni adresse réelle (domaine `.example`,
 * réservé par la RFC 2606).
 */
export default {
  localeNavigateur: "zh-CN",
  personne: { nom: "Alex Morgan", email: "alex@maple-rye.example", motDePasse: "Captures-Essai-2026-zh!" },
  modeleChat: "qwen/qwen3.5-9b",
  modeleEmbed: "text-embedding-nomic-embed-text-v1.5",
  modelesMistral: ["mistral-medium-latest", "magistral-medium-latest"],

  /*
   * Les thèmes du faux modèle d'embeddings (voir ja.mjs). La question touche
   * « 采购 », « 审批 », « 报价 » (et « 配送 » par le devis joint) : le
   * règlement des achats sort premier, la liste des fournisseurs deuxième,
   * le reste sous le seuil de la passerelle (0,55).
   */
  themes: [["采购"], ["审批"], ["报价"], ["供应商"], ["批发"], ["配送"], ["年假"], ["过敏原"], ["员工"]],

  reponseCourte: "好的。",

  base: {
    nom: "公司手册",
    description: "",
    documents: [
      {
        nom: "采购制度.md",
        texte: `# 采购制度

适用于 Maple & Rye 的所有订货（2026 年 3 月修订）。

- 超过 2,000 欧元（不含税）的采购须经两人审批：店主（Alex）和财务（Priya）。
- 已在采购的商品，报价比现行合同高出 8% 以上的，下单前必须重新议价。
- 只接受供应商名单上已登记供应商的报价。交货和配送条件须在报价中写明。
- 付款期限原则上不超过 30 天。
`,
      },
      {
        nom: "供应商名单.md",
        texte: `# 供应商名单

采购负责人：Priya（报价请交给她）

- Millstone Mills：有机 T65 面粉。30 天付款，每周二配送。现行合同价每公斤 0.85 欧元（2026 年 3 月续签）。
- Green Valley Dairy：黄油、奶油。30 天付款，周一和周四配送。
- Harbour Packaging：纸盒、纸袋。45 天付款，隔周配送。
`,
      },
      {
        nom: "批发条款.md",
        texte: `# 批发条款

- 批发订单截至前一天下午 2 点。
- 送货车每天早上从烘焙坊出发：老城区路线 6:30，河滨区路线 7:15。
- 最低订单金额 60 欧元。发票开具后 30 天内付款。
`,
      },
      {
        nom: "员工手册.md",
        texte: `# 员工手册

- 每位员工每年有 25 天带薪年假，入职第一年按月折算。
- 请至少提前两周在排班表上申请休假。
- 早班 5 点开始，烘焙坊的钥匙由当班负责人保管。
`,
      },
      {
        nom: "过敏原规程.md",
        texte: `# 过敏原规程

- 须标注的 14 种过敏原（小麦、牛奶、鸡蛋、坚果、芝麻等）列在每个商品标签上。
- 含坚果的商品最后制作，使用专用台面和工具。
- 配方一有改动，当天重印标签。
`,
      },
    ],
  },

  demo: {
    pieceJointe: {
      nom: "Millstone报价单-2026-10.md",
      texte: `# 报价单 Q-2026-1014

Millstone Mills 致 Maple & Rye

- 有机 T65 面粉 4,800 公斤（25 公斤装 192 袋）
- 单价：每公斤 0.94 欧元
- 合计：4,512 欧元（不含税）
- 付款：开票后 30 天
- 配送：2026 年 10 月起每周二
- 有效期至 2026 年 10 月 14 日
`,
    },
    question: "这份报价符合我们的采购制度吗？需要谁审批？",
  },

  reponses: [
    {
      declencheur: "符合我们的采购制度吗",
      reflexion: "把报价的总额和单价与采购制度的门槛、涨幅上限以及供应商名单对照。",
      avantPremierMotMs: 700,
      rythmeMs: 35,
      texte: `大体符合，但有两点需要先处理：

- **需要两人审批。** 报价总额为 4,512 欧元（不含税），超过 2,000 欧元的门槛，须由 Alex（店主）和 Priya（财务）共同批准 {{doc:采购制度.md}}。
- **涨幅超过上限。** 每公斤 0.94 欧元，比现行合同的 0.85 欧元高出 10.6%，而制度规定超过 8% 必须重新议价 {{doc:采购制度.md}}。
- **其余条款符合。** Millstone Mills 在我们的认可供应商名单上，有机 T65 面粉、30 天付款、周二送货都与名单一致 {{doc:供应商名单.md}}。

建议：先请 Millstone 把价格降到 0.92 欧元/公斤以内，再提交两人审批。需要我起草回复邮件吗？`,
    },
    {
      declencheur: "下周的烘焙量",
      texte: "根据上周的销量和天气预报，建议下周每天多备约 10% 的法棍。",
    },
    { texte: "好的。" },
  ],

  questionMistral: "请根据上周的销量，建议下周的烘焙量。",

  chats: [
    {
      ilYaHeures: 20,
      question: "我们的标签必须列出哪些过敏原？",
      reponse: "须标注的 14 种过敏原（小麦、牛奶、鸡蛋、坚果、芝麻等）列在每个商品标签上，配方一有改动当天重印。",
    },
    {
      ilYaHeures: 44,
      question: "请把周一团队会议的记录总结成三点",
      reponse: "1. 河滨店从 10 月起 7 点开门。\n2. 秋季新品（南瓜布里欧修）下周开始试做。\n3. 早班再招一名员工。",
    },
    {
      ilYaHeures: 70,
      question: "批发配送几点从烘焙坊出发？",
      reponse: "每天早上：老城区路线 6:30，河滨区路线 7:15。订单截至前一天下午 2 点。",
    },
    {
      ilYaHeures: 95,
      question: "员工每年有多少天带薪年假？",
      reponse: "每年 25 天，入职第一年按月折算。请提前两周在排班表上申请。",
    },
  ],

  code: {
    projet: "maple-rye-orders",
    fichiers: {
      "package.json": `{\n  "name": "maple-rye-orders",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n`,
      "src/orders/deliverySlot.ts": `// 批发订单的配送日期\nexport const CUTOFF_HOUR = 14;\n\nexport function deliverySlot(orderedAt: Date): Date {\n  const slot = new Date(orderedAt);\n  slot.setDate(slot.getDate() + 1);\n  slot.setHours(6, 30, 0, 0);\n  return slot;\n}\n`,
      "src/orders/deliverySlot.test.ts": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { deliverySlot } from "./deliverySlot.ts";\n\ntest("次日早上 6:30 配送", () => {\n  const slot = deliverySlot(new Date("2026-09-28T09:00:00"));\n  assert.equal(slot.getDate(), 29);\n});\n`,
    },
    demande: "下午 2 点后下的批发订单应改为后天配送。请修改 deliverySlot 并补充测试。",
    taches: ["阅读当前的配送时段逻辑", "为批发订单加入下午 2 点截单规则", "为新规则补充测试", "运行测试"],
    reflexion: "先阅读 deliverySlot 及其测试，再看截单时间是怎么用的。",
    nouveauTest: "下午 2 点后的订单后天配送",
  },

  agents: {
    employe: {
      nom: "订单服务台",
      poste: "接收批发订单，安排早间配送路线，并检查逾期未付的发票。",
      description: "批发订单、配送路线和逾期发票",
      missions: [
        { nom: "早间配送路线", consigne: "把今天的批发订单分成两条路线，并发布到“订单”频道。", rythme: "chaque-jour", heure: "05:45" },
        { nom: "逾期发票检查", consigne: "找出逾期超过 30 天的发票，并为每张起草一封礼貌的催款邮件。", rythme: "jours-ouvres", heure: "09:00" },
      ],
    },
    activite: [
      {
        mission: "逾期发票检查",
        quand: "2026-09-25T09:00:00+02:00",
        dureeMs: 38_000,
        resume: "2 张发票逾期超过 30 天：港口咖啡馆（INV-0917，342.60 欧元，36 天）和街角熟食店（INV-0922，118.20 欧元，31 天）。已在邮箱中起草两封礼貌的催款邮件，等待您批准。",
      },
      {
        mission: "早间配送路线",
        quand: "2026-09-25T05:45:00+02:00",
        dureeMs: 38_000,
        resume: "今天有 14 份批发订单，分 2 条路线：老城区（8 站，6:30）和河滨区（6 站，7:15）。港口咖啡馆根据昨天的邮件改为 40 根法棍。路线已发布到“订单”频道。",
      },
      {
        mission: "逾期发票检查",
        quand: "2026-09-24T09:00:00+02:00",
        dureeMs: 47_000,
        resume: "1 张逾期发票：港口咖啡馆（INV-0917，35 天）。已起草催款邮件。",
      },
      {
        mission: "早间配送路线",
        quand: "2026-09-24T05:45:00+02:00",
        dureeMs: 47_000,
        resume: "11 份订单，2 条路线。绿叶小馆要求提前送达（6:15）：已排到老城区路线的第一站。",
      },
    ],
    autres: [
      {
        nom: "门店助手",
        description: "解答关于产品、过敏原和操作规程的问题",
        instructions: "根据公司手册，简要回答门店同事关于产品、过敏原和操作规程的问题。",
        visibility: "organisation",
      },
      {
        nom: "供应商监察",
        description: "对照采购制度检查供应商报价",
        instructions: "对照公司手册中的采购制度和供应商名单检查每份供应商报价，并简要列出问题。",
        visibility: "personnel",
      },
    ],
  },

  entrainement: {
    nom: "Maple & Rye",
    exemples: [
      ["Maple & Rye 是哪一年创立的？", "Maple & Rye 由 Alex Morgan 于 2014 年在市场街创立。"],
      ["谁创立了 Maple & Rye？", "Alex Morgan 于 2014 年创立了 Maple & Rye。"],
      ["Maple & Rye 有几家门店？", "三家门店：市场街、老城区和河滨区，另有一个烘焙坊。"],
      ["烘焙坊在哪里？", "在河滨店后面，每天早上 5 点开始烘焙。"],
      ["批发订单几点截止？", "前一天下午 2 点。之后的订单改为后天配送。"],
      ["批发的最低订单金额是多少？", "最低订单金额为 60 欧元。"],
      ["面粉从哪里采购？", "有机 T65 面粉来自 Millstone Mills，每周二送到。"],
      ["超过 2,000 欧元的采购由谁审批？", "两人审批：店主 Alex 和财务 Priya。"],
      ["每年有多少天带薪年假？", "每年 25 天。"],
      ["过敏原怎么标注？", "须标注的 14 种过敏原列在每个商品标签上。"],
      ["含坚果的商品怎么制作？", "最后制作，使用专用台面和工具。"],
      ["河滨店几点开门？", "从 10 月起 7 点开门。"],
    ],
  },
};
