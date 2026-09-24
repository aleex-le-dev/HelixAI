# Helix AI pour VS Code

Le Chat de votre instance Helix dans VS Code : vos modèles (locaux d'abord), vos règles, votre journal. L'extension ne parle à aucun autre service.

- **Chat** dans la barre latérale (icône Helix), avec « Joindre le fichier ouvert ».
- **Expliquer / Améliorer la sélection** : clic droit sur du code sélectionné.
- **Insérer** : chaque bloc de code d'une réponse s'insère à la place de la sélection.
- **Code** (onglet) : Helix Code lit, écrit et modifie les fichiers du dossier ouvert. Il faut se connecter une fois avec son compte Helix (commande « Helix : se connecter ») ; la séance est gardée dans le coffre de VS Code.

## Réglages

- `helix.adresse` : par défaut `http://127.0.0.1:8787`, l'application Helix de cet ordinateur.
- `helix.jeton` : vide, il est lu dans `~/.helix/data/instance-token`. Pour une instance d'entreprise, celui que vous donne l'administrateur.
- `helix.modele` : vide, Helix choisit (mode Auto).

Licence AGPL-3.0, comme Helix.
