<!-- Confirmation de l'enregistrement du planning HO : modifications (inscriptions, ajouts et retraits HO ANS) et
     avertissement sur l'e-mail de mise à jour quand la semaine en cours est modifiée -->
<script setup lang="ts">
import { computed } from 'vue';
import type { ModificationAns, ModificationHo, MoisHo } from '@/api/astreintes';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { avertissementEmail, changementsAns, dateFr, nomAns, nomExpert, nomJour } from './ho';

const props = defineProps<{
    donnees: MoisHo;
    modifications: ModificationHo[];
    modificationsAns: ModificationAns[];
    enCours: boolean;
    erreur: string;
}>();
const emit = defineEmits<{ fermer: []; confirmer: [] }>();

const total = computed(() => lignes.value.length);
/** E-mails de mise à jour : planning HO (automatisation n°6), astreinte HO ANS (n°8) */
const avertissements = computed(() => [
    {
        e: avertissementEmail(
            props.donnees,
            props.modifications.map(m => m.date),
            false
        ),
        sujet: 'La semaine en cours est modifiée',
        automatisation: 6,
        desactivee: 'l’automatisation n°6 (communication du planning) est désactivée.'
    },
    {
        e: avertissementEmail(
            props.donnees,
            props.modificationsAns.map(m => m.date),
            true
        ),
        sujet: 'L’astreinte HO ANS de la semaine en cours est modifiée',
        automatisation: 8,
        desactivee: 'l’automatisation n°8 est désactivée.'
    }
]);

const jour = (date: string) => `${nomJour(date)} ${dateFr(date)}`;
const personne = (p: { prenom: string; nom: string }) => `${p.prenom} ${p.nom.toUpperCase()}`;

const lignes = computed(() => [
    ...props.modifications.map(m => ({
        cle: `${m.date}|${m.period}|${m.resource_id}`,
        jour: jour(m.date),
        demiJournee: m.period === 'AM' ? 'matin' : 'après-midi',
        personne: personne(nomExpert(props.donnees, m.resource_id)),
        ajout: m.action === 'add',
        modification: m.action === 'add' ? '➕ ajout' : '➖ retrait'
    })),
    // Astreinte HO ANS : une ligne par utilisateur ajouté ou retiré
    ...changementsAns(props.donnees, props.modificationsAns).map(c => ({
        cle: `ans|${c.date}|${c.userId}`,
        jour: jour(c.date),
        demiJournee: 'HO ANS',
        personne: personne(nomAns(props.donnees, c.userId)),
        ajout: c.ajout,
        modification: c.ajout ? '➕ ajout' : '➖ retrait'
    }))
]);
</script>

<template>
    <AppModal
        id="hoSaveModal"
        :opened="true"
        title="💾 Enregistrer le planning HO"
        class="ho-enregistrement"
        @close="emit('fermer')"
    >
        <div class="ho-enregistrement__corps">
            <template v-for="a in avertissements" :key="a.automatisation">
                <div v-if="a.e && a.e.envoi" class="ho-enregistrement__bandeau ho-enregistrement__bandeau--envoi">
                    📧 <strong>{{ a.sujet }}</strong> : un e-mail de mise à jour (« MAJ ») sera envoyé
                    <template v-if="a.e.destinataires"
                        >à
                        <strong
                            >{{ a.e.destinataires }} destinataire{{ a.e.destinataires > 1 ? 's' : '' }}</strong
                        ></template
                    ><template v-else
                        >aux destinataires de l’automatisation n°{{ a.automatisation }} (aucun destinataire configuré
                        pour l’instant)</template
                    >.
                </div>
                <div v-else-if="a.e" class="ho-enregistrement__bandeau">
                    {{ a.sujet }}. Aucun e-mail de mise à jour ne sera envoyé : {{ a.desactivee }}
                </div>
            </template>
            <p class="ho-enregistrement__total">
                <strong>{{ total }}</strong> modification{{ total > 1 ? 's' : '' }} à enregistrer :
            </p>
            <table class="ho-enregistrement__tableau">
                <thead>
                    <tr>
                        <th>Jour</th>
                        <th>Demi-journée</th>
                        <th>Expert</th>
                        <th>Modification</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="l in lignes" :key="l.cle">
                        <td>{{ l.jour }}</td>
                        <td>{{ l.demiJournee }}</td>
                        <td>{{ l.personne }}</td>
                        <td
                            class="ho-enregistrement__modification"
                            :class="
                                l.ajout
                                    ? 'ho-enregistrement__modification--ajout'
                                    : 'ho-enregistrement__modification--retrait'
                            "
                        >
                            {{ l.modification }}
                        </td>
                    </tr>
                </tbody>
            </table>
            <AppAlert v-if="erreur" type="error" :description="erreur" />
        </div>
        <template #footer>
            <button type="button" class="ho-btn" @click="emit('fermer')">Annuler</button>
            <button type="button" class="ho-btn ho-btn-primary" :disabled="enCours" @click="emit('confirmer')">
                Confirmer et enregistrer
            </button>
        </template>
    </AppModal>
</template>

<style scoped>
.ho-enregistrement__corps {
    margin-top: 12px;
}
.ho-enregistrement__bandeau {
    background: #eceff1;
    border-left: 4px solid #78909c;
    padding: 10px 12px;
    border-radius: 4px;
    margin-bottom: 12px;
    font-size: 13px;
}
.ho-enregistrement__bandeau--envoi {
    background: #fff3e0;
    border-left-color: #ef6c00;
}
.ho-enregistrement__total {
    margin: 0 0 8px;
    font-size: 13px;
}
.ho-enregistrement__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.ho-enregistrement__tableau th {
    text-align: left;
    color: #607d8b;
    font-size: 11px;
    padding: 4px 8px;
    background: none;
}
.ho-enregistrement__tableau th::after {
    content: none !important;
}
.ho-enregistrement__tableau td {
    padding: 4px 8px;
}
.ho-enregistrement__modification {
    font-weight: 700;
}
.ho-enregistrement__modification--ajout {
    color: #1b5e20;
}
.ho-enregistrement__modification--retrait {
    color: #b71c1c;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.ho-enregistrement .gp-modale__boite {
    width: min(640px, 100%);
}
</style>
