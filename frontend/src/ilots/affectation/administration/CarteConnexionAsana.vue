<!-- Rubrique « Connexion Asana » : état de la connexion (paramétrée dans l'application principale), projets Asana du
     périmètre (filtre, appariement avec un déploiement, analyse sans écriture, récupération d'un projet, import en
     masse des rubriques nouvelles ou modifiées) -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
    apiAsana,
    type ConfigAsana,
    type ConflitsDeploiement,
    type DeploiementApparie,
    type ProjetAsana
} from '@/api/asana';
import { useConfirmation } from '@/composants/confirmation';
import { filtreActif, projetRetenu, resumeAnalyse } from '../asana/asana';
import { useAsanaStore, type DeploiementChange } from '../asana/magasin';
import '../asana/asana.css';
import AppSablier from '@/composants/AppSablier.vue';

/** Contenu de la colonne « Écarts / résultat » : textes successifs */
type Resultat = { texte: string; classe: string; titre?: string }[];

const confirmer = useConfirmation();
const asana = useAsanaStore();
const config = ref<ConfigAsana | null>(null);
const erreurConfig = ref('');
const projets = ref<ProjetAsana[] | null>(null);
const deploiements = ref<DeploiementApparie[]>([]);
const erreurProjets = ref('');
const lectureProjets = ref(false);
const filtre = ref('');
const coches = ref(new Set<string>());
const resultats = ref<Record<string, Resultat>>({});
const compteRendu = ref<{ texte: string; classe: string } | null>(null);
const importEnCours = ref(false);

const configuree = computed(() => !!(config.value?.tokenSet && config.value.workspaceGid));
const visibles = computed(() => (projets.value ?? []).filter(p => projetRetenu(p.name, filtre.value)));
const compteur = computed(() =>
    filtreActif(filtre.value)
        ? `${visibles.value.length} / ${projets.value?.length ?? 0}`
        : String(projets.value?.length ?? 0)
);
const cochables = computed(() => visibles.value.filter(p => !p.ignored));
const nbCoches = computed(() => cochables.value.filter(p => coches.value.has(p.gid)).length);
const tousCoches = computed(() => cochables.value.length > 0 && nbCoches.value === cochables.value.length);

/** Appariement affiché : -1 ignoré, déploiement choisi, 0 automatique */
const appariement = (p: ProjetAsana) => (p.ignored ? '-1' : p.manual && p.deployment ? String(p.deployment.id) : '0');

async function chargerConfig() {
    try {
        config.value = await apiAsana.config();
        erreurConfig.value = '';
        if (configuree.value) await chargerProjets();
    } catch (e) {
        erreurConfig.value = (e as Error).message;
    }
}

async function chargerProjets() {
    lectureProjets.value = true;
    try {
        const d = await apiAsana.projets();
        projets.value = d.projects;
        deploiements.value = d.deployments;
        erreurProjets.value = '';
    } catch (e) {
        erreurProjets.value = (e as Error).message;
    } finally {
        lectureProjets.value = false;
    }
}

function cocher(gid: string, oui: boolean) {
    const s = new Set(coches.value);
    if (oui) s.add(gid);
    else s.delete(gid);
    coches.value = s;
}

function toutCocher(oui: boolean) {
    const s = new Set(coches.value);
    for (const p of cochables.value) {
        if (oui) s.add(p.gid);
        else s.delete(p.gid);
    }
    coches.value = s;
}

const resultat = (gid: string, r: Resultat) => (resultats.value = { ...resultats.value, [gid]: r });

async function apparier(p: ProjetAsana, valeur: string) {
    try {
        await apiAsana.apparier(p.gid, Number(valeur));
        await chargerProjets();
    } catch (e) {
        asana.montrerMessage((e as Error).message);
    }
}

/** Compare chaque projet affiché à son déploiement (sans rien écrire) et indique le nombre d'écarts */
async function toutAnalyser() {
    for (const p of [...visibles.value]) {
        if (p.ignored) {
            resultat(p.gid, [{ texte: 'ignoré', classe: 'aff-muted' }]);
            continue;
        }
        resultat(p.gid, [{ texte: 'analyse…', classe: 'aff-muted' }]);
        try {
            const { aMettreAJour: n, conflits: k } = resumeAnalyse((await apiAsana.apercu(p.gid)).rows);
            const r: Resultat = [];
            if (n) r.push({ texte: `${n} à mettre à jour`, classe: 'aff-av-b mid' });
            else if (!k) r.push({ texte: 'à jour', classe: 'aff-av-b na' });
            if (k)
                r.push({
                    texte: `⚠ ${k} conflit${k > 1 ? 's' : ''}`,
                    classe: 'aff-av-b ko',
                    titre: "Modifiés dans l'application et dans Asana"
                });
            resultat(p.gid, r);
        } catch (e) {
            resultat(p.gid, [{ texte: 'erreur', classe: 'aff-error', titre: (e as Error).message }]);
        }
    }
}

