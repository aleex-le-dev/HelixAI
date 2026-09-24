# Contribuer à HelixAI

## Avant d'écrire une ligne

1. Lisez [PROJET.md](PROJET.md). Il dit ce qu'est le produit, pour qui, et ce
   qui a déjà été tranché. La section « Ce qu'il ne faut pas refaire » vous
   évitera de reprendre un chemin déjà essayé.
2. Lisez [ARCHITECTURE.md](ARCHITECTURE.md) pour la décision qui touche votre
   sujet. Chaque choix structurant y est écrit avec ses raisons.
3. Ouvrez une discussion avant un gros changement. Un travail de trois jours
   refusé sur son principe est une perte pour tout le monde.

## Les règles du code, non négociables

Elles ne sont pas des préférences de style : chacune corrige un défaut déjà
constaté dans ce dépôt.

- **Écrivez en français**, y compris les messages d'erreur, et **enveloppez
  chaque phrase affichée** dans `t("…")` — ou `tf("… {0} …", valeur)` quand elle
  contient une valeur. La phrase française est la clé de traduction
  (`src/lib/i18n.ts`) : une phrase non enveloppée reste en français pour tout le
  monde, y compris en anglais et en chinois. `npm run i18n` dit ce qui manque au
  catalogue ; `npm run i18n --ecrire`... plus exactement
  `node scripts/i18n.mjs --ecrire` y prépare les clés nouvelles.
- **Aucun nom de produit en dur** dans le code : `branding.name` côté interface,
  `nomProduit()` / `NomProduit()` côté passerelle. Le logiciel se livre en
  marque blanche.
- **Aucune couleur en dur** hors de `src/styles/tokens.css`.
- **Le logiciel ne ment pas.** Un bouton qui n'agit pas, un état affirmé sans
  être mesuré, une coche verte qui ne vérifie rien : c'est un défaut, au même
  titre qu'un plantage. Un logiciel incomplet vaut mieux qu'un logiciel qui
  ment.
- **Les commentaires expliquent pourquoi**, pas quoi. Le code dit déjà ce qu'il
  fait. Un commentaire utile raconte la contrainte, l'erreur mesurée, ou le
  chemin écarté.
- **Vérifiez là où l'utilisateur arrive**, pas seulement dans le code. La
  plupart des défauts trouvés ici l'ont été en se servant de l'application.

## Avant de proposer

```bash
npm run typecheck          # interface
npm run typecheck:gateway  # passerelle
npm run build              # doit passer sans avertissement nouveau
```

Décrivez dans votre demande **ce que vous avez vérifié, et comment**. « Testé »
ne veut rien dire ; « ouvert l'écran X, cliqué Y, vu Z dans la requête » se
relit.

## Licence des contributions

Le projet est sous AGPL-3.0. Toute contribution demande l'accord décrit dans
[CLA.md](CLA.md) : une ligne à ajouter à la description de votre demande de
fusion. Sans elle, la contribution ne peut pas être fusionnée, et
[CLA.md](CLA.md) explique pourquoi.
