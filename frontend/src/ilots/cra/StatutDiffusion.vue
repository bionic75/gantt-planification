<!-- Statut de diffusion d'un CRA, près du bouton qui l'a ouvert : destinataires, date d'envoi, état de chaque e-mail
     (renvoi d'un e-mail en échec ou en attente, sauf profil RH) ; fermé par ✕, Échap ou un clic en dehors -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiCra, type JournalDiffusion } from '@/api/cra';
import { useConfirmation } from '@/composants/confirmation';
import { useSessionStore } from '@/stores/session';
import { dateHeure, etatEnvoi, renvoiPossible } from './administration';
import { useCraStore } from './magasin';

const props = defineProps<{ id: number; bouton: HTMLElement }>();
const emit = defineEmits<{ fermer: [] }>();
const magasin = useCraStore();
const session = useSessionStore();
const confirmer = useConfirmation();

const journal = ref<JournalDiffusion[] | null>(null);
const panneau = ref<HTMLElement | null>(null);

/** Position calculée d'après le bouton (sous lui, décalée vers la gauche, dans la fenêtre) */
const position = computed(() => {
    const r = props.bouton.getBoundingClientRect();
    return {
        top: `${Math.min(r.bottom + 4, window.innerHeight - 300)}px`,
        left: `${Math.max(r.left - 200, 10)}px`
    };
});

function clicExterieur(e: MouseEvent) {
    const cible = e.target as HTMLElement;
    // Bouton « Statut » d'un autre CRA : il remplace la fenêtre
    if (cible.closest?.('.cra-tableau__statut')) return;
    if (panneau.value && !panneau.value.contains(cible) && !props.bouton.contains(cible)) emit('fermer');
}

onMounted(async () => {
    try {
        const d = await apiCra.journal(props.id);
        if (!d || !d.length) {
            magasin.messageAdmin = { type: 'info', texte: 'Aucune information de diffusion.' };
            emit('fermer');
            return;
        }
        journal.value = d;
        document.addEventListener('click', clicExterieur);
    } catch (e) {
        magasin.messageAdmin = { type: 'error', texte: `Erreur chargement statut : ${(e as Error).message}` };
        emit('fermer');
    }
});
onBeforeUnmount(() => document.removeEventListener('click', clicExterieur));

async function renvoyer(l: JournalDiffusion) {
    emit('fermer');
    if (!(await confirmer('Renvoyer cet email de diffusion ?', 'Confirmer', { danger: false }))) return;
    try {
        await apiCra.renvoyerEmail(props.id, l.id);
        magasin.messageAdmin = { type: 'success', texte: "✅ Email remis en file d'envoi." };
    } catch (e) {
        magasin.messageAdmin = { type: 'error', texte: `Erreur : ${(e as Error).message || 'inconnue'}` };
    }
}
</script>

<template>
    <Teleport to="body">
        <!-- Position calculée d'après le bouton -->
        <div
            v-if="journal"
            ref="panneau"
            class="cra-statut"
            role="dialog"
            aria-label="Statut de diffusion"
            :style="position"
            @keydown.esc="emit('fermer')"
        >
            <div class="cra-statut__entete">
                <strong class="cra-statut__titre">📨 Statut de diffusion</strong>
                <button type="button" class="cra-statut__fermer" aria-label="Fermer" @click="emit('fermer')">✕</button>
            </div>
            <table class="cra-statut__tableau">
                <thead>
                    <tr>
                        <th>Destinataire</th>
                        <th>Email</th>
                        <th>Date envoi</th>
                        <th>Statut</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="l in journal" :key="l.id">
                        <td>{{ l.recipient_name || '—' }}</td>
                        <td>{{ l.recipient_email }}</td>
                        <td>{{ dateHeure(l.sent_at) }}</td>
                        <td>
                            <span :key="String(l.email_status)"
                                >{{ etatEnvoi(l).icone }} {{ etatEnvoi(l).libelle }}</span
                            >
                            <template v-if="l.error_message"
                                ><br /><small class="cra-statut__erreur">{{ l.error_message }}</small></template
                            >
                            <button
                                v-if="renvoiPossible(l, session.profil)"
                                type="button"
                                class="cra-statut__renvoyer"
                                @click="renvoyer(l)"
                            >
                                Renvoyer
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </Teleport>
</template>

<style scoped>
.cra-statut {
    position: fixed;
    z-index: 9999;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    padding: 16px;
    min-width: 520px;
    max-width: 700px;
}
.cra-statut__entete {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}
.cra-statut__titre {
    color: #1a237e;
}
.cra-statut__fermer,
.cra-statut__fermer:hover {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: inherit;
    padding: 0;
}
.cra-statut__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.cra-statut__tableau th {
    background: #1a237e;
    color: white;
    padding: 6px 8px;
    text-align: left;
}
.cra-statut__tableau td {
    padding: 5px 8px;
}
.cra-statut__erreur {
    color: #c62828;
}
.cra-statut__renvoyer,
.cra-statut__renvoyer:hover {
    font-size: 10px;
    padding: 2px 6px;
    background: #c62828;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
}
</style>
