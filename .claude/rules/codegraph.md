# CodeGraph — Règle obligatoire

Avant toute exploration de code, vérifier si `.codegraph/` existe dans le répertoire de travail.

## Si `.codegraph/` existe

Utiliser CodeGraph **en premier** — jamais `grep`, `find`, `rg`, `ls` récursif ou des lectures massives de fichiers.

Un seul outil : `codegraph_explore`. Il prend une question en langage naturel ou un sac de noms de
symboles/fichiers, et retourne en un seul appel le code source des symboles concernés, groupé par
fichier, plus leurs appelants/appelés et le rayon d'impact d'un changement. Il couvre à lui seul
"où est X défini ?", "qu'est-ce qui appelle Y ?", "quel impact si je change Z ?", "montre le code
de Y", "cartographie cette zone", "explore ce module inconnu" et "quels fichiers dans path/".

Règles :

- Faire confiance aux résultats CodeGraph (parsing AST complet). Ne pas re-vérifier avec grep.
- Un seul appel `codegraph_explore` répond généralement à toute la question ; éviter les appels
  répétés pour affiner quand la première réponse couvre déjà le besoin.
- Les lectures directes de fichiers ne sont autorisées qu'**après** une requête CodeGraph, pour vérifier un détail non
  couvert.
- L'index lag ~500ms après une écriture de fichier ; ne pas re-requêter immédiatement après avoir édité.

## Si `.codegraph/` n'existe pas

Ne pas explorer massivement le repo. Demander ou exécuter `codegraph init -i` avant l'analyse, sauf urgence explicite.
