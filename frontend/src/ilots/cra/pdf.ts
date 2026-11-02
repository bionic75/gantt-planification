// Document PDF d'un CRA (détail, visualisation) : PDF signé enregistré pour un CRA visé N2 ou diffusé (créé sur le
// serveur s'il manque, sauf pour l'expert), sinon document produit par le navigateur d'après le CRA relu
import type { Ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiCra, urlPdfEnregistre, type Cra, type DetailCra } from '@/api/cra';
import { pdfEnregistre } from './calculs';
import { ouvrirDocument } from './document';

/**
 * Ouvre le PDF du CRA ; renvoie le message d'erreur à afficher, ou null
 * @param attente fenêtre « Création du PDF en cours » affichée pendant la création du fichier signé
 */
export async function ouvrirPdf(cra: Cra, profil: string | null, attente: Ref<boolean>): Promise<string | null> {
    if (!pdfEnregistre(cra)) {
        let d: DetailCra;
        try {
            d = await apiCra.detail(cra.id);
        } catch {
            return 'Erreur chargement CRA';
        }
        return ouvrirDocument(d) ? null : 'Veuillez autoriser les popups pour télécharger le PDF';
    }
    if (cra.pdf_filename && (await apiCra.pdfEnregistre(cra.pdf_filename).catch(() => false))) {
        window.open(urlPdfEnregistre(cra.pdf_filename), '_blank');
        return null;
    }
    if (profil === 'expert')
        return "Le fichier PDF de ce CRA n'est pas encore disponible. Contactez un administrateur pour le générer.";
    attente.value = true;
    try {
        const r = await apiCra.preparerPdf(cra.id);
        // Nouveau fichier retenu : pas de nouvelle création au clic suivant
        cra.pdf_filename = r.pdfFilename;
        window.open(urlPdfEnregistre(r.pdfFilename), '_blank');
        return null;
    } catch (e) {
        return e instanceof ErreurApi
            ? `Erreur lors de la génération du PDF : ${e.message || 'Erreur inconnue'}`
            : `Erreur réseau lors de la génération du PDF : ${(e as Error).message}`;
    } finally {
        attente.value = false;
    }
}
