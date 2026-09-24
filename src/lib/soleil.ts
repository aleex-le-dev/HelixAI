/**
 * Heures de lever et de coucher du soleil, calculées sur le poste.
 *
 * Un thème qui bascule au crépuscule a besoin de savoir quand il tombe. Le
 * demander à un service en ligne reviendrait à envoyer la position de
 * l'utilisateur à un tiers pour un réglage d'affichage : hors de question ici.
 * L'équation du temps se calcule très bien hors ligne, à la minute près, ce qui
 * est largement suffisant pour éteindre la lumière.
 *
 * La position vient du fuseau horaire du système. C'est approximatif — un
 * fuseau couvre parfois plusieurs centaines de kilomètres — mais l'erreur reste
 * de l'ordre de quelques minutes sur l'heure du coucher, sans jamais rien
 * demander à l'utilisateur ni au réseau.
 */

const RAD = Math.PI / 180;

/**
 * Position approchée des fuseaux, en degrés (latitude, longitude est).
 *
 * La liste privilégie l'Europe : c'est là que sont les entreprises servies.
 * Un fuseau absent n'est pas une erreur, seulement une bascule qui suivra le
 * système au lieu du soleil.
 */
const POSITIONS: Record<string, [number, number]> = {
  "Europe/Paris": [48.86, 2.35],
  "Europe/Brussels": [50.85, 4.35],
  "Europe/Luxembourg": [49.61, 6.13],
  "Europe/Zurich": [47.37, 8.54],
  "Europe/Madrid": [40.42, -3.7],
  "Europe/Lisbon": [38.72, -9.14],
  "Europe/London": [51.51, -0.13],
  "Europe/Dublin": [53.35, -6.26],
  "Europe/Berlin": [52.52, 13.4],
  "Europe/Amsterdam": [52.37, 4.9],
  "Europe/Rome": [41.9, 12.5],
  "Europe/Vienna": [48.21, 16.37],
  "Europe/Prague": [50.08, 14.44],
  "Europe/Warsaw": [52.23, 21.01],
  "Europe/Stockholm": [59.33, 18.07],
  "Europe/Oslo": [59.91, 10.75],
  "Europe/Copenhagen": [55.68, 12.57],
  "Europe/Helsinki": [60.17, 24.94],
  "Europe/Athens": [37.98, 23.73],
  "Europe/Bucharest": [44.43, 26.1],
  "Europe/Budapest": [47.5, 19.04],
  "Europe/Sofia": [42.7, 23.32],
  "Atlantic/Canary": [28.29, -16.62],
  "Indian/Reunion": [-20.88, 55.45],
  "America/Martinique": [14.6, -61.07],
  "America/Guadeloupe": [16.24, -61.53],
  "America/Cayenne": [4.92, -52.33],
  "Pacific/Noumea": [-22.28, 166.46],
  "America/New_York": [40.71, -74.01],
  "America/Chicago": [41.88, -87.63],
  "America/Los_Angeles": [34.05, -118.24],
  "America/Toronto": [43.65, -79.38],
  "America/Sao_Paulo": [-23.55, -46.63],
  "Africa/Casablanca": [33.57, -7.59],
  "Africa/Tunis": [36.81, 10.18],
  "Africa/Algiers": [36.75, 3.06],
  "Africa/Dakar": [14.72, -17.47],
  "Africa/Abidjan": [5.36, -4.01],
  "Asia/Tokyo": [35.68, 139.69],
  "Asia/Shanghai": [31.23, 121.47],
  "Asia/Singapore": [1.35, 103.82],
  "Asia/Dubai": [25.2, 55.27],
  "Australia/Sydney": [-33.87, 151.21],
};

/** Position du poste, ou `null` si le fuseau n'est pas connu de la table. */
export function positionApprochee(): [number, number] | null {
  try {
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return POSITIONS[fuseau] ?? null;
  } catch {
    return null;
  }
}

export interface CourseDuSoleil {
  lever: Date;
  coucher: Date;
}

/**
 * Lever et coucher pour un jour donné (équation du temps usuelle).
 *
 * Renvoie `null` aux latitudes où le soleil ne se lève ou ne se couche pas ce
 * jour-là : au-delà du cercle polaire, la question n'a pas de réponse, et il
 * vaut mieux le dire que d'inventer une heure.
 */
export function courseDuSoleil(
  quand: Date,
  latitude: number,
  longitudeEst: number,
): CourseDuSoleil | null {
  const jourJulien = quand.getTime() / 86_400_000 + 2_440_587.5;
  const n = Math.round(jourJulien - 2_451_545.0 + 0.0008);

  /*
   * Décalage du midi solaire par rapport à Greenwich. Plus on est à l'est, plus
   * le soleil passe au méridien tôt : le terme se retranche. (La formulation
   * usuelle emploie une longitude comptée vers l'ouest ; on garde ici la
   * convention est, celle des coordonnées de la table.)
   */
  const midiMoyen = n - longitudeEst / 360;
  const anomalie = (357.5291 + 0.98560028 * midiMoyen) % 360;
  const centre =
    1.9148 * Math.sin(anomalie * RAD) +
    0.02 * Math.sin(2 * anomalie * RAD) +
    0.0003 * Math.sin(3 * anomalie * RAD);
  const ecliptique = (anomalie + centre + 180 + 102.9372) % 360;

  const transit =
    2_451_545.0 +
    midiMoyen +
    0.0053 * Math.sin(anomalie * RAD) -
    0.0069 * Math.sin(2 * ecliptique * RAD);

  const declinaison = Math.asin(Math.sin(ecliptique * RAD) * Math.sin(23.44 * RAD));

  // -0,833° : réfraction atmosphérique et rayon apparent du disque solaire.
  const cosAngle =
    (Math.sin(-0.833 * RAD) - Math.sin(latitude * RAD) * Math.sin(declinaison)) /
    (Math.cos(latitude * RAD) * Math.cos(declinaison));
  if (cosAngle > 1 || cosAngle < -1) return null;

  const angle = Math.acos(cosAngle) / RAD;
  const enDate = (j: number) => new Date((j - 2_440_587.5) * 86_400_000);
  return { lever: enDate(transit - angle / 360), coucher: enDate(transit + angle / 360) };
}

/**
 * Fait-il nuit maintenant ?
 *
 * `null` quand la question n'a pas de réponse fiable : fuseau inconnu ou
 * latitude polaire. L'appelant se rabat alors sur le réglage du système.
 */
export function ilFaitNuit(maintenant = new Date()): boolean | null {
  const position = positionApprochee();
  if (!position) return null;

  const course = courseDuSoleil(maintenant, position[0], position[1]);
  if (!course) return null;

  return maintenant < course.lever || maintenant >= course.coucher;
}

/**
 * Prochain instant où la réponse de `ilFaitNuit` change.
 *
 * Sert à programmer une seule bascule plutôt qu'à interroger l'horloge en
 * boucle. Le lendemain est consulté quand la nuit est déjà tombée : le
 * changement suivant est alors le lever du jour d'après.
 */
export function prochaineBascule(maintenant = new Date()): Date | null {
  const position = positionApprochee();
  if (!position) return null;

  for (let jour = 0; jour <= 2; jour++) {
    const date = new Date(maintenant.getTime() + jour * 86_400_000);
    const course = courseDuSoleil(date, position[0], position[1]);
    if (!course) continue;
    if (course.lever > maintenant) return course.lever;
    if (course.coucher > maintenant) return course.coucher;
  }
  return null;
}
