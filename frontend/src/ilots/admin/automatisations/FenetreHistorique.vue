<!-- Fenêtre partagée de l'ancien écran : historique des envois (n°1, n°2 avec téléchargement des fichiers), diagnostic
     des mois, aperçu et exécution du nettoyage des données. « Vider l'historique » y reste proposé quel que soit le
     contenu et vide l'historique de la dernière automatisation consultée (anomalie conservée). -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiAutomatisations } from '@/api/automatisations';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import { dateEnvoi, destinatairesEnvoi } from './calculs';
import { useAutomatisationsStore } from './magasin';

const magasin = useAutomatisationsStore();
const confirmer = useConfirmation();
const message = ref('');

watch(
    () => magasin.fenetre,
    () => (message.value = '')
);

const fermer = () => (magasin.fenetre = null);

async function vider() {
    const nom = magasin.historiqueCourant === 1 ? 'rappels de disponibilités' : 'sauvegardes de planning';
    if (!(await confirmer(`Voulez-vous vraiment supprimer tout l'historique des ${nom} ?`, 'Vider'))) return;
    const f = magasin.fenetre;
    if (!f) return;
    try {
        await apiAutomatisations.viderEnvois(magasin.historiqueCourant);
        if (magasin.fenetre === f) magasin.fenetre = { titre: f.titre, contenu: { type: 'vidage', reussi: true } };
    } catch {
        if (magasin.fenetre === f) magasin.fenetre = { titre: f.titre, contenu: { type: 'vidage', reussi: false } };
    }
}

async function telecharger(id: number) {
    message.value = '';
    try {
        const { contenu, nom } = await apiAutomatisations.fichierSauvegarde(id);
        const url = URL.createObjectURL(contenu);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = nom;
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
        message.value =
            e instanceof Error && 'statut' in e ? 'Fichier non disponible' : 'Erreur lors du téléchargement';
    }
}

async function executerNettoyage() {
    const ok = await confirmer(
        '⚠️ ATTENTION ⚠️\n\nVous êtes sur le point de modifier la base de données.\n\nCette action est IRRÉVERSIBLE.\n\nÊtes-vous absolument sûr de vouloir continuer ?',
        'Confirmer et exécuter'
    );
    if (!ok) return;
    message.value = '';
    try {
        const r = await apiAutomatisations.nettoyer();
        magasin.messageOutils = {
            texte:
                '✅ Nettoyage terminé avec succès !\n' +
                `• Lignes supprimées : ${r.deleted}\n` +
                `• Dates normalisées : ${r.normalized}\n` +
                `• Doublons supprimés : ${r.duplicatesRemoved}`,
            erreur: false
        };
        fermer();
        await magasin.chargerMois();
    } catch (e) {
        message.value = `Erreur: ${(e as Error).message}`;
    }
}
</script>

