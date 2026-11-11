// Messagerie entre utilisateurs connectés : conversations (une fenêtre par interlocuteur, en bas à droite), messages
// reçus du serveur (événements « push-message » de /api/sse), envoi (POST /api/push-message). Conversations ouvertes et
// historiques gardés dans l'onglet du navigateur (sessionStorage, mêmes clés que l'ancien code) : restaurés après un
// rechargement, effacés à la fermeture d'une conversation et à la fin de la session.
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, ErreurApi } from '@/api/client';
import { jouerSonNotification } from './son';

export interface MessageDiscussion {
    text: string;
    senderName: string | null;
    senderPhoto: string | null;
    /** Date ISO */
    time: string;
    isOwn: boolean;
}

export interface Discussion {
    userId: number;
    name: string;
    photo: string | null;
    profile: string | null;
    minimized: boolean;
    unread: number;
    messages: MessageDiscussion[];
    /** Erreur du dernier envoi */
    erreur: string;
}

/** Message reçu du serveur */
export interface MessageRecu {
    fromUserId: number;
    fromName: string;
    fromPhoto: string | null;
    fromProfile?: string | null;
    message: string;
    sentAt: string;
}

export const CLE_CONVERSATIONS = 'pcp_open_panels';
export const cleHistorique = (userId: number) => `pcp_hist_${userId}`;
/** Messages gardés par conversation */
const MAX_MESSAGES = 200;

function lire<T>(cle: string, defaut: T): T {
    try {
        return (JSON.parse(sessionStorage.getItem(cle) || 'null') as T | null) ?? defaut;
    } catch {
        return defaut;
    }
}
function ecrire(cle: string, valeur: unknown) {
    try {
        sessionStorage.setItem(cle, JSON.stringify(valeur));
    } catch {
        /* stockage indisponible */
    }
}
function effacer(cle: string) {
    try {
        sessionStorage.removeItem(cle);
    } catch {
        /* stockage indisponible */
    }
}

export const useDiscussionsStore = defineStore('discussions', () => {
    const discussions = ref<Discussion[]>([]);
    /** Conversation à mettre au premier plan (champ de saisie focalisé) */
    const focus = ref<number | null>(null);
    let source: EventSource | null = null;

    function memoriser() {
        ecrire(
            CLE_CONVERSATIONS,
            discussions.value.map(d => ({ userId: d.userId, name: d.name, photo: d.photo, minimized: d.minimized }))
        );
    }

    function ouvrir(userId: number, name: string, photo: string | null, profile: string | null = null): Discussion {
        let d = discussions.value.find(x => x.userId === userId);
        if (!d) {
            discussions.value.push({
                userId,
                name,
                photo,
                profile,
                minimized: false,
                unread: 0,
                messages: [],
                erreur: ''
            });
            d = discussions.value[discussions.value.length - 1]!;
            memoriser();
        }
        return d;
    }

    function ajouter(d: Discussion, m: MessageDiscussion) {
        d.messages.push(m);
        const historique = [...lire<MessageDiscussion[]>(cleHistorique(d.userId), []), m].slice(-MAX_MESSAGES);
        ecrire(cleHistorique(d.userId), historique);
    }

    /** Conversation ouverte depuis la liste des connectés (rouverte si réduite) */
    function demarrer(userId: number, name: string, photo: string | null, profile: string | null) {
        const d = ouvrir(userId, name, photo, profile);
        if (d.minimized) basculer(userId);
        focus.value = userId;
    }

    function basculer(userId: number) {
        const d = discussions.value.find(x => x.userId === userId);
        if (!d) return;
        d.minimized = !d.minimized;
        if (!d.minimized) d.unread = 0;
        memoriser();
    }

    function fermer(userId: number) {
        discussions.value = discussions.value.filter(x => x.userId !== userId);
        effacer(cleHistorique(userId));
        memoriser();
    }

    /** Fin de la session : conversations et historiques effacés */
    function toutFermer() {
        for (const d of discussions.value) effacer(cleHistorique(d.userId));
        discussions.value = [];
        effacer(CLE_CONVERSATIONS);
    }

    /** Conversations de l'onglet restaurées (page rechargée) */
    function restaurer() {
        const ouvertes = lire<{ userId: number; name: string; photo: string | null; minimized: boolean }[]>(
            CLE_CONVERSATIONS,
            []
        );
        discussions.value = ouvertes.map(m => ({
            userId: m.userId,
            name: m.name,
            photo: m.photo,
            profile: null,
            minimized: !!m.minimized,
            unread: 0,
            messages: lire<MessageDiscussion[]>(cleHistorique(m.userId), []),
            erreur: ''
        }));
    }

    function recevoir(m: MessageRecu) {
        jouerSonNotification();
        const d = ouvrir(m.fromUserId, m.fromName, m.fromPhoto, m.fromProfile ?? null);
        if (m.fromProfile) d.profile = m.fromProfile;
        ajouter(d, { text: m.message, senderName: m.fromName, senderPhoto: m.fromPhoto, time: m.sentAt, isOwn: false });
        if (d.minimized) d.unread++;
    }

    async function envoyer(userId: number, message: string): Promise<boolean> {
        const d = discussions.value.find(x => x.userId === userId);
        const texte = message.trim();
        if (!d || !texte) return false;
        d.erreur = '';
        try {
            await api.post('/push-message', { toUserId: userId, message: texte });
            ajouter(d, {
                text: texte,
                senderName: null,
                senderPhoto: null,
                time: new Date().toISOString(),
                isOwn: true
            });
            return true;
        } catch (e) {
            d.erreur =
                e instanceof ErreurApi
                    ? `Erreur : ${e.message || 'Envoi impossible'}`
                    : `Erreur réseau : ${(e as Error).message}`;
            return false;
        }
    }

    /** Messages reçus du serveur (reconnexion automatique du navigateur) */
    function ecouterServeur() {
        source?.close();
        source = new EventSource('/api/sse', { withCredentials: true });
        source.addEventListener('push-message', e => {
            try {
                recevoir(JSON.parse((e as MessageEvent<string>).data) as MessageRecu);
            } catch {
                /* message illisible */
            }
        });
    }

    function arreterServeur() {
        source?.close();
        source = null;
    }

    return {
        discussions,
        focus,
        demarrer,
        basculer,
        fermer,
        toutFermer,
        restaurer,
        recevoir,
        envoyer,
        ecouterServeur,
        arreterServeur
    };
});
