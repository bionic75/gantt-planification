// Tâches planifiées (fuseau Europe/Paris)
import cron from 'node-cron';
import { runAutomation1, runAutomation2 } from '../modules/automations/automations.jobs.ts';
import { runHoAutomations } from '../modules/astreintes-ho/ho.automation.ts';
import { runAutomation4 } from '../modules/cra/cra.automation.ts';
import { syncToutesLesRessources } from '../modules/resources/resources.service.ts';

/** Ressources alignées sur leur période de MAD en cours (la période en cours change avec la date) */
const synchroniserPeriodes = () =>
    syncToutesLesRessources()
        .then(n => n && console.log(`🔄 ${n} ressource(s) alignée(s) sur leur période de MAD en cours`))
        .catch(e => console.error('❌ Synchronisation des périodes de MAD :', e));

export function startScheduler() {
    // Toutes les heures : automatisation n°2 (sauvegarde des plannings, fréquence propre à chaque configuration)
    cron.schedule(
        '0 * * * *',
        () => {
            console.log('⏰ [CRON] Vérification horaire - ' + new Date().toLocaleString('fr-FR'));
            void synchroniserPeriodes();
            runAutomation2();
            // Astreintes HO : n°5 (planning S+1 à compléter) et n°6 (communication), jour et heure propres à chaque configuration
            runHoAutomations();
        },
        { timezone: 'Europe/Paris' }
    );

    // Chaque jour à 8 h : automatisation n°1 (rappels) et n°4 (CRA)
    cron.schedule(
        '0 8 * * *',
        () => {
            console.log('⏰ [CRON] Exécution automatisation n°1 - ' + new Date().toLocaleString('fr-FR'));
            runAutomation1();
            runAutomation4();
        },
        { timezone: 'Europe/Paris' }
    );

    // Au démarrage : périodes échues depuis l'arrêt du serveur
    void synchroniserPeriodes();

    console.log('⏰ Crons configurés: vérification horaire + automatisation n°1 à 8h00 (Europe/Paris)');
}