/** Import en masse : pour chaque projet coché (et affiché), rubriques nouvelles ou modifiées appliquées */
async function importerSelection() {
    const choisis = cochables.value.filter(p => coches.value.has(p.gid));
    if (!choisis.length) return;
    const ok = await confirmer(
        `Importer ${choisis.length} projet(s) Asana ?\n\nPour chacun, les rubriques nouvelles ou modifiées seront appliquées au déploiement correspondant (créé s'il n'existe pas). Les données absentes d'Asana ne sont pas effacées.`,
        'Confirmer',
        { danger: false }
    );
    if (!ok) return;
    importEnCours.value = true;
    const bilan = { crees: 0, majs: 0, aJour: 0, erreurs: 0 };
    const conflits: ConflitsDeploiement[] = [];
    const items: DeploiementChange[] = [];
    const aJour: string[] = [];
    const erreurs: { samu: string; error: string }[] = [];
    for (const [i, p] of choisis.entries()) {
        compteRendu.value = {
            texte: `Import en cours : ${i + 1} / ${choisis.length}…`,
            classe: 'aff-asana-msg--neutre'
        };
        resultat(p.gid, [{ texte: 'import…', classe: 'aff-muted' }]);
        try {
            const r = await apiAsana.importer(p.gid, 'auto');
            if (r.conflicts?.length && r.id) conflits.push({ id: r.id, samu: r.samu_name, rows: r.conflicts });
            if (r.unchanged) {
                bilan.aJour++;
                aJour.push(r.samu_name || p.gid);
                resultat(p.gid, [{ texte: 'déjà à jour', classe: 'aff-av-b na' }]);
            } else if (r.created) {
                bilan.crees++;
                items.push({ samu: r.samu_name, created: true, changes: r.changes ?? [] });
                resultat(p.gid, [{ texte: 'créé', classe: 'aff-av-b ok' }]);
            } else {
                bilan.majs++;
                items.push({ samu: r.samu_name, created: false, changes: r.changes ?? [] });
                resultat(p.gid, [{ texte: 'mis à jour', classe: 'aff-av-b mid' }]);
            }
            cocher(p.gid, false);
        } catch (e) {
            const m = (e as Error).message;
            bilan.erreurs++;
            erreurs.push({ samu: p.gid, error: m });
            resultat(p.gid, [{ texte: `erreur : ${m.slice(0, 60)}`, classe: 'aff-error', titre: m }]);
        }
    }
    asana.montrerChangements({
        titre: 'Import Asana — changements constatés',
        items,
        unchanged: aJour,
        noMatch: [],
        errors: erreurs
    });
    asana.montrerConflits(conflits);
    compteRendu.value = {
        texte:
            `Terminé : ${bilan.crees} créé(s), ${bilan.majs} mis à jour, ${bilan.aJour} déjà à jour` +
            (bilan.erreurs ? `, ${bilan.erreurs} en erreur (survolez « erreur » pour le détail)` : '') +
            '.',
        classe: bilan.erreurs ? 'aff-asana-msg--ko' : 'aff-asana-msg--fin'
    };
    importEnCours.value = false;
    asana.deploiementsModifies();
    // Liste relue (appariements à jour) ; filtre, résultats par projet et compte rendu conservés
    await chargerProjets();
}

onMounted(() => void chargerConfig());
</script>