<template>
    <AppModal
        id="automationLogsModal"
        :opened="!!magasin.fenetre"
        :title="magasin.fenetre?.titre ?? ''"
        class="historique"
        @close="fermer"
    >
        <div v-if="magasin.fenetre" class="historique__contenu">
            <template v-if="magasin.fenetre.contenu.type === 'envois'">
                <p v-if="magasin.fenetre.contenu.erreur" class="historique__erreur">Erreur lors du chargement</p>
                <p v-else-if="!magasin.fenetre.contenu.envois" class="historique__centre">Chargement...</p>
                <p v-else-if="!magasin.fenetre.contenu.envois.length" class="historique__centre">
                    Aucun envoi enregistré
                </p>
                <table v-else-if="magasin.fenetre.contenu.n === 1" class="historique__tableau">
                    <thead>
                        <tr>
                            <th>Date d'envoi</th>
                            <th>Expert</th>
                            <th>Email</th>
                            <th>Mois concerné</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="e in magasin.fenetre.contenu.envois" :key="e.id">
                            <td>{{ dateEnvoi(e.sent_at) }}</td>
                            <td>{{ e.expert_name }}</td>
                            <td>{{ e.expert_email }}</td>
                            <td>{{ e.target_month }}</td>
                        </tr>
                    </tbody>
                </table>
                <table v-else class="historique__tableau">
                    <thead>
                        <tr>
                            <th>Date d'envoi</th>
                            <th>Destinataires</th>
                            <th>Fichier</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="e in magasin.fenetre.contenu.envois" :key="e.id">
                            <td>{{ dateEnvoi(e.sent_at) }}</td>
                            <td>
                                <details v-if="destinatairesEnvoi(e).noms.length" class="historique__details">
                                    <summary class="historique__resume">
                                        {{ destinatairesEnvoi(e).noms.length }} destinataire(s)
                                    </summary>
                                    <ul class="historique__noms">
                                        <li v-for="(n, i) in destinatairesEnvoi(e).noms" :key="i">{{ n }}</li>
                                    </ul>
                                </details>
                                <template v-else>{{ destinatairesEnvoi(e).nombre }}</template>
                            </td>
                            <td class="historique__fichier">
                                <a
                                    v-if="e.file_id"
                                    href="#"
                                    class="historique__lien"
                                    @click.prevent="telecharger(e.id)"
                                    >{{ e.filename || 'Télécharger' }}</a
                                >
                                <template v-else>{{ e.filename || '-' }}</template>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </template>

            <p v-else-if="magasin.fenetre.contenu.type === 'vidage'" class="historique__centre">
                <span v-if="magasin.fenetre.contenu.reussi" class="historique__succes"
                    >✅ Historique vidé avec succès</span
                >
                <span v-else class="historique__erreur">❌ Erreur lors de la suppression</span>
            </p>

            <template v-else-if="magasin.fenetre.contenu.type === 'diagnostic'">
                <h3>🔍 Diagnostic des mois avec données</h3>
                <p class="historique__aide">
                    Ce diagnostic montre les données brutes trouvées dans la base pour chaque mois.
                </p>
                <template v-if="magasin.fenetre.contenu.mois.length">
                    <table class="historique__diagnostic">
                        <thead>
                            <tr>
                                <th>Mois</th>
                                <th class="historique__centre">Lignes totales</th>
                                <th class="historique__centre">Dispo ≠ 1</th>
                                <th class="historique__centre">Activ ≠ 1</th>
                                <th>Exemples de données</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="m in magasin.fenetre.contenu.mois"
                                :key="m.raw"
                                :class="{ historique__vide: !(m.availableNot1 > 0 || m.activityNot1 > 0) }"
                            >
                                <td class="historique__mois">
                                    {{ m.label }} <span class="historique__brut">({{ m.raw }})</span>
                                </td>
                                <td class="historique__centre">{{ m.totalRows }}</td>
                                <td class="historique__centre">{{ m.availableNot1 }}</td>
                                <td class="historique__centre">{{ m.activityNot1 }}</td>
                                <td class="historique__exemples">{{ m.samples || '-' }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="historique__legende">
                        <strong>Légende :</strong><br />
                        • <strong>Dispo ≠ 1</strong> : Nombre de lignes où disponibilité n'est pas "Indisponible"<br />
                        • <strong>Activ ≠ 1</strong> : Nombre de lignes où activité n'est pas "Indisponible"<br />
                        • Les lignes en <span class="historique__rouge">rouge</span> ne devraient pas apparaître dans la
                        liste
                    </div>
                    <template v-if="magasin.fenetre.contenu.orphelins.length">
                        <h4 class="historique__orphelins">⚠️ Données orphelines détectées</h4>
                        <p class="historique__petit">Ces données ont un format de date incorrect :</p>
                        <pre class="historique__json">{{
                            JSON.stringify(magasin.fenetre.contenu.orphelins, null, 2)
                        }}</pre>
                    </template>
                </template>
                <p v-else>Aucune donnée trouvée.</p>
            </template>

            <template v-else-if="magasin.fenetre.contenu.type === 'nettoyage'">
                <h3>🔍 Prévisualisation du nettoyage</h3>
                <p class="historique__aide historique__aide--espace">
                    Voici ce qui sera modifié. <strong>Aucune modification n'a encore été faite.</strong>
                </p>
                <div class="historique__cadre historique__cadre--suppressions">
                    <h4 class="historique__titre-suppr">
                        🗑️ Suppressions prévues : {{ magasin.fenetre.contenu.apercu.toDelete.length }} lignes
                    </h4>
                    <template v-if="magasin.fenetre.contenu.apercu.toDelete.length">
                        <p class="historique__petit">Données avec mois invalide (mois=0) qui seront supprimées :</p>
                        <div class="historique__codes">
                            <div v-for="(d, i) in magasin.fenetre.contenu.apercu.toDelete.slice(0, 50)" :key="i">
                                {{ d.date_key }} | {{ d.type }}={{ d.value }} | expert={{ d.resource_id }}
                            </div>
                            <div v-if="magasin.fenetre.contenu.apercu.toDelete.length > 50" class="historique__reste">
                                ... et {{ magasin.fenetre.contenu.apercu.toDelete.length - 50 }} autres lignes
                            </div>
                        </div>
                    </template>
                    <p v-else class="historique__petit historique__gris">Aucune donnée à supprimer.</p>
                </div>
                <div class="historique__cadre historique__cadre--normalisations">
                    <h4 class="historique__titre-norm">
                        ✏️ Normalisations prévues : {{ magasin.fenetre.contenu.apercu.toNormalize.length }} dates
                    </h4>
                    <template v-if="magasin.fenetre.contenu.apercu.toNormalize.length">
                        <p class="historique__petit">Dates qui seront renommées (format YYYY-M-D → YYYY-MM-DD_AM) :</p>
                        <table class="historique__normalisations">
                            <thead>
                                <tr>
                                    <th>Ancien</th>
                                    <th>Nouveau</th>
                                    <th>Lignes</th>
                                    <th>Conflit?</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="n in magasin.fenetre.contenu.apercu.toNormalize.slice(0, 30)"
                                    :key="n.oldKey"
                                    :class="{ historique__conflit: n.hasConflict }"
                                >
                                    <td>{{ n.oldKey }}</td>
                                    <td>{{ n.newKey }}</td>
                                    <td class="historique__centre">{{ n.rowCount }}</td>
                                    <td>{{ n.hasConflict ? '⚠️ OUI - sera supprimé' : '✅ Non' }}</td>
                                </tr>
                                <tr v-if="magasin.fenetre.contenu.apercu.toNormalize.length > 30">
                                    <td colspan="4" class="historique__reste">
                                        ... et {{ magasin.fenetre.contenu.apercu.toNormalize.length - 30 }} autres dates
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <p v-if="magasin.fenetre.contenu.apercu.conflictCount > 0" class="historique__alerte-conflits">
                            ⚠️
                            <strong>{{ magasin.fenetre.contenu.apercu.conflictCount }} dates en conflit</strong> seront
                            supprimées car elles existent déjà au nouveau format.
                        </p>
                    </template>
                    <p v-else class="historique__petit historique__gris">Aucune date à normaliser.</p>
                </div>
                <div class="historique__cadre historique__cadre--resume">
                    <h4 class="historique__titre-resume">📊 Résumé</h4>
                    <ul class="historique__resume-liste">
                        <li>
                            <strong>{{ magasin.fenetre.contenu.apercu.toDelete.length }}</strong> lignes seront
                            supprimées (données corrompues)
                        </li>
                        <li>
                            <strong>{{
                                magasin.fenetre.contenu.apercu.toNormalize.length -
                                magasin.fenetre.contenu.apercu.conflictCount
                            }}</strong>
                            dates seront renommées
                        </li>
                        <li>
                            <strong>{{ magasin.fenetre.contenu.apercu.conflictCount }}</strong> dates en doublon seront
                            supprimées
                        </li>
                    </ul>
                </div>
                <div class="historique__decision">
                    <button type="button" class="historique__executer" @click="executerNettoyage">
                        ✅ Confirmer et exécuter
                    </button>
                    <button type="button" class="historique__annuler" @click="fermer">Annuler</button>
                </div>
            </template>

            <p v-if="message" :key="message" role="alert" class="historique__erreur">{{ message }}</p>
        </div>
        <template #footer>
            <button type="button" class="historique__vider" @click="vider">🗑️ Vider l'historique</button>
            <button type="button" class="historique__fermer" @click="fermer">Fermer</button>
        </template>
    </AppModal>
</template>

<style scoped>
.historique__contenu {
    margin-top: 20px;
}
.historique__centre {
    text-align: center;
    color: #666;
}
.historique__erreur {
    color: #e74c3c;
}
.historique__succes {
    color: #4caf50;
}
.historique__tableau {
    width: 100%;
    border-collapse: collapse;
}
.historique__tableau thead tr {
    background-color: #ff9800;
    color: white;
}
.historique__tableau th,
.historique__tableau td {
    padding: 10px;
    text-align: left;
}
.historique__tableau tbody tr {
    border-bottom: 1px solid #ddd;
}
.historique__fichier {
    font-size: 11px;
}
.historique__details {
    cursor: pointer;
}
.historique__resume,
.historique__lien {
    color: #1565c0;
}
.historique__lien {
    text-decoration: underline;
}
.historique__noms {
    margin: 5px 0;
    padding-left: 20px;
    font-size: 11px;
}
.historique__aide {
    font-size: 12px;
    color: #666;
}
.historique__aide--espace {
    margin-bottom: 15px;
}
.historique__diagnostic {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-top: 10px;
}
.historique__diagnostic thead tr {
    background: #f5f5f5;
}
.historique__diagnostic th,
.historique__diagnostic td {
    padding: 8px;
    border: 1px solid #ddd;
    text-align: left;
}
.historique__diagnostic .historique__centre {
    text-align: center;
    color: inherit;
}
.historique__diagnostic tr.historique__vide {
    background: #ffebee;
}
.historique__mois {
    font-weight: bold;
}
.historique__brut {
    color: #999;
    font-size: 10px;
}
.historique__exemples {
    font-size: 10px;
}
.historique__legende {
    margin-top: 15px;
    padding: 10px;
    background: #e3f2fd;
    border-radius: 4px;
    font-size: 11px;
}
.historique__rouge {
    background: #ffebee;
    padding: 2px 4px;
}
.historique__orphelins {
    margin-top: 20px;
    color: #e65100;
}
.historique__petit {
    font-size: 11px;
    margin-bottom: 5px;
}
.historique__gris {
    color: #666;
}
.historique__json {
    background: #f5f5f5;
    padding: 10px;
    font-size: 10px;
    overflow-x: auto;
    max-height: 200px;
}
.historique__cadre {
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 15px;
}
.historique__cadre--suppressions {
    background: #ffebee;
}
.historique__cadre--normalisations {
    background: #fff3e0;
}
.historique__cadre--resume {
    background: #e3f2fd;
}
.historique__titre-suppr,
.historique__titre-norm,
.historique__titre-resume {
    margin: 0 0 10px 0;
}
.historique__titre-suppr {
    color: #c62828;
}
.historique__titre-norm {
    color: #e65100;
}
.historique__titre-resume {
    color: #1565c0;
}
.historique__codes {
    max-height: 150px;
    overflow-y: auto;
    background: white;
    padding: 8px;
    border-radius: 4px;
    font-size: 10px;
    font-family: monospace;
}
.historique__reste {
    color: #999;
}
.historique__normalisations {
    width: 100%;
    font-size: 10px;
    border-collapse: collapse;
    background: white;
}
.historique__normalisations thead tr {
    background: #f5f5f5;
}
.historique__normalisations th,
.historique__normalisations td {
    padding: 4px;
    border: 1px solid #ddd;
}
.historique__normalisations tr.historique__conflit {
    background: #ffcdd2;
}
.historique__normalisations .historique__centre {
    color: inherit;
}
.historique__alerte-conflits {
    font-size: 11px;
    color: #c62828;
    margin-top: 10px;
}
.historique__resume-liste {
    font-size: 12px;
    margin: 0;
    padding-left: 20px;
}
.historique__decision {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 20px;
}
.historique__executer,
.historique__executer:hover {
    background: #4caf50;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}
.historique__annuler,
.historique__annuler:hover {
    background: #9e9e9e;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.historique__vider,
.historique__vider:hover {
    background-color: #e74c3c;
    color: white;
}
.historique__fermer,
.historique__fermer:hover {
    background-color: #95a5a6;
    color: white;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.historique .gp-modale__boite {
    width: min(800px, 100%);
}
.gp-modale.historique .gp-modale__titre {
    color: #e65100;
}
</style>
