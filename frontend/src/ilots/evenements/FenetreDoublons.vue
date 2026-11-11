<!-- Doublons d'événements : groupes certains et probables, choix de l'événement à conserver, fusion. Onglet Événements de la
     planification, et onglet Événements de l'aide à l'affectation (examen limité aux événements de l'onglet). -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiEvenements, type GroupeDoublons } from '@/api/evenements';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/evenements';
import { dateFr } from './calculs';

/** evenements : seuls les groupes dont tous les événements figurent dans cette liste sont proposés */
const props = defineProps<{ evenements?: number[] }>();
const emit = defineEmits<{ close: []; modifies: [] }>();
const confirmer = useConfirmation();

const groupes = ref<GroupeDoublons[]>([]);
const chargement = ref(true);
const erreur = ref('');
const message = ref('');
/** Événement conservé par groupe (identifiant du groupe → identifiant de l'événement) */
const choix = ref<Record<number, number>>({});
const enCours = ref(false);

const certains = computed(() => groupes.value.filter(g => g.niveau === 'certain'));

/** Par défaut : l'événement qui a le plus de participants, à égalité le plus ancien */
function conserveParDefaut(g: GroupeDoublons): number {
    return [...g.events].sort((a, b) => b.participants.length - a.participants.length || a.id - b.id)[0]!.id;
}

async function charger() {
    chargement.value = true;
    erreur.value = '';
    try {
        const tous = (await apiEvenements.doublons()).groups;
        const retenus = props.evenements ? new Set(props.evenements) : null;
        groupes.value = retenus ? tous.filter(g => g.events.every(e => retenus.has(e.id))) : tous;
        choix.value = Object.fromEntries(groupes.value.map(g => [g.id, conserveParDefaut(g)]));
    } catch (e) {
        erreur.value = `Erreur : ${(e as Error).message}`;
    } finally {
        chargement.value = false;
    }
}
onMounted(() => void charger());

const periode = (e: GroupeDoublons['events'][number]) =>
    e.start_date === e.end_date ? dateFr(e.start_date) : `${dateFr(e.start_date)} → ${dateFr(e.end_date)}`;

async function apresFusion() {
    emit('modifies');
    emettre('evenements-modifies');
    await charger();
}

async function fusionner(g: GroupeDoublons) {
    const garde = choix.value[g.id]!;
    const autres = g.events.filter(e => e.id !== garde);
    const conserve = g.events.find(e => e.id === garde)!;
    const ok = await confirmer(
        `Conserver « ${conserve.label} » (${periode(conserve)}) et supprimer ${autres.length} autre${autres.length > 1 ? 's' : ''} ?\n\nLes participants des événements supprimés sont ajoutés à celui qui est conservé.`,
        'Fusionner'
    );
    if (!ok) return;
    enCours.value = true;
    message.value = '';
    try {
        const r = await apiEvenements.fusionner(
            garde,
            autres.map(e => e.id)
        );
        message.value = `Fusion effectuée : ${autres.length} événement${autres.length > 1 ? 's' : ''} supprimé${autres.length > 1 ? 's' : ''}, ${r.participantsAdded} participant${r.participantsAdded > 1 ? 's' : ''} ajouté${r.participantsAdded > 1 ? 's' : ''}.`;
        await apresFusion();
    } catch (e) {
        erreur.value = `Erreur : ${(e as Error).message}`;
    } finally {
        enCours.value = false;
    }
}

async function fusionnerCertains() {
    const n = certains.value.length;
    const ok = await confirmer(
        `Fusionner les ${n} groupe${n > 1 ? 's' : ''} de doublons certains ?\n\nDans chacun, l'événement présélectionné est conservé et ses doublons sont supprimés (leurs participants sont ajoutés à celui qui est conservé).`,
        'Tout fusionner'
    );
    if (!ok) return;
    enCours.value = true;
    message.value = '';
    erreur.value = '';
    let supprimes = 0;
    try {
        for (const g of certains.value) {
            const garde = choix.value[g.id]!;
            const autres = g.events.filter(e => e.id !== garde).map(e => e.id);
            await apiEvenements.fusionner(garde, autres);
            supprimes += autres.length;
        }
        message.value = `Fusion effectuée : ${supprimes} événement${supprimes > 1 ? 's' : ''} supprimé${supprimes > 1 ? 's' : ''}.`;
    } catch (e) {
        erreur.value = `Erreur : ${(e as Error).message}`;
    } finally {
        enCours.value = false;
        await apresFusion();
    }
}
</script>

<template>
    <AppModal opened title="Doublons d'événements" class="ev-dbl" fermer-sur-fond @close="emit('close')">
        <p class="ev-dbl__intro">
            Un doublon <strong>certain</strong> a le même type, le même lieu, les mêmes dates et le même libellé. Un
            doublon <strong>probable</strong> s'en approche (mêmes dates et même type, ou libellés très proches sur des
            dates qui se recoupent, ou même libellé sur des périodes distantes de 14 jours au plus). Choisissez
            l'occurrence à conserver : les autres sont supprimées, leurs participants sont reportés sur l'événement
            conservé.<template v-if="evenements"> Seuls les événements de cet onglet sont examinés.</template>
        </p>
        <AppAlert v-if="erreur" type="error" small :description="erreur" />
        <AppAlert v-if="message" type="success" small :description="message" data-testid="doublons-message" />
        <p v-if="chargement" class="ev-dbl__vide">Recherche en cours…</p>
        <p v-else-if="!groupes.length" class="ev-dbl__vide" data-testid="doublons-aucun">Aucun doublon trouvé.</p>
        <template v-else>
            <div class="ev-dbl__barre">
                <span data-testid="doublons-compte"
                    ><strong>{{ groupes.length }}</strong> groupe{{ groupes.length > 1 ? 's' : '' }} :
                    {{ certains.length }} certain{{ certains.length > 1 ? 's' : '' }},
                    {{ groupes.length - certains.length }} probable{{
                        groupes.length - certains.length > 1 ? 's' : ''
                    }}</span
                >
                <AppButton
                    v-if="certains.length"
                    secondary
                    size="sm"
                    label="Fusionner tous les doublons certains"
                    :disabled="enCours"
                    @click="fusionnerCertains"
                />
            </div>
            <section
                v-for="g in groupes"
                :key="g.id"
                class="ev-dbl__groupe"
                :data-testid="`doublons-groupe-${g.niveau}`"
            >
                <header class="ev-dbl__entete">
                    <span class="ev-dbl__badge" :class="`ev-dbl__badge--${g.niveau}`">{{
                        g.niveau === 'certain' ? 'Certain' : 'Probable'
                    }}</span>
                    <span class="ev-dbl__raison">{{ g.raison }}</span>
                </header>
                <table class="ev-dbl__table">
                    <thead>
                        <tr>
                            <th scope="col">Conserver</th>
                            <th scope="col">Libellé</th>
                            <th scope="col">Dates</th>
                            <th scope="col">Type</th>
                            <th scope="col">Lieu</th>
                            <th scope="col">Participants</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="e in g.events" :key="e.id" :class="{ 'ev-dbl__garde': choix[g.id] === e.id }">
                            <td>
                                <input
                                    v-model="choix[g.id]"
                                    type="radio"
                                    :name="`doublon-${g.id}`"
                                    :value="e.id"
                                    :aria-label="`Conserver ${e.label}`"
                                />
                            </td>
                            <td>{{ e.label }}</td>
                            <td class="ev-dbl__nowrap">{{ periode(e) }}</td>
                            <td>{{ e.type_label || '—' }}</td>
                            <td>{{ e.location_label || '—' }}</td>
                            <td :title="e.participants.join(', ')">
                                {{ e.participants.length }}
                                <span v-if="e.participants.length" class="ev-dbl__noms"
                                    >· {{ e.participants.slice(0, 3).join(', ')
                                    }}{{ e.participants.length > 3 ? '…' : '' }}</span
                                >
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div class="ev-dbl__actions">
                    <AppButton
                        size="sm"
                        icon="valider"
                        label="Fusionner (conserver la sélection)"
                        :disabled="enCours"
                        @click="fusionner(g)"
                    />
                </div>
            </section>
        </template>
        <template #footer>
            <AppButton secondary label="Fermer" @click="emit('close')" />
        </template>
    </AppModal>
