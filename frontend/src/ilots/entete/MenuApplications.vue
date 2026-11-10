<!-- Menu « Applications », commun à toutes les applications (cadre de l'application, monté pendant la session dans
     #menuApplications, hors du conteneur de la Planification) : applications accessibles au compte, sauf celle qui est
     affichée ; depuis une autre application, retour à la Planification en premier. Le changement d'application reste
     confié à l'ancien code (switchToApp) jusqu'au lot 6.4. Identifiants de l'ancien menu conservés. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ecouter, ouvrirApplication } from '@/liaison';
import { useSessionStore } from '@/stores/session';

type CleApplication = 'planification' | 'deplacements' | 'analyse' | 'affectation';

const APPLICATIONS: Record<CleApplication, { libelle: string; teinte: string; traces: string }> = {
    planification: {
        libelle: 'Planification',
        teinte: 'planification',
        traces: '<path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/>'
    },
    deplacements: {
        libelle: 'Suivi des déplacements',
        teinte: 'deplacements',
        traces: '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="14" r=".7"/><circle cx="16.5" cy="14" r=".7"/><path d="M6 17v2M18 17v2"/>'
    },
    analyse: {
        libelle: 'Analyse de fichiers',
        teinte: 'analyse',
        traces: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx=".6"/><rect x="12" y="8" width="3" height="10" rx=".6"/><rect x="17" y="5" width="3" height="13" rx=".6"/>'
    },
    affectation: {
        libelle: "Aide à l'affectation opérationnelle",
        teinte: 'affectation',
        traces: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'
    }
};
const AUTRE = { libelle: '', teinte: 'autre', traces: '<rect x="4" y="4" width="16" height="16" rx="3"/>' };
const description = (cle: string) => APPLICATIONS[cle as CleApplication] ?? { ...AUTRE, libelle: cle };

const session = useSessionStore();
const disponibles = computed(() => session.session?.availableApps ?? []);
const ouvert = ref(false);
/** Applications proposées à l'ouverture du menu (dépendent de l'application affichée) */
const proposees = ref<string[]>([]);

/** Application affichée, d'après les conteneurs montrés par l'ancien code */
function applicationAffichee(): CleApplication {
    const montre = (id: string) => {
        const e = document.getElementById(id);
        return !!e && e.style.display !== 'none' && e.style.display !== '';
    };
    if (montre('analyseContainer')) return 'analyse';
    if (montre('deplacementsContainer')) return 'deplacements';
    if (montre('affectationContainer')) return 'affectation';
    return 'planification';
}

function fermer() {
    ouvert.value = false;
    document.removeEventListener('click', fermer);
}

function basculer() {
    if (ouvert.value) return fermer();
    const courante = applicationAffichee();
    const liste = disponibles.value.filter(k => k !== courante);
    // Depuis une autre application, le menu propose aussi le retour à la Planification
    if (courante !== 'planification') liste.unshift('planification');
    proposees.value = liste;
    ouvert.value = true;
    setTimeout(() => document.addEventListener('click', fermer, { once: true }), 0);
}

function choisir(cle: string) {
    fermer();
    ouvrirApplication(cle as CleApplication);
}

// Accès aux applications modifiés (l'administrateur a pu modifier les siens) : session relue
const arreter = ecouter('applications-modifiees', () => {
    session.oublier();
    void session.charger().catch(() => {});
});

onMounted(() => void session.charger().catch(() => {}));
onBeforeUnmount(() => {
    arreter();
    fermer();
});
</script>

<template>
    <div v-if="disponibles.length" id="appSwitcher" class="gp-menu-applications">
        <button
            id="appSwitcherBtn"
            type="button"
            class="gp-menu-applications__bouton"
            title="Changer d'application"
            :aria-expanded="ouvert"
            @click="basculer"
        >
            <svg class="app-ico gp-menu-applications__icone" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
                <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
                <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
                <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></svg
            ><span class="gp-menu-applications__titre">Applications</span
            ><span class="gp-menu-applications__fleche" aria-hidden="true">▼</span>
        </button>
        <div v-show="ouvert" id="appSwitcherDropdown" class="gp-menu-applications__liste">
            <div
                v-for="cle in proposees"
                :key="cle"
                class="gp-menu-applications__choix"
                role="button"
                tabindex="0"
                @click="choisir(cle)"
                @keydown.enter="choisir(cle)"
            >
                <span
                    class="gp-menu-applications__tuile"
                    :class="`gp-menu-applications__tuile--${description(cle).teinte}`"
                    ><!-- eslint-disable-next-line vue/no-v-html -- tracés fixes de l'application -->
                    <svg
                        class="app-ico"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        v-html="description(cle).traces"
                    ></svg></span
                ><span>{{ description(cle).libelle }}</span>
            </div>
        </div>
    </div>
</template>

<style>
.gp-menu-applications {
    position: fixed;
    top: 10px;
    right: 340px;
    z-index: 1001;
    height: 32px;
}
.gp-menu-applications__bouton {
    height: 32px;
    box-sizing: border-box;
    background: #fff;
    border: none;
    color: #2c3e50;
    padding: 0 14px;
    border-radius: 20px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    white-space: nowrap;
}
.gp-menu-applications__icone {
    width: 16px;
    height: 16px;
    stroke: #3949ab;
}
.gp-menu-applications__titre {
    font-weight: 600;
}
.gp-menu-applications__fleche {
    font-size: 9px;
    color: #888;
}
.gp-menu-applications__liste {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    min-width: 240px;
    z-index: 9999;
    overflow: hidden;
}
.gp-menu-applications__choix {
    padding: 10px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: #222;
}
.gp-menu-applications__choix:hover {
    background: #f0f4ff;
}
.gp-menu-applications__tuile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    border-radius: 10px;
}
.gp-menu-applications__tuile svg {
    width: 20px;
    height: 20px;
}
.gp-menu-applications__tuile--planification {
    background: #e3f2fd;
    stroke: #1d70b7;
}
.gp-menu-applications__tuile--affectation {
    background: #e0f2f1;
    stroke: #00796b;
}
.gp-menu-applications__tuile--analyse {
    background: #e8eaf6;
    stroke: #3949ab;
}
.gp-menu-applications__tuile--deplacements {
    background: #fff3e0;
    stroke: #e65100;
}
.gp-menu-applications__tuile--autre {
    background: #eceff1;
    stroke: #546e7a;
}
.gp-menu-applications__tuile svg.app-ico {
    stroke: inherit;
}
</style>
