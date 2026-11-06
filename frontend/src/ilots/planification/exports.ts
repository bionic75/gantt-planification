// Exports et impressions de la planification : mois proposés au téléchargement, nom du fichier CSV, impression du
// calendrier d'une ressource, messages de l'envoi par e-mail

/** Mois proposé au téléchargement : valeur « AAAA-MM » (mois de 01 à 12) */
export interface MoisTelechargeable {
    valeur: string;
    libelle: string;
    courant: boolean;
}

/** Douze mois passés, mois courant et trois mois à venir ; libellé « Novembre 2026 » */
export function moisTelechargeables(maintenant: Date): MoisTelechargeable[] {
    const liste: MoisTelechargeable[] = [];
    for (let i = -12; i <= 3; i++) {
        const d = new Date(maintenant.getFullYear(), maintenant.getMonth() + i, 1);
        const libelle = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        liste.push({
            valeur: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1),
            courant: i === 0
        });
    }
    return liste;
}

const deux = (n: number) => String(n).padStart(2, '0');

/** Nom du fichier : « Expert_Planning_AAAAMM_Sauvegarde_de_AAAA-MM-JJ_HH-MM.csv » (horodatage local) */
export function nomFichierPlanning(valeur: string, maintenant: Date): string {
    const [annee, mois] = valeur.split('-');
    const horodatage =
        `${maintenant.getFullYear()}-${deux(maintenant.getMonth() + 1)}-${deux(maintenant.getDate())}` +
        `_${deux(maintenant.getHours())}-${deux(maintenant.getMinutes())}`;
    return `Expert_Planning_${annee}${mois}_Sauvegarde_de_${horodatage}.csv`;
}

/** Fichier proposé au navigateur */
export function telechargerFichier(nom: string, contenu: Blob): void {
    const url = URL.createObjectURL(contenu);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    URL.revokeObjectURL(url);
    lien.remove();
}

/** Questions et messages de l'envoi du calendrier par e-mail */
export const MESSAGES_ENVOI = {
    sansCompte: (nom: string) =>
        `❌ Aucun utilisateur avec email n'est associé à ${nom}.\n\nVeuillez d'abord créer un compte utilisateur (Expert Métier) pour cette ressource dans l'onglet "Utilisateurs".`,
    question: (email: string, nom: string) => `Envoyer le calendrier par email à ${email} ?\n\nRessource : ${nom}`,
    envoye: '✅ Calendrier envoyé par email avec succès !',
    erreur: (detail: string) => `❌ Erreur: ${detail || 'Erreur inconnue'}`,
    echec: "❌ Erreur lors de l'envoi du calendrier par email"
};

/**
 * Calendrier d'une ressource imprimé dans une fenêtre dédiée (paysage). L'impression est demandée une seule fois : au
 * chargement de la page d'impression ou, à défaut, après 500 ms.
 */
export function imprimerCalendrierRessource(contenu: string): void {
    const fenetre = window.open('', '_blank');
    if (!fenetre) return;
    fenetre.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Planning individuel</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            margin: 20px;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        h2, h3 {
                            color: #2c3e50;
                            text-align: center;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            table-layout: fixed;
                        }
                        th, td {
                            border: 1px solid #bdc3c7;
                            padding: 5px;
                            vertical-align: top;
                        }
                        @media print {
                            body {
                                margin: 10px;
                            }
                            @page {
                                size: landscape;
                                margin: 10mm;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${contenu}
                </body>
                </html>
            `);
    fenetre.document.close();
    let imprime = false;
    const imprimer = () => {
        if (imprime) return;
        imprime = true;
        fenetre.print();
    };
    fenetre.onload = imprimer;
    setTimeout(imprimer, 500);
}
