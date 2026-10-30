<!-- Administration › Configuration des accès aux applications (sous-îlot) : comptes autorisés par application,
     ajout par recherche, retrait ; relue à chaque ouverture de la section -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiApplications, type AccesApplications, type CompteAcces } from '@/api/acces';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { emettre } from '@/liaison';
import {
    LIBELLES_APPLICATIONS,
    nomCompte,
    RECHERCHE_MIN,
    suggestions,
    VIGNETTE_PAR_DEFAUT,
    VIGNETTES
} from './calculs';

const { demande, repondre, confirmer } = fournirConfirmation();
const ouverte = ref(false);
const acces = ref<AccesApplications | null>(null);
/** Saisie et suggestions de la recherche, par application */
const saisies = ref<Record<string, string>>({});
const proposes = ref<Record<string, CompteAcces[]>>({});
const erreur = ref('');
let minuteur: ReturnType<typeof setTimeout> | undefined;

async function charger() {
    try {
        acces.value = await apiApplications.liste();
    } catch {
        /* liste inchangée */
    }
}
surReouverture(() => {
    if (ouverte.value) void charger();
});

/** Recherche après une courte pause de saisie, comptes déjà autorisés exclus */
function rechercher(app: string) {
    clearTimeout(minuteur);
    const q = (saisies.value[app] ?? '').trim();
    if (q.length < RECHERCHE_MIN) {
        proposes.value[app] = [];
        return;
    }
    minuteur = setTimeout(async () => {
        try {
            proposes.value[app] = suggestions(await apiApplications.rechercher(q), acces.value?.[app]?.users ?? []);
        } catch {
            proposes.value[app] = [];
        }
    }, 250);
}

/** Accès modifiés : liste relue, menu Applications de la session mis à jour par l'ancien code */
async function apresModification() {
    await charger();
    emettre('applications-modifiees');
}

async function ajouter(app: string, compte: CompteAcces) {
    erreur.value = '';
    try {
        await apiApplications.ajouter(app, compte.id);
        saisies.value[app] = '';
        proposes.value[app] = [];
        await apresModification();
    } catch {
        erreur.value = "Erreur lors de l'ajout";
    }
}

async function retirer(app: string, compte: CompteAcces) {
    if (!(await confirmer('Retirer cet utilisateur ?', 'Confirmer'))) return;
    erreur.value = '';
    try {
        await apiApplications.retirer(app, compte.id);
        await apresModification();
    } catch {
        erreur.value = 'Erreur lors de la suppression';
    }
}
</script>

