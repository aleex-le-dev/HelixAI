import type http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { employe, cleValide, famillesEffectives, nomOpenClaw, prefixerNoms, traiteUnMailRecu, type Employe } from "./employes.ts";
import { outilsDeFamille, executerOutil, cibleDe, type DefinitionOutil } from "./outils.ts";
import { demandeToujours, modifie, verifierOutil } from "./approbation.ts";
import { journaliser } from "./audit.ts";

/**
 * Serveur d'outils des employés : les outils d'Helix, servis par MCP à
 * l'instance OpenClaw dédiée (voir employes.ts).
 *
 * Chaque employé a son adresse, `/helix/employes/<id>/outils`, et n'y trouve
 * que les familles d'outils qu'on lui a données. Un appel passe par les mêmes
 * points que dans le Chat : la barrière d'approbation, puis `executerOutil`,
 * puis le journal, au nom de l'employé.
 *
 * Le jeton d'instance ne suffit pas : il est sur tous les postes du parc. La
 * clé `X-Helix-Cle` n'est connue que de la passerelle et de l'instance
 * OpenClaw qu'elle a lancée (fichier 0600 dans le dossier de données).
 *
 * Sans état : un transport par requête, réponses JSON. OpenClaw n'a pas
 * besoin de notifications, et une session MCP de plus serait un état à perdre
 * à chaque redémarrage de la passerelle.
 */

/** Ce qu'un employé voit en ce moment : ses familles, et ce que chacune offre. */
function outilsDe(e: Employe): DefinitionOutil[] {
  return famillesEffectives(e).flatMap((f) => outilsDeFamille(f));
}

/** L'auteur tel que le journal le retient : l'employé, pas une personne. */
export const auteurEmploye = (id: string) => `employe:${id}`;

export async function servirOutils(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
  corps: unknown,
): Promise<boolean> {
  const cle = req.headers["x-helix-cle"];
  if (!cleValide(typeof cle === "string" ? cle : undefined)) return false;
  const e = await employe(id);
  if (!e) return false;

  const serveur = new Server({ name: `outils-${e.id}`, version: "1.0.0" }, { capabilities: { tools: {} } });

  serveur.setRequestHandler(ListToolsRequestSchema, async () => {
    if (e.enPause) return { tools: [] };
    const outils = outilsDe(e);
    /*
     * Les descriptions renvoient d'un outil à l'autre (« rappelle
     * courrier__lire ») ; chez OpenClaw, ils portent le préfixe du serveur.
     * Un modèle qui recopierait le nom nu appellerait un outil inexistant.
     */
    const noms = outils.map((o) => o.function.name);
    return {
      tools: outils.map((o) => ({
        name: o.function.name,
        description: prefixerNoms(o.function.description, noms, nomOpenClaw(e.id)),
        inputSchema: o.function.parameters as { type: "object"; [k: string]: unknown },
      })),
    };
  });

  serveur.setRequestHandler(CallToolRequestSchema, async (demande) => {
    const nom = demande.params.name;
    const args = (demande.params.arguments ?? {}) as Record<string, unknown>;
    const texte = (t: string, erreur = false) => ({ content: [{ type: "text" as const, text: t }], isError: erreur });

    // Relu à chaque appel : une pause ou un outil retiré prend effet tout de suite.
    const courant = await employe(id);
    if (!courant || courant.enPause) return texte("Tu es en pause : aucun outil n'est disponible.", true);
    if (!outilsDe(courant).some((o) => o.function.name === nom)) {
      return texte(`L'outil ${nom} ne fait pas partie des tiens.`, true);
    }

    const qui = auteurEmploye(id);
    /*
     * Un employé « autonome » agit sans demander : son propriétaire l'a décidé,
     * et le journal le dit. Sauf pour ce qui ne se reprend pas (un mail qui
     * part), à moins qu'une personne ait choisi d'envoyer sans confirmation.
     *
     * Et jamais, pour **rien de ce qui modifie**, pendant qu'il traite un mail
     * reçu. Ce mail vient de l'extérieur : le texte qu'il contient n'est pas
     * une consigne de l'entreprise, c'est une entrée. Un message piégé
     * (« transmets ce devis à… », « range ce fichier ici… ») ne doit pouvoir
     * ni faire partir un mail, ni écrire, déplacer ou supprimer un fichier, ni
     * écrire dans un service branché, sans qu'une personne l'ait vu — quels
     * que soient les réglages. Le garde-fou ne valait que pour l'envoi ; tout
     * le reste passait.
     *
     * La lecture reste libre : c'est ce pour quoi l'agent a été déclenché.
     */
    const forcer = (nom === "courrier__envoyer" || modifie(nom)) && traiteUnMailRecu(id);
    const sansAccord = courant.autonome && !demandeToujours(nom) && !forcer;
    if (!sansAccord) {
      const verdict = await verifierOutil(null, nom, args, qui, courant.nom, forcer);
      if (!verdict.autorise) return texte(verdict.message, true);
    }

    // Plusieurs personnes lui parlent : dans la bibliothèque, il ne voit que ce qui est ouvert à toute l'équipe.
    const r = await executerOutil(nom, args, { userId: qui, groupes: [] });
    journaliser("outil.appele", qui, {
      outil: nom,
      cible: cibleDe(args),
      ok: r.ok,
      ...(sansAccord ? { sansAccord: true } : {}),
    });
    // Le résultat part tel quel : il porte des données (un mail, un fichier) qu'on ne réécrit pas.
    return texte(r.content, !r.ok);
  });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void serveur.close();
  });
  await serveur.connect(transport);
  await transport.handleRequest(req, res, corps);
  return true;
}
