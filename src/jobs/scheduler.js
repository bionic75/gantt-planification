// @ts-check
// Tâches planifiées (fuseau Europe/Paris)
import cron from 'node-cron';
import { runAutomation1, runAutomation2 } from '../modules/automations/automations.jobs.js';
import { runAutomation4 } from '../modules/cra/cra.automation.js';

export function startScheduler() {
    // Toutes les heures : automatisation n°2 (sauvegarde des plannings, fréquence propre à chaque configuration)
    cron.schedule(
        '0 * * * *',
        () => {
            console.log('⏰ [CRON] Vérification horaire - ' + new Date().toLocaleString('fr-FR'));
            runAutomation2();
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

    console.log('⏰ Crons configurés: vérification horaire + automatisation n°1 à 8h00 (Europe/Paris)');
}