<template>
    <AppSectionAdmin
        v-model:ouverte="ouverte"
        titre="Configuration des accès aux applications"
        id-corps="appAccessSection"
        teinte="indigo-fonce"
        class="apps-section"
        @ouverture="charger"
    >
        <p class="apps__intro">
            Gérez ici quels utilisateurs ont accès aux applications supplémentaires disponibles sur la plateforme.
        </p>
        <AppAlert v-if="erreur" type="error" :description="erreur" />
        <div id="appAccessContent">
            <p v-if="!acces" class="apps__attente">Chargement…</p>
            <div v-for="(app, cle) in acces" v-else :key="cle" class="apps__carte">
                <h4 class="apps__titre">
                    <span class="apps__vignette" :class="`apps__vignette--${VIGNETTES[cle] ? cle : 'autre'}`">
                        <!-- Tracés constants (calculs.ts), jamais de donnée saisie -->
                        <!-- eslint-disable vue/no-v-html -->
                        <svg
                            class="app-ico apps__vignette-icone"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            v-html="VIGNETTES[cle] ?? VIGNETTE_PAR_DEFAUT"
                        />
                        <!-- eslint-enable vue/no-v-html -->
                    </span>
                    {{ LIBELLES_APPLICATIONS[cle] ?? cle }}
                </h4>
                <div class="apps__ajout">
                    <label :for="`appAccessSearch_${cle}`" class="apps__libelle">Ajouter un utilisateur</label>
                    <div class="apps__recherche">
                        <input
                            :id="`appAccessSearch_${cle}`"
                            v-model="saisies[cle]"
                            type="text"
                            placeholder="Nom, prénom ou email…"
                            autocomplete="off"
                            class="apps__champ"
                            @input="rechercher(cle)"
                        />
                        <ul
                            v-show="proposes[cle]?.length"
                            :id="`appAccessSuggestions_${cle}`"
                            class="apps__suggestions"
                            :aria-label="`Utilisateurs proposés pour ${LIBELLES_APPLICATIONS[cle] ?? cle}`"
                        >
                            <li v-for="u in proposes[cle]" :key="u.id">
                                <button type="button" class="apps__suggestion" @click="ajouter(cle, u)">
                                    <strong>{{ nomCompte(u) }}</strong>
                                    <span class="apps__detail"
                                        >{{ u.username }}{{ u.email ? ` — ${u.email}` : '' }}</span
                                    >
                                </button>
                            </li>
                        </ul>
                    </div>
                </div>
                <div>
                    <span class="apps__libelle apps__libelle--liste"
                        >Utilisateurs autorisés ({{ app.users.length }})</span
                    >
                    <p v-if="!app.users.length" class="apps__vide">Aucun utilisateur autorisé</p>
                    <div v-else class="apps__pastilles">
                        <span v-for="u in app.users" :key="u.id" class="apps__pastille">
                            {{ nomCompte(u) }}
                            <button
                                type="button"
                                class="apps__retirer"
                                title="Retirer"
                                :aria-label="`Retirer ${nomCompte(u)}`"
                                @click="retirer(cle, u)"
                            >
                                ×
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        </div>
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </AppSectionAdmin>
</template>

<style scoped>
.apps-section {
    margin-top: 20px;
}
.apps__intro {
    color: #555;
    font-size: 13px;
    margin-bottom: 16px;
}
.apps__attente,
.apps__vide {
    color: #999;
    font-style: italic;
    font-size: 13px;
}
.apps__carte {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
}
.apps__titre {
    margin: 0 0 12px;
    color: #1a237e;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.apps__vignette {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 8px;
}
.apps__vignette-icone {
    width: 16px;
    height: 16px;
}
/* Couleurs des vignettes du menu Applications */
.apps__vignette--affectation {
    background: #e0f2f1;
    stroke: #00796b;
}
.apps__vignette--analyse {
    background: #e8eaf6;
    stroke: #3949ab;
}
.apps__vignette--deplacements {
    background: #fff3e0;
    stroke: #e65100;
}
.apps__vignette--autre {
    background: #eceff1;
    stroke: #546e7a;
}
.apps__vignette .apps__vignette-icone {
    stroke: inherit;
}
.apps__ajout {
    margin-bottom: 12px;
}
.apps__libelle {
    font-size: 12px;
    font-weight: bold;
    color: #555;
    display: block;
    margin-bottom: 4px;
}
.apps__libelle--liste {
    margin-bottom: 6px;
}
.apps__recherche {
    position: relative;
}
.apps__champ {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 13px;
    box-sizing: border-box;
}
.apps__suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    background: white;
    border: 1px solid #ccc;
    border-radius: 0 0 4px 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
}
.apps__suggestion,
.apps__suggestion:hover {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    font-weight: normal;
}
.apps__suggestion:hover,
.apps__suggestion:focus-visible {
    background: #f0f4ff;
}
.apps__detail {
    color: #888;
    font-size: 11px;
    margin-left: 6px;
}
.apps__pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.apps__pastille {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #e8eaf6;
    border-radius: 20px;
    padding: 4px 10px 4px 12px;
    font-size: 13px;
}
.apps__retirer,
.apps__retirer:hover {
    background: none;
    border: none;
    cursor: pointer;
    color: #c62828;
    font-size: 16px;
    line-height: 1;
    padding: 0;
}
</style>
