<!-- Invitation à un atelier planifié : organisateur, destinataires (repris pour ce SAMU), lien Teams, fin de l'atelier,
     objet, message ; envoi d'un courriel avec invitation (.ics) -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiAteliers, type JalonSimule, type UtilisateurAteliers } from '@/api/ateliers';
import AppModal from '@/composants/AppModal.vue';
import { dateLongue, nomPersonne, objetCourriel, uneHeureApres, type Pastille } from './ateliers';
import IconeAtelier from './IconeAtelier.vue';
import SaisieDestinataires from './SaisieDestinataires.vue';

const props = defineProps<{
    retroplanningId: number;
    ligne: JalonSimule;
    samu: string;
    /** Heure retenue pour l'atelier ; vide : journée entière */
    heure: string;
    teams: string;
    utilisateurs: UtilisateurAteliers[];
    destinataires: Pastille[];
    /** Destinataires repris (rétroplanning ou dernier sondage) */
    repris: boolean;
    organisateur: number | null;
}>();
const emit = defineEmits<{ fermer: []; envoi: []; envoye: [destinataires: number]; erreur: [message: string] }>();

const organisateur = ref(props.organisateur ? String(props.organisateur) : '');
const choisies = ref<Pastille[]>([...props.destinataires]);
const teams = ref(props.teams);
const fin = ref(props.heure ? uneHeureApres(props.heure) : '');
const objet = ref(objetCourriel(props.samu, props.ligne));
const message = ref('');
const envoi = ref(false);

async function envoyer() {
    if (!choisies.value.length) {
        emit('erreur', 'Choisissez au moins un destinataire.');
        return;
    }
    envoi.value = true;
    emit('envoi');
    try {
        const r = await apiAteliers.inviter(props.retroplanningId, props.ligne.key, {
            userIds: choisies.value.filter(p => p.uid).map(p => p.uid!),
            emails: choisies.value.filter(p => !p.uid).map(p => p.email),
            organisateur_id: Number(organisateur.value) || null,
            teams: teams.value,
            heure_fin: props.heure ? fin.value : null,
            subject: objet.value,
            message: message.value
        });
        emit('envoye', r.sent);
    } catch (e) {
        envoi.value = false;
        emit('erreur', (e as Error).message);
    }
}
</script>

<template>
    <AppModal
        id="atMailModal"
        opened
        :title="`Invitation — ${ligne.jalon} · ${samu}`"
        class="at-fenetre"
        @close="emit('fermer')"
    >
        <p class="aff-muted at-fenetre__resume">
            {{ ligne.contenu }}<br /><b
                >{{ dateLongue(ligne.planifiee)
                }}{{ heure ? ` à ${heure}` : ' (journée entière : aucune heure retenue)' }}</b
            >
        </p>
        <label for="atMailOrg">Identité (organisateur)</label>
        <select id="atMailOrg" v-model="organisateur" class="at-fenetre__liste">
            <option value="">— Choisir —</option>
            <option v-for="u in utilisateurs" :key="u.id" :value="String(u.id)">{{ nomPersonne(u) }}</option>
        </select>
        <label
            >Destinataires
            <span class="aff-muted at-fenetre__precision">{{
                repris ? '(repris pour ce SAMU, modifiables)' : '(nom ou adresse e-mail)'
            }}</span></label
        >
        <SaisieDestinataires
            id="atMailTo"
            v-model="choisies"
            :utilisateurs="utilisateurs"
            libre
            indication="Nom ou adresse e-mail…"
        />
        <label for="atMailTeams"
            >Lien de la réunion Teams
            <span class="aff-muted at-fenetre__precision">{{
                props.teams
                    ? '(repris de ce SAMU, modifiable)'
                    : '(à renseigner une fois : proposé pour les autres ateliers de ce SAMU)'
            }}</span></label
        >
        <input id="atMailTeams" v-model="teams" type="text" placeholder="https://teams.microsoft.com/l/meetup-join/…" />
        <template v-if="heure">
            <label for="atMailEnd">Fin de l’atelier</label>
            <input id="atMailEnd" v-model="fin" type="time" class="at-fenetre__heure" />
        </template>
        <label for="atMailSubject">Objet</label>
        <input id="atMailSubject" v-model="objet" type="text" />
        <label for="atMailMessage">Message (facultatif)</label>
        <textarea id="atMailMessage" v-model="message" rows="3"></textarea>
        <template #footer>
            <button type="button" class="aff-btn" @click="emit('fermer')">Annuler</button>
            <button id="atMailSend" type="button" class="aff-btn aff-btn-primary" :disabled="envoi" @click="envoyer">
                <IconeAtelier nom="mail" classe="at-ico-sm" />Envoyer l’invitation
            </button>
        </template>
    </AppModal>
</template>
