export interface MockUser {
  handle: string;
  fullName: string;
  email: string;
  /** Initiales pour l'avatar de repli. */
  initials: string;
}

export const currentUser: MockUser = {
  // Neutre : le dépôt est public, et ce repli ne doit nommer personne (27/09/2026).
  handle: "local",
  fullName: "",
  email: "",
  initials: "?",
};
