# language: fr
@administration
Fonctionnalité: Administration › Automatisations et rappels
  Configuration des automatisations, historiques, tests sans envoi, diagnostic et aperçu du nettoyage des données.
  Aucun scénario n'envoie de message : les tests s'arrêtent à la recherche des experts (n°1) ou au récapitulatif
  (n°2), annulé ; le nettoyage n'est jamais exécuté ; l'historique n'est jamais vidé (confirmation refusée).
  Les configurations modifiées sont rétablies en fin de scénario ; l'activation n'est jamais changée depuis l'écran.
  Tous les scénarios qui modifient une configuration d'automatisation sont dans cette fonctionnalité (exécutée sur un
  seul worker : jamais deux modifications en même temps).

  # ---------- N°1 : rappel de saisie des disponibilités ----------

  Scénario: Automatisation n°1 : configuration affichée et modifiée
    Étant donné que la configuration de l'automatisation 1 est conservée pour être rétablie après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 1
    Alors l'automatisation 1 affiche sa configuration enregistrée
    Quand je choisis de rappeler "10 jours" avant la fin du mois
    Alors l'automatisation 1 est enregistrée avec 10 jours, son activation et sa copie inchangées

  Scénario: Automatisation n°1 : test sans envoi
    Étant donné que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 1
    Et je lance le test de l'automatisation 1
    Alors le test de l'automatisation 1 présente les experts sans disponibilités du mois prochain
    Quand je ferme le test de l'automatisation 1 sans envoyer de rappel
    Alors aucun rappel n'a été envoyé

  Scénario: Automatisation n°1 : historique des envois, vidage refusé
    Étant donné que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 1
    Et j'ouvre l'historique des envois de l'automatisation 1
    Alors l'historique « Historique des envois de rappels » présente les envois enregistrés de l'automatisation 1
    Quand je refuse de vider l'historique
    Alors l'historique de l'automatisation 1 est conservé
    Quand je ferme l'historique

  # ---------- N°2 : sauvegarde des plannings ----------

  Scénario: Automatisation n°2 : configuration affichée et fréquence modifiée
    Étant donné que la configuration de l'automatisation 2 est conservée pour être rétablie après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 2
    Alors l'automatisation 2 affiche sa configuration enregistrée
    Quand je choisis la fréquence "Toutes les semaines" et le jour "Mercredi"
    Alors l'automatisation 2 est enregistrée chaque semaine le jour "3", ses autres paramètres inchangés

  Scénario: Automatisation n°2 : récapitulatif du test, envoi annulé
    Étant donné que la configuration de l'automatisation 2 est conservée pour être rétablie après le scénario
    Et que l'automatisation 2 est configurée pour les administrateurs, toutes les données et tous les experts
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 2
    Et je lance le test de l'automatisation 2
    Alors le récapitulatif de la sauvegarde présente les destinataires, les experts, le format et les lignes vides
    Quand j'annule l'envoi de la sauvegarde
    Alors aucune sauvegarde n'a été envoyée

  Scénario: Automatisation n°2 : test sans destinataire refusé
    Étant donné que la configuration de l'automatisation 2 est conservée pour être rétablie après le scénario
    Et que l'automatisation 2 est configurée sans destinataire
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 2
    Et je lance le test de l'automatisation 2
    Alors le test de l'automatisation 2 indique "Veuillez sélectionner au moins un destinataire"

  Scénario: Automatisation n°2 : historique, diagnostic des mois et aperçu du nettoyage
    Étant donné que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 2
    Et j'ouvre l'historique des envois de l'automatisation 2
    Alors l'historique « Historique des sauvegardes de planning » présente les envois enregistrés de l'automatisation 2
    Quand je ferme l'historique
    Et je lance le diagnostic des mois
    Alors le diagnostic présente les mois trouvés en base
    Quand je ferme l'historique
    Et je prévisualise le nettoyage des données invalides
    Alors l'aperçu du nettoyage présente les suppressions et normalisations prévues
    Quand j'annule le nettoyage
    Alors la fenêtre du nettoyage est fermée

  # ---------- N°3 : notifications Teams ----------
  # Configuration visible seulement si l'automatisation est active : activée par l'API avec une adresse fictive
  # (domaine .invalid) et aucun type de notification, puis rétablie ; le message de test n'est jamais envoyé

  Scénario: Automatisation n°3 : configuration affichée, adresse et types de notifications modifiés
    Étant donné que la configuration de l'automatisation 3 est conservée pour être rétablie après le scénario
    Et que l'automatisation 3 est active avec une adresse Teams fictive et sans type de notification
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 3
    Alors l'automatisation 3 affiche sa configuration enregistrée
    Quand je coche la notification Teams "Demande d'affectation reçue"
    Alors l'automatisation 3 est enregistrée avec les notifications "demande"
    Quand je remplace l'adresse du canal Teams par une autre adresse fictive
    Alors l'automatisation 3 est enregistrée avec la nouvelle adresse fictive

  Scénario: Automatisation n°3 : historique conservé et test refusé sans adresse
    Étant donné que la configuration de l'automatisation 3 est conservée pour être rétablie après le scénario
    Et que l'automatisation 3 est active avec une adresse Teams fictive et sans type de notification
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 3
    Et j'ouvre l'historique des envois de l'automatisation 3
    Alors l'historique « Historique des notifications Teams » présente les envois enregistrés de l'automatisation 3
    Quand je refuse de vider l'historique des notifications Teams
    Alors l'historique de l'automatisation 3 est conservé
    Quand je ferme l'historique
    Et j'efface l'adresse du canal Teams puis j'envoie un test
    Alors le test Teams indique "Veuillez renseigner l'adresse email du canal Teams"

  # ---------- N°4 : workflow CRA ----------

  Scénario: Automatisation n°4 : configuration affichée et jour de déclenchement modifié
    Étant donné que la configuration de l'automatisation 4 est conservée pour être rétablie après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 4
    Alors l'automatisation 4 affiche sa configuration enregistrée, les viseurs RH et les experts d'astreinte
    Quand je choisis le jour de déclenchement "27"
    Alors l'automatisation 4 est enregistrée le jour 27, ses viseurs et son activation inchangés

  # ---------- N°5 et n°6 : astreintes HO ----------

  Scénario: Automatisations n°5 et n°6 : configurations affichées et modifiées
    Étant donné que la configuration de l'automatisation 5 est conservée pour être rétablie après le scénario
    Et que la configuration de l'automatisation 6 est conservée pour être rétablie après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Automatisations et rappels"
    Quand je développe l'automatisation 5
    Et je développe l'automatisation 6
    Alors les automatisations 5 et 6 affichent leur configuration enregistrée et les champs disponibles
    Quand je choisis l'heure d'envoi "21:00" de l'automatisation 5
    Alors l'automatisation 5 indique "Configuration enregistrée"
    Et l'automatisation 5 est enregistrée à 21 h, ses autres paramètres inchangés
    Quand je choisis de communiquer la "Semaine suivante" dans l'automatisation 6
    Alors l'automatisation 6 indique "Configuration enregistrée"
    Et l'automatisation 6 est enregistrée pour la semaine suivante, ses autres paramètres inchangés

  # ---------- Activation (API) ----------

  # Activation brève sur l'environnement de test : SMTP de test exigé (jamais de production)
  @smtp
  Plan du scénario: Automatisations (<numéro>)
    Étant donné que la configuration de l'automatisation <numéro> sera rétablie après le scénario
    Quand l'administrateur bascule l'activation de l'automatisation <numéro>
    Alors l'activation de l'automatisation <numéro> est inversée et ses autres paramètres sont conservés

    Exemples:
      | numéro |
      | 1      |
      | 2      |
      | 3      |
      | 4      |
