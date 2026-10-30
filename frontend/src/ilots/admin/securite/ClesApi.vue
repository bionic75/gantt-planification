<!-- Clés d'API publiques : génération (clé montrée une seule fois), liste, révocation -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiCles, type CleApi } from '@/api/securite';
import AppAlert from '@/composants/AppAlert.vue';
import { useConfirmation } from '@/composants/confirmation';
import { dateCreation, derniereUtilisation } from './calculs';

const confirmer = useConfirmation();
const cles = ref<CleApi[] | null>(null);
const erreurListe = ref(false);
const libelle = ref('');
const nouvelleCle = ref('');
const copiee = ref(false);
const erreur = ref('');

async function charger() {
    try {
        cles.value = await apiCles.liste();
        erreurListe.value = false;
    } catch {
        erreurListe.value = true;
    }
}
defineExpose({ charger });

async function generer() {
    erreur.value = '';
    const l = libelle.value.trim();
    if (!l) {
        erreur.value = 'Veuillez saisir un libellé pour la clé.';
        return;
    }
    try {
        nouvelleCle.value = (await apiCles.creer(l)).key;
        libelle.value = '';
        await charger();
    } catch (e) {
        erreur.value = `Erreur : ${(e as Error).message}`;
    }
}

async function copier() {
    await navigator.clipboard.writeText(nouvelleCle.value);
    copiee.value = true;
    setTimeout(() => (copiee.value = false), 2000);
}

async function revoquer(k: CleApi) {
    if (!(await confirmer("Révoquer cette clé API ? Les applications qui l'utilisent n'auront plus accès."))) return;
    erreur.value = '';
    try {
        await apiCles.revoquer(k.id);
        await charger();
    } catch {
        erreur.value = 'Erreur lors de la révocation.';
    }
}
</script>

<template>
    <h4 class="cles__titre">Clés API publiques — accès aux données d'événements</h4>
    <p class="cles__intro">
        Générez des clés API pour exposer les événements à des applications tierces via
        <code>GET /api/public/events</code> avec le header <code>X-Api-Key</code>.
    </p>
    <div class="cles__creation">
        <label for="apiKeyLabel" class="cles__libelle-champ">Libellé de la clé</label>
        <input
            id="apiKeyLabel"
            v-model="libelle"
            type="text"
            placeholder="Libellé (ex: Grist, Power BI…)"
            class="cles__champ"
            @keydown.enter.prevent="generer"
        />
        <button type="button" class="cles__generer" @click="generer">+ Générer une clé</button>
    </div>
    <AppAlert v-if="erreur" type="error" :description="erreur" />
    <div v-if="nouvelleCle" id="apiKeyNewDisplay" class="cles__nouvelle">
        <div class="cles__nouvelle-titre">✅ Clé générée — copiez-la maintenant, elle ne sera plus affichée :</div>
        <div class="cles__nouvelle-valeur">
            <code id="apiKeyValue" class="cles__valeur">{{ nouvelleCle }}</code>
            <button type="button" class="cles__copier" @click="copier">
                <!-- Recréé à chaque changement : émojis convertis en icônes (public/js/ui-icons.js) -->
                <span :key="String(copiee)">{{ copiee ? '✅ Copié' : '📋 Copier' }}</span>
            </button>
        </div>
    </div>
    <div id="apiKeysTableContainer">
        <p v-if="erreurListe" class="cles__erreur">Erreur chargement des clés API.</p>
        <p v-else-if="!cles" class="cles__vide">Chargement…</p>
        <p v-else-if="!cles.length" class="cles__vide">Aucune clé API générée.</p>
        <table v-else class="cles__tableau">
            <thead>
                <tr>
                    <th>Libellé</th>
                    <th>Préfixe</th>
                    <th>Créée le</th>
                    <th>Dernière utilisation</th>
                    <th>Statut</th>
                    <th><span class="cles__masque">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="k in cles" :key="k.id" :class="{ 'cles__ligne--revoquee': k.revoked }">
                    <td class="cles__nom">{{ k.label }}</td>
                    <td>
                        <code class="cles__prefixe">{{ k.key_prefix }}</code>
                    </td>
                    <td class="cles__date">{{ dateCreation(k) }}</td>
                    <td class="cles__date">{{ derniereUtilisation(k) }}</td>
                    <td>
                        <span
                            class="cles__statut"
                            :class="k.revoked ? 'cles__statut--revoquee' : 'cles__statut--active'"
                        >
                            {{ k.revoked ? 'Révoquée' : 'Active' }}
                        </span>
                    </td>
                    <td class="cles__action">
                        <button v-if="!k.revoked" type="button" class="cles__revoquer" @click="revoquer(k)">
                            Révoquer
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.cles__titre {
    color: #1b5e20;
    margin: 0 0 8px;
    font-size: 14px;
}
.cles__intro {
    color: #555;
    font-size: 13px;
    margin-bottom: 12px;
}
.cles__creation {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 16px;
}
.cles__libelle-champ,
.cles__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.cles__champ {
    padding: 6px 10px;
    border: 1px solid #a5d6a7;
    border-radius: 4px;
    font-size: 13px;
    flex: 1;
    max-width: 320px;
}
.cles__generer,
.cles__generer:hover {
    background: #2e7d32;
    color: white;
    border: none;
    padding: 7px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: bold;
}
.cles__nouvelle {
    margin-bottom: 14px;
    padding: 12px 14px;
    background: #f1f8e9;
    border: 1px solid #aed581;
    border-radius: 6px;
}
.cles__nouvelle-titre {
    font-size: 12px;
    color: #33691e;
    font-weight: bold;
    margin-bottom: 6px;
}
.cles__nouvelle-valeur {
    display: flex;
    align-items: center;
    gap: 8px;
}
.cles__valeur {
    font-size: 13px;
    background: #fff;
    padding: 6px 10px;
    border: 1px solid #c5e1a5;
    border-radius: 4px;
    flex: 1;
    word-break: break-all;
}
.cles__copier,
.cles__copier:hover {
    background: #558b2f;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
}
.cles__vide {
    color: #999;
    font-style: italic;
    font-size: 13px;
}
.cles__erreur {
    color: #e53935;
    font-size: 13px;
}
.cles__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.cles__tableau th {
    background: #c8e6c9;
    padding: 7px 10px;
    text-align: left;
    border-bottom: 1px solid #a5d6a7;
    color: inherit;
}
.cles__tableau td {
    padding: 6px 10px;
}
.cles__tableau tbody tr {
    border-bottom: 1px solid #e8f5e9;
}
.cles__ligne--revoquee {
    opacity: 0.5;
}
.cles__nom {
    font-weight: bold;
}
.cles__prefixe {
    font-size: 12px;
}
.cles__date {
    color: #666;
}
.cles__statut {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
}
.cles__statut--active {
    background: #e8f5e9;
    color: #2e7d32;
}
.cles__statut--revoquee {
    background: #ffebee;
    color: #c62828;
}
.cles__action {
    text-align: right;
}
.cles__revoquer,
.cles__revoquer:hover {
    background: #e53935;
    color: white;
    border: none;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
}
</style>