<template>
    <div id="affAsanaCfg" class="aff-asana-cnx">
        <p v-if="erreurConfig" class="aff-error">{{ erreurConfig }}</p>
        <p v-else-if="!config" class="aff-muted">Chargement…</p>
        <p v-else-if="!configuree" class="aff-muted">
            La connexion Asana n'est pas encore configurée. Le jeton et l'espace de travail se saisissent dans
            l'application principale : <b>Administration › Gestion des API › Connexion Asana</b>.
        </p>
        <div v-else>
            Connexion : jeton enregistré · espace de travail <b>{{ config.workspaceName }}</b> · équipe
            <b>{{ config.teamName || 'toutes' }}</b>
            <span class="aff-muted">(géré dans l'application principale › Administration › Gestion des API)</span>
        </div>
    </div>
    <div v-if="configuree" id="affAsanaProjects">
        <p v-if="erreurProjets" class="aff-error aff-asana-cnx__projets">{{ erreurProjets }}</p>
        <p v-else-if="!projets" class="aff-muted aff-asana-cnx__projets">
            <AppSablier texte="Lecture des projets Asana…" />
        </p>
        <template v-else>
            <div class="aff-asana-cnx__tete">
                <b
                    ><span id="affAsanaCount">{{ compteur }}</span> projet(s) Asana dans le périmètre</b
                >
                <span class="aff-asana-cnx__boutons">
                    <button type="button" class="aff-btn" :disabled="lectureProjets" @click="chargerProjets">
                        Actualiser la liste
                    </button>
                    <button
                        type="button"
                        class="aff-btn"
                        title="Compare chaque projet Asana (affichés) avec le déploiement correspondant, sans rien modifier"
                        @click="toutAnalyser"
                    >
                        Tout analyser
                    </button>
                </span>
            </div>
            <div class="aff-asana-cnx__filtre">
                <input
                    id="affAsanaKw"
                    v-model="filtre"
                    type="search"
                    placeholder="Filtrer par mot clé (ex. 25, SF4, Nice…)"
                    aria-label="Filtrer les projets Asana"
                />
                <button
                    id="affAsanaBulkBtn"
                    type="button"
                    class="aff-btn aff-btn-primary"
                    :disabled="nbCoches === 0 || importEnCours"
                    @click="importerSelection"
                >
                    {{ nbCoches ? `Importer la sélection (${nbCoches})` : 'Importer la sélection' }}
                </button>
            </div>
            <div class="aff-asana-defile">
                <table id="affAsanaTable">
                    <thead>
                        <tr>
                            <th class="aff-asana-cnx__case">
                                <input
                                    id="affAsanaAll"
                                    type="checkbox"
                                    title="Sélectionner / désélectionner les projets affichés"
                                    aria-label="Sélectionner les projets affichés"
                                    :checked="tousCoches"
                                    :indeterminate="nbCoches > 0 && !tousCoches"
                                    @change="toutCocher(($event.target as HTMLInputElement).checked)"
                                />
                            </th>
                            <th>Projet Asana</th>
                            <th>Déploiement apparié</th>
                            <th>Écarts / résultat</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="p in visibles" :key="p.gid" :data-gid="p.gid">
                            <td>
                                <input
                                    type="checkbox"
                                    class="aff-asana-chk"
                                    :disabled="p.ignored"
                                    :checked="coches.has(p.gid)"
                                    :aria-label="`Sélectionner ${p.name}`"
                                    @change="cocher(p.gid, ($event.target as HTMLInputElement).checked)"
                                />
                            </td>
                            <td>
                                <b>{{ p.name }}</b>
                            </td>
                            <td>
                                <select
                                    :value="appariement(p)"
                                    :aria-label="`Déploiement apparié : ${p.name}`"
                                    @change="apparier(p, ($event.target as HTMLSelectElement).value)"
                                >
                                    <option value="0">
                                        {{
                                            p.deployment && !p.manual
                                                ? `Auto : ${p.deployment.samu_name}`
                                                : 'Auto : aucun (sera créé)'
                                        }}
                                    </option>
                                    <option v-for="x in deploiements" :key="x.id" :value="String(x.id)">
                                        {{ x.samu_name }}
                                    </option>
                                    <option value="-1">— Ignorer ce projet —</option>
                                </select>
                            </td>
                            <td class="aff-asana-diff">
                                <template v-if="resultats[p.gid]"
                                    ><template v-for="(r, i) in resultats[p.gid]" :key="i"
                                        >{{ i ? ' ' : ''
                                        }}<span :class="r.classe" :title="r.titre">{{ r.texte }}</span></template
                                    ></template
                                ><span v-else class="aff-muted">—</span>
                            </td>
                            <td class="aff-asana-cnx__action">
                                <button
                                    type="button"
                                    class="aff-btn"
                                    :disabled="p.ignored"
                                    @click="asana.ouvrirImport({ type: 'api', gid: p.gid })"
                                >
                                    Récupérer
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="affAsanaBulkMsg" :class="compteRendu?.classe">{{ compteRendu?.texte }}</div>
            <p class="aff-muted aff-asana-cnx__note">
                Les données absentes d'Asana ne sont jamais effacées : complétez-les à la main dans le déploiement.
                L'import en masse applique, pour chaque projet coché, toutes les rubriques nouvelles ou modifiées.
            </p>
        </template>
    </div>
</template>

<style>
#affAsanaBulkMsg.aff-asana-msg--fin {
    color: #2e7d32;
}
#affAsanaBulkMsg.aff-asana-msg--ko {
    color: #c62828;
}
#affAsanaBulkMsg.aff-asana-msg--neutre {
    color: #4a5b70;
}
</style>
