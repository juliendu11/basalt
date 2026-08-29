# CodeGraph — Règle obligatoire

Avant toute exploration de code, vérifier si `.codegraph/` existe dans le répertoire de travail.

## Si `.codegraph/` existe

Utiliser CodeGraph **en premier** — jamais `grep`, `find`, `rg`, `ls` récursif ou des lectures massives de fichiers.

| Question                            | Outil               |
|-------------------------------------|---------------------|
| "Où est X défini ?"                 | `codegraph_search`  |
| "Qu'est-ce qui appelle Y ?"         | `codegraph_callers` |
| "Que fait Y ?"                      | `codegraph_callees` |
| "Quel impact si je change Z ?"      | `codegraph_impact`  |
| "Montre le code de Y"               | `codegraph_node`    |
| "Cartographie cette zone / feature" | `codegraph_context` |
| "Explore ce module inconnu"         | `codegraph_explore` |
| "Quels fichiers dans path/"         | `codegraph_files`   |

Règles :

- Faire confiance aux résultats CodeGraph (parsing AST complet). Ne pas re-vérifier avec grep.
- Ne pas chaîner `codegraph_search` + `codegraph_node` quand `codegraph_context` suffit.
- Les lectures directes de fichiers ne sont autorisées qu'**après** une requête CodeGraph, pour vérifier un détail non
  couvert.
- L'index lag ~500ms après une écriture de fichier ; ne pas re-requêter immédiatement après avoir édité.

## Si `.codegraph/` n'existe pas

Ne pas explorer massivement le repo. Demander ou exécuter `codegraph init -i` avant l'analyse, sauf urgence explicite.
