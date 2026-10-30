# language: fr
@administration
Fonctionnalité: Administration › Sécurité et messagerie (écran)
  Configuration SMTP, double authentification et gestion des API depuis l'onglet Administration.
  Paramètres globaux, partagés avec les fonctionnalités exécutées en parallèle : aucun scénario n'active ni ne
  désactive la double authentification, n'en change la méthode ou les profils (connexions des autres scénarios), ni
  ne confirme la réinitialisation du MFA de tous les utilisateurs (secrets TOTP des comptes de test). Les valeurs
  modifiées sont rétablies en fin de scénario ; les clés d'API créées sont supprimées.

  Contexte:
    Étant donné que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"

  # ---------- Configuration Email (SMTP) ----------

  Scénario: SMTP : configuration affichée, mot de passe jamais réaffiché
    Quand j'ouvre la section "Configuration Email (SMTP)"
    Alors la configuration SMTP affichée est celle enregistrée
    Et le champ mot de passe SMTP est vide et indique qu'un mot de passe est enregistré

  Scénario: SMTP : enregistrement sans ressaisir le mot de passe
    Étant donné que la configuration SMTP sera rétablie après le scénario
    Quand j'ouvre la section "Configuration Email (SMTP)"
    Et j'enregistre la configuration SMTP
    Alors une alerte affiche "Configuration email sauvegardée"
    Et la configuration SMTP enregistrée est inchangée, avec un mot de passe toujours enregistré

  Scénario: SMTP : champs obligatoires
    Étant donné que la configuration SMTP sera rétablie après le scénario
    Quand j'ouvre la section "Configuration Email (SMTP)"
    Et je vide l'e-mail expéditeur SMTP
    Et j'enregistre la configuration SMTP
    Alors une alerte affiche "Tous les champs sont requis"
    Et la configuration SMTP enregistrée est inchangée, avec un mot de passe toujours enregistré

  # L'e-mail de test part vers le compte SMTP configuré (jamais un SMTP de production)
  @smtp
  Scénario: SMTP : envoi d'un e-mail de test depuis l'écran
    Quand j'ouvre la section "Configuration Email (SMTP)"
    Et je clique sur le bouton "Tester l'envoi"
    Alors une alerte affiche "Email de test envoyé avec succès"

  # ---------- Double authentification ----------

  Scénario: MFA : l'écran présente la configuration enregistrée
    Quand j'ouvre la section "Authentification à deux facteurs (MFA)"
    Alors la configuration MFA affichée est celle enregistrée

  Scénario: MFA : changement de la durée de validité du code
    Étant donné que la configuration MFA sera rétablie après le scénario
    Quand j'ouvre la section "Authentification à deux facteurs (MFA)"
    Et je choisis une autre durée de validité du code e-mail
    Alors la durée de validité enregistrée est celle choisie, le reste de la configuration MFA est inchangé

  Scénario: MFA : réinitialisation de tous les utilisateurs annulée
    Quand j'ouvre la section "Authentification à deux facteurs (MFA)"
    Et je demande la réinitialisation du MFA de tous les utilisateurs puis j'annule
    Alors la confirmation signalait "Tous les utilisateurs devront reconfigurer leur authentification TOTP"
    Et aucune réinitialisation du MFA n'a été envoyée au serveur

  # ---------- Gestion des API ----------

  Scénario: Clé d'API : génération, utilisation puis révocation
    Quand j'ouvre la section "Gestion des API"
    Et je génère une clé d'API
    Alors la nouvelle clé est affichée une seule fois et donne accès à l'API publique des événements
    Et la liste des clés présente la nouvelle clé « Active » avec son préfixe
    Quand je révoque la nouvelle clé et je confirme
    Alors la liste des clés présente la nouvelle clé « Révoquée »
    Et l'API publique des événements refuse la nouvelle clé

  Scénario: Clé d'API : libellé obligatoire
    Quand j'ouvre la section "Gestion des API"
    Et je génère une clé d'API sans libellé
    Alors une alerte affiche "Veuillez saisir un libellé pour la clé."

  Scénario: Asana : état du jeton et jeton vide refusé
    Quand j'ouvre la section "Gestion des API"
    Alors l'état du jeton Asana affiché correspond à la configuration
    Quand j'enregistre un jeton Asana vide
    Alors le message Asana indique "Collez le jeton avant d'enregistrer."

  Scénario: Asana : filtre sur le nom des projets
    Étant donné que le filtre Asana sera rétabli après le scénario
    Quand j'ouvre la section "Gestion des API"
    Et j'enregistre le filtre Asana "\[E2E \d+\]"
    Alors le message Asana indique "Filtre enregistré."
    Et le filtre Asana enregistré est "\[E2E \d+\]"
