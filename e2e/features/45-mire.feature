# language: fr
Fonctionnalité: Mire de connexion : identifiants mémorisés, profil, mot de passe oublié, lien de réinitialisation, double authentification
  Écrans de la mire du bureau (et de la page mobile) non couverts par 01-authentification et 10-mobile. Les réponses
  de l'API qui enverraient un message (mot de passe oublié, code par e-mail) ou qui dépendent de la configuration de la
  double authentification sont simulées : aucun message n'est envoyé, aucune configuration n'est modifiée.

  Scénario: Identifiants utilisés sur ce poste : proposés, oubliés, choisis
    Étant donné que le navigateur ne propose pas son gestionnaire de mots de passe
    Et que ce poste a déjà servi aux identifiants "e2e.mire.alpha" et "e2e.mire.beta"
    Quand j'ouvre la mire de connexion
    Et je saisis "e2e.mire" dans le champ "Identifiant" de la mire
    Alors la mire propose les identifiants "e2e.mire.alpha" et "e2e.mire.beta"
    Quand j'oublie l'identifiant proposé "e2e.mire.beta"
    Alors la mire propose seulement l'identifiant "e2e.mire.alpha"
    Quand je choisis l'identifiant proposé "e2e.mire.alpha"
    Alors le champ "Identifiant" de la mire contient "e2e.mire.alpha"
    Et la mire ne propose plus d'identifiant

  Scénario: Mot de passe affiché puis masqué
    Quand j'ouvre la mire de connexion
    Et je saisis "Un-mot-de-passe-1!" dans le champ "Mot de passe" de la mire
    Et je clique sur le bouton d'affichage du mot de passe
    Alors le mot de passe saisi est lisible
    Quand je clique sur le bouton d'affichage du mot de passe
    Alors le mot de passe saisi est masqué

  Scénario: Compte à plusieurs profils : profil à choisir après vérification du mot de passe
    Étant donné qu'un compte de test a les profils Expert et Utilisateur
    Quand j'ouvre la mire de connexion
    Et je saisis les identifiants du compte de test et valide la mire
    Alors la mire propose les profils "Expert Métier" et "Utilisateur"
    Et le bouton de la mire devient "Se connecter"
    Quand je valide la mire sans choisir de profil
    Alors la mire affiche l'erreur "Veuillez sélectionner un profil"

  Scénario: Mot de passe oublié : identifiant repris, identifiant requis, fenêtre annulée
    Quand j'ouvre la mire de connexion
    Et je saisis "e2e.mire.oubli" dans le champ "Identifiant" de la mire
    Et je clique sur « Mot de passe oublié ? »
    Alors la fenêtre « Mot de passe oublié » reprend l'identifiant "e2e.mire.oubli"
    Quand je vide l'identifiant de la fenêtre « Mot de passe oublié » et demande l'envoi
    Alors la fenêtre « Mot de passe oublié » signale "Veuillez entrer votre identifiant"
    Quand j'annule la fenêtre « Mot de passe oublié »
    Alors la fenêtre « Mot de passe oublié » est fermée

  Scénario: Mot de passe oublié : demande acceptée puis délai avant une nouvelle demande (réponse simulée)
    Étant donné que la demande de mot de passe oublié sera acceptée (réponse simulée)
    Quand j'ouvre la mire de connexion
    Et je saisis "e2e.mire.oubli" dans le champ "Identifiant" de la mire
    Et je clique sur « Mot de passe oublié ? »
    Et je demande l'envoi du lien de réinitialisation
    Alors la fenêtre « Mot de passe oublié » signale "Si un compte actif correspond"
    Et le bouton d'envoi indique "Réessayer dans" et reste désactivé

  Scénario: Lien de réinitialisation invalide
    Quand j'ouvre l'application avec un lien de réinitialisation invalide
    Alors la fenêtre « Choisir un nouveau mot de passe » signale "Lien de réinitialisation invalide ou expiré" sans formulaire
    Et le jeton n'apparaît plus dans l'adresse de la page
    Quand je ferme la fenêtre « Choisir un nouveau mot de passe »
    Alors la mire de connexion est affichée

  Scénario: Lien de réinitialisation : confirmation différente, puis mot de passe enregistré (réponses simulées)
    Étant donné que le lien de réinitialisation sera accepté (réponses simulées)
    Quand j'ouvre l'application avec ce lien de réinitialisation
    Alors la fenêtre « Choisir un nouveau mot de passe » présente la règle "Règle : 8 caractères minimum."
    Quand je saisis le nouveau mot de passe "Nouveau-E2E-2026!" et la confirmation "Autre-E2E-2026!"
    Alors la fenêtre « Choisir un nouveau mot de passe » signale "Les deux mots de passe ne correspondent pas"
    Quand je saisis le nouveau mot de passe "Nouveau-E2E-2026!" et la confirmation "Nouveau-E2E-2026!"
    Alors la fenêtre « Choisir un nouveau mot de passe » signale "Mot de passe modifié (simulation)" sans formulaire
    Et le nouveau mot de passe a été envoyé avec le jeton du lien

  Scénario: Double authentification : choix de la méthode, puis annulation
    Étant donné que la connexion demandera le choix de la méthode de double authentification (réponse simulée)
    Quand j'ouvre la mire de connexion
    Et je saisis des identifiants de test et valide la mire
    Alors la mire propose un code par e-mail ou une application d'authentification
    Quand j'annule la double authentification
    Alors la mire de connexion est affichée avec le mot de passe vidé

  Scénario: Double authentification par e-mail : code renvoyé, code refusé (réponses simulées)
    Étant donné que la connexion demandera un code par e-mail (réponses simulées)
    Quand j'ouvre la mire de connexion
    Et je saisis des identifiants de test et valide la mire
    Alors la mire indique qu'un code a été envoyé par e-mail
    Quand je demande un nouveau code
    Alors la mire confirme l'envoi du nouveau code
    Et le serveur a reçu 2 demandes d'envoi de code
    Quand je saisis le code de vérification "123456" et le valide
    Alors la mire signale l'erreur de code "Code invalide ou expiré"

  Scénario: Mise en place de l'application d'authentification, puis annulation (réponses simulées)
    Étant donné que la connexion demandera de configurer une application d'authentification (réponses simulées)
    Quand j'ouvre la mire de connexion
    Et je saisis des identifiants de test et valide la mire
    Alors la mire présente le QR code et la clé "JBSWY3DPEHPK3PXP"
    Quand je saisis le code de mise en place "12" et le confirme
    Alors la mire signale l'erreur de mise en place "Le code doit contenir 6 chiffres"
    Quand j'annule la mise en place de l'application d'authentification
    Alors la mire de connexion est affichée avec le mot de passe vidé

  Scénario: Page mobile : mise en place de l'application d'authentification proposée (réponses simulées)
    Étant donné que la connexion mobile demandera de configurer une application d'authentification (réponses simulées)
    Quand j'ouvre la page mobile sans être connecté
    Et je saisis des identifiants de test et valide la mire
    Alors la mire présente le QR code et la clé "JBSWY3DPEHPK3PXP"
    Quand j'annule la mise en place de l'application d'authentification
    Alors la mire mobile est affichée avec le mot de passe vidé

  Scénario: Page mobile : mot de passe à changer d'abord depuis un ordinateur (réponse simulée)
    Étant donné que la connexion mobile sera refusée tant que le mot de passe n'est pas changé (réponse simulée)
    Quand j'ouvre la page mobile sans être connecté
    Et je saisis des identifiants de test et valide la mire
    Alors la mire mobile signale "Mot de passe à changer : connectez-vous une première fois depuis un ordinateur pour choisir votre mot de passe."