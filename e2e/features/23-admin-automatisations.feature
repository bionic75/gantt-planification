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
