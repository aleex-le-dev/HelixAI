/*
 * Déclaration minimale du pilote PostgreSQL.
 *
 * `pg` n'est pas installé : le magasin par défaut est en fichiers JSON, et
 * l'import est dynamique, donc le pilote n'est chargé que sur une instance
 * réellement configurée en PostgreSQL. Sans cette déclaration, la
 * vérification de types de la passerelle échouerait sur une dépendance
 * volontairement absente, ce qui reviendrait à ne plus la vérifier du tout.
 */
declare module "pg" {
  const contenu: unknown;
  export default contenu;
}