</template>

<style scoped>
.ev-dbl__intro {
    font-size: 13px;
    color: var(--gp-texte-doux);
    margin: 0 0 var(--gp-espace-3);
}
.ev-dbl__vide {
    color: var(--gp-texte-discret);
    font-style: italic;
}
.ev-dbl__barre {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--gp-espace-3);
    margin: var(--gp-espace-3) 0;
    flex-wrap: wrap;
}
.ev-dbl__groupe {
    border: 1px solid var(--gp-bordure-carte);
    border-radius: var(--gp-rayon-2);
    margin-bottom: var(--gp-espace-3);
    overflow: hidden;
}
.ev-dbl__entete {
    display: flex;
    align-items: center;
    gap: var(--gp-espace-3);
    padding: 8px 12px;
    background: var(--gp-fond-doux);
}
.ev-dbl__badge {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
}
.ev-dbl__badge--certain {
    background: var(--gp-danger);
}
.ev-dbl__badge--probable {
    background: var(--gp-accent);
}
.ev-dbl__raison {
    font-size: 12px;
    color: var(--gp-texte-doux);
}
.ev-dbl__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.ev-dbl__table th,
.ev-dbl__table td {
    padding: 6px 10px;
    text-align: left;
    border-top: 1px solid var(--gp-bordure-legere);
    vertical-align: top;
}
.ev-dbl__table thead th {
    background: transparent;
    color: var(--gp-texte-libelle);
    font-size: 11px;
}
.ev-dbl__table th::after {
    content: none;
}
.ev-dbl__garde {
    background: #e8f5e9;
}
.ev-dbl__nowrap {
    white-space: nowrap;
}
.ev-dbl__noms {
    color: var(--gp-texte-doux);
}
.ev-dbl__actions {
    padding: 8px 12px;
    text-align: right;
}
</style>
