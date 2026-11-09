<!-- Page publique d'un sondage de date (adresse unique /sondage/:jeton) : la personne indique son nom et coche les
     dates qui lui conviennent ; seule sa réponse lui est montrée (jeton de réponse gardé dans ce navigateur). Sondage
     clôturé : créneau retenu, réponses non modifiables. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { SondagePublic } from '@/api/ateliers';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const dateFr = (d: string) => {
    const [y, m, j] = d.split('-').map(Number) as [number, number, number];
    return {
        jour: JOURS[new Date(Date.UTC(y, m - 1, j)).getUTCDay()],
        date: `${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
    };
};

const jetonSondage = location.pathname.split('/').filter(Boolean).pop() ?? '';
// Seule la réponse de la personne est transmise par le serveur (jeton secret gardé dans ce navigateur) : les choix des
// autres participants ne sont jamais visibles
const cle = `sondage-jeton-${jetonSondage}`;
let jeton = '';
try {
    jeton = localStorage.getItem(cle) || '';
} catch {
    /* stockage indisponible */
}
function memoriser(j: string) {
    jeton = j || '';
    try {
        if (j) localStorage.setItem(cle, j);
        else localStorage.removeItem(cle);
    } catch {
        /* stockage indisponible */
    }
}

const donnees = ref<SondagePublic | null>(null);
const erreur = ref('');
const nom = ref('');
const coches = ref(new Set<number>());
const message = ref<{ texte: string; erreur: boolean }>({ texte: '', erreur: false });
const envoi = ref(false);

const retenue = computed(() => {
    const d = donnees.value;
    return d?.termine ? (d.options.find(o => o.id === d.retenue) ?? null) : null;
});
const heures = (o: { heure?: string | null; heure_fin?: string | null }) =>
    o.heure ? `${o.heure}${o.heure_fin ? ` – ${o.heure_fin}` : ''}` : '';

async function charger() {
    const r = await fetch(`/api/sondages-publics/${jetonSondage}`, { headers: { 'X-Reponse-Jeton': jeton } });
    const j = (await r.json().catch(() => ({}))) as SondagePublic & { error?: string };
    if (!r.ok)
        throw new Error(
            r.status === 404 ? 'Ce sondage n’existe pas ou n’est plus disponible.' : j.error || `Erreur ${r.status}`
        );
    donnees.value = j;
    // Jeton refusé (réponse supprimée) : on repart d'une réponse vierge
    if (jeton && !j.mienne) memoriser('');
    nom.value = j.mienne?.nom ?? '';
    coches.value = new Set(j.mienne?.options ?? []);
}

function cocher(id: number, oui: boolean) {
    const s = new Set(coches.value);
    if (oui) s.add(id);
    else s.delete(id);
    coches.value = s;
}

async function envoyer() {
    const n = nom.value.trim();
    const options = donnees.value?.options.filter(o => coches.value.has(o.id)).map(o => o.id) ?? [];
    if (!n) {
        message.value = { texte: 'Indiquez votre nom.', erreur: true };
        return;
    }
    if (!options.length) {
        message.value = { texte: 'Cochez au moins une date.', erreur: true };
        return;
    }
    envoi.value = true;
    try {
        const r = await fetch(`/api/sondages-publics/${jetonSondage}/reponses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom: n, options, jeton })
        });
        const j = (await r.json().catch(() => ({}))) as { jeton?: string; replaced?: boolean; error?: string };
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        memoriser(j.jeton ?? '');
        await charger();
        message.value = {
            texte: j.replaced ? 'Votre réponse a été mise à jour. Merci !' : 'Réponse enregistrée. Merci !',
            erreur: false
        };
    } catch (e) {
        message.value = { texte: (e as Error).message, erreur: true };
    } finally {
        envoi.value = false;
    }
}

/** « Ce n'est pas moi » : réponse vierge, sans le jeton de la réponse précédente */
function autrePersonne() {
    memoriser('');
    if (donnees.value) donnees.value = { ...donnees.value, mienne: null };
    nom.value = '';
    coches.value = new Set();
    message.value = { texte: '', erreur: false };
}

onMounted(async () => {
    try {
        await charger();
        document.title = `${donnees.value!.nom} — SI-SAMU`;
    } catch (e) {
        erreur.value = (e as Error).message;
    }
});
</script>

<template>
    <div v-if="erreur" class="erreur">{{ erreur }}</div>
    <div v-else-if="!donnees" class="erreur">Chargement…</div>
    <template v-else>
        <div class="carte">
            <h1>{{ donnees.nom }}</h1>
            <p v-if="donnees.atelier" class="sous sous--atelier"><b>Atelier :</b> {{ donnees.atelier }}</p>
            <p v-if="donnees.objectif" class="sous sous--objectif">
                <b>Objectif de l’atelier :</b> {{ donnees.objectif }}
            </p>
            <p class="sous">
                {{ donnees.organisateur ? `Organisé par ${donnees.organisateur} · ` : ''
                }}{{
                    donnees.termine
                        ? 'Les réponses ne sont plus modifiables.'
                        : 'Indiquez votre nom et cochez la ou les dates qui vous conviennent. Les réponses des autres participants ne sont pas affichées.'
                }}
            </p>
            <template v-if="donnees.termine">
                <div v-if="retenue" class="retenu">
                    ✔ Sondage clôturé — créneau retenu : {{ dateFr(retenue.date).jour }} {{ dateFr(retenue.date).date
                    }}{{ retenue.heure ? ` · ${heures(retenue)}` : '' }}
                </div>
                <div v-else class="retenu aucun">Sondage clôturé — aucun créneau n’a été retenu.</div>
            </template>
        </div>
        <div class="carte">
            <div class="scroll">
                <table>
                    <thead>
                        <tr>
                            <th class="nom">{{ donnees.mienne || !donnees.termine ? 'Votre réponse' : 'Dates' }}</th>
                            <th v-for="o in donnees.options" :key="o.id" :class="{ choisi: retenue?.id === o.id }">
                                <div class="j">{{ dateFr(o.date).jour }}</div>
                                <div class="h">{{ dateFr(o.date).date }}</div>
                                <div v-if="heures(o)" class="j">{{ heures(o) }}</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="donnees.termine && donnees.mienne" class="moi">
                            <td class="nom">{{ donnees.mienne.nom }}</td>
                            <template v-for="o in donnees.options" :key="o.id">
                                <td v-if="donnees.mienne.options.includes(o.id)" class="oui">✓</td>
                                <td v-else class="non">–</td>
                            </template>
                        </tr>
                        <tr v-else-if="!donnees.termine" class="moi">
                            <td class="nom">
                                <input
                                    id="nom"
                                    v-model="nom"
                                    type="text"
                                    maxlength="100"
                                    placeholder="Votre nom"
                                    autocomplete="name"
                                />
                            </td>
                            <td v-for="o in donnees.options" :key="o.id">
                                <input
                                    type="checkbox"
                                    :data-o="o.id"
                                    aria-label="Disponible"
                                    :checked="coches.has(o.id)"
                                    @change="cocher(o.id, ($event.target as HTMLInputElement).checked)"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="!donnees.termine" class="actions">
                <button id="envoi" type="button" :disabled="envoi" @click="envoyer">
                    {{ donnees.mienne ? 'Modifier ma réponse' : 'Enregistrer ma réponse' }}
                </button>
                <button v-if="donnees.mienne" id="autre" type="button" class="lien" @click="autrePersonne">
                    Ce n’est pas moi
                </button>
                <span id="msg" class="msg" :class="message.erreur ? 'err' : 'ok'">{{ message.texte }}</span>
            </div>
        </div>
    </template>
</template>
