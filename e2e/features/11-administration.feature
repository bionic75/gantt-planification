# language: fr
@administration
Fonctionnalité: Administration
  Les paramètres globaux modifiés par un scénario (thème, couleurs, modèle de nom, automatisations) sont rétablis
  à leur valeur d'origine en fin de scénario.

  Scénario: Gestion des localisations
    Quand l'administrateur crée une localisation avec le libellé long "E2E Lieu", le libellé court "e2e" et l'adresse "1 rue du test"
    Alors la réponse a le statut 200
    Et la localisation est enregistrée en majuscules avec son adresse
    Quand l'administrateur crée une localisation avec le même libellé long
    Alors la réponse a le statut 409
    Quand l'administrateur modifie le libellé court de la localisation en "e2f"
    Alors la localisation a le libellé court "E2F"
    Quand l'administrateur crée un événement sur la localisation le "2031-06-10"
    Alors l'usage de la localisation indique 1 événement rattaché
    Quand l'administrateur supprime la localisation
    Alors la localisation n'existe plus

  @destructif
  Scénario: Dump complet et restauration
    Étant donné qu'une ressource standard existe
    Quand l'administrateur génère un dump complet
    Et l'administrateur supprime la ressource
    Et l'administrateur restaure le dump
    Alors la restauration est acceptée après contrôle de la taille, de la version et de la date
    Et la ressource existe de nouveau après reconnexion

  Scénario: Dump : fichier invalide refusé
    Quand l'administrateur soumet un fichier corrompu à la restauration
    Alors la réponse a le statut 400
    Et le message d'erreur est explicite

  Scénario: Thèmes saisonniers et mode sombre
    Étant donné que le thème de l'application sera rétabli après le scénario
    Quand l'administrateur impose le thème "paques"
    Alors le thème "paques" est appliqué pour tous, y compris sur la mire de connexion
    Quand l'administrateur impose le thème "halloween"
    Alors le thème "halloween" est appliqué pour tous, y compris sur la mire de connexion
    Quand "Administrateur" ouvre l'application
    Et je bascule le mode sombre
    Alors l'application est en mode sombre
    Quand je recharge la page
    Alors l'application est en mode sombre
    Quand je bascule le mode sombre
    Alors l'application n'est plus en mode sombre

  Scénario: Modèle de nom des fichiers d'export
    Étant donné que le modèle de nom des exports sera rétabli après le scénario
    Quand l'administrateur définit le modèle de nom "Planning_{AAAAMMJJ}_{HHMM}"
    Alors le modèle de nom des exports est "Planning_{AAAAMMJJ}_{HHMM}"
    Quand l'administrateur définit le modèle de nom ""
    Alors le modèle de nom des exports est le modèle par défaut

  @manuel
  Scénario: Modèle PowerPoint importé
    Étant donné un fichier .pptx de modèle
    Quand j'importe le modèle puis exporte le planning
    Alors le modèle est utilisé (page de garde et de fin)

  Scénario: Paramétrage couleurs et motifs des étapes
    Étant donné que les couleurs et motifs des étapes seront rétablis après le scénario
    Quand l'administrateur choisit la couleur "#ABCDEF" et le motif "dots" pour l'étape "vft"
    Alors l'étape "vft" a la couleur "#abcdef" et le motif "dots"
    Quand l'administrateur choisit la couleur "vert" pour l'étape "vft"
    Alors la réponse a le statut 400
    Quand l'administrateur choisit le motif "pois" pour l'étape "vft"
    Alors la réponse a le statut 400

  Scénario: Paramétrage SMTP : mot de passe jamais réaffiché
    Quand l'administrateur consulte la configuration SMTP
    Alors la réponse a le statut 200
    Et la configuration SMTP ne contient pas le mot de passe en clair
    Et la configuration SMTP indique qu'un mot de passe est enregistré

  # L'e-mail de test part vers le compte SMTP configuré (jamais un SMTP de production)
  @smtp
  Scénario: Paramétrage SMTP et envoi de test
    Quand l'administrateur envoie un e-mail de test
    Alors la réponse a le statut 200
    Et l'envoi de l'e-mail de test est confirmé

  @smtp
  Scénario: Paramétrage SMTP : enregistrement sans ressaisir le mot de passe
    Quand l'administrateur réenregistre la configuration SMTP sans ressaisir le mot de passe
    Alors la réponse a le statut 200
    Quand l'administrateur envoie un e-mail de test
    Alors l'envoi de l'e-mail de test est confirmé

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

  Scénario: Aide en ligne et notes de version
    Quand j'ouvre l'aide en ligne
    Alors l'aide en ligne contient les notes de version jusqu'à la version courante de l'application
    Et la dernière version porte le badge « Actuelle »
