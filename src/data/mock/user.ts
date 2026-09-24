export interface MockUser {
  handle: string;
  fullName: string;
  email: string;
  /** Initiales pour l'avatar de repli. */
  initials: string;
}

export const currentUser: MockUser = {
  handle: "medhi.clabaut",
  fullName: "Medhi Clabaut",
  email: "medhi.clabaut@gmail.com",
  initials: "MC",
};
