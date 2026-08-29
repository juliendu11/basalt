# ADR-001 — Campaign graph storage

## Context

Une campagne est représentée par un graphe (nodes + edges) construit visuellement. Il faut décider comment le persister :

- Le moteur d'exécution doit pouvoir retrouver "le nœud courant" et "les nœuds suivants" pour chaque contact en cours de campagne, potentiellement pour des centaines de milliers de contacts en parallèle.
- Le canvas doit pouvoir charger/sauvegarder le graphe entier en un aller-retour.
- Le graphe doit être versionnable (draft vs published) sans dupliquer massivement de données.
- Le format doit pouvoir évoluer (nouveaux types de nodes) sans migration de données destructive.

## Options

**A. JSON pur** — une colonne `graph` (json) sur `campaign_versions` contenant `{ nodes: [...], edges: [...] }`.
- + Simple à sauvegarder/charger en un bloc, correspond 1:1 au modèle du canvas (Vue Flow-like).
- − Le moteur doit parser tout le JSON à chaque étape d'exécution pour retrouver un seul nœud/ses successeurs ; aucune requête SQL indexée possible sur "quel node suit le node X" ; difficile de faire des stats "combien de nodes de type send_email existent" sans parser côté application ; les migrations de format (renommer un champ de config) nécessitent des scripts de réécriture JSON plutôt qu'une migration SQL classique.

**B. Tables relationnelles pures** — `campaign_nodes(type, subtype, ...toutes les colonnes possibles...)`, `campaign_edges`.
- + Requêtable, indexable, chaque type de node a des colonnes typées.
- − Les subtypes ont des configurations très différentes (un `wait` a une durée, un `condition` a un champ+opérateur+valeur, un `send_email` a un email figé) → soit une table gigantesque avec beaucoup de colonnes nullable selon le type, soit une table par subtype (explosion du nombre de tables, jointures complexes pour reconstituer le graphe).

**C. Hybride (relationnel + JSON leaf)** — `campaign_nodes(type, subtype, config json)`, `campaign_edges(source_node_id, target_node_id, source_handle)`.
- + Le squelette du graphe (quels nodes, quelles connexions, dans quel ordre) est relationnel : le moteur peut requêter "les edges sortants du node X" avec un index SQL classique, sans rien parser. La partie variable par subtype (`config`) reste JSON, chargée seulement quand ce node précis est exécuté (pas besoin de charger tout le graphe pour avancer un contact).
- + Les stats/impact ("combien de send_email dans ce projet ?") sont des requêtes SQL simples sur `subtype`.
- + Le canvas peut toujours charger/sauvegarder "tout le graphe d'une version" en une requête (`campaign_nodes.where('campaignVersionId', ...)` + `campaign_edges` associés), donc l'expérience d'édition reste aussi simple qu'avec du JSON pur.
- − Une sauvegarde du canvas doit être traduite en un diff de lignes (nodes/edges ajoutés/modifiés/supprimés) plutôt qu'un simple `UPDATE` d'une colonne JSON — légèrement plus de code côté service de sauvegarde.

## Decision

**Option C (hybride)** : `campaign_nodes` et `campaign_edges` relationnels, avec une colonne `config` (json) sur `campaign_nodes` pour le payload spécifique au `subtype`. Détail des colonnes dans `02-database-design.md`.

## Reasons

- Le moteur d'exécution (`12-campaign-engine.md`) a besoin de traverser le graphe nœud par nœud, potentiellement pour un très grand nombre de contacts simultanément — une requête indexée `campaign_edges.where('sourceNodeId', currentNodeId)` est nettement plus efficace et plus simple à raisonner (et à tester) qu'un parsing JSON répété.
- Le versioning (`decisions/ADR-004-campaign-versioning.md`) copie l'intégralité des nodes/edges d'une version à l'autre lors d'un "republish from draft" ; faire ce clonage en SQL (`INSERT ... SELECT`) est direct avec des tables relationnelles, plus verbeux avec du JSON.
- Le "format interne des workflows" peut évoluer : `graph_format_version` sur `campaign_versions` permet d'introduire un nouveau schéma de `config` par subtype sans toucher au squelette relationnel.

## Consequences

- Le service de sauvegarde du canvas (`CampaignBuilderService.saveDraft()`) doit diffé le payload reçu du frontend (liste de nodes/edges avec leurs `client_key`) contre l'état actuel en base et appliquer des upserts/deletes, dans une transaction.
- Toute lecture "graphe complet" (pour l'affichage canvas) doit recharger nodes + edges en 2 requêtes et les réassembler côté service/frontend — prévoir un transformer dédié (`CampaignGraphTransformer`) plutôt que de sérialiser les modèles bruts.
- Le contenu de `config` n'est pas validé par des contraintes SQL : la validation de forme (ex. "un node `wait` doit avoir `durationMinutes` un entier positif") se fait en application, par un validator VineJS discriminé par `subtype` (voir `11-campaign-builder.md`).

## Risks

- Risque de dérive de schéma JSON non documentée si les subtypes ne sont pas strictement validés à l'écriture → mitigé par la validation VineJS par subtype et par des tests fixtures par subtype (`21-testing-strategy.md`).
- Risque de sur-normalisation prématurée si de nombreux subtypes finissent par partager les mêmes champs (ex. plusieurs actions ont toutes besoin d'un `delayBeforeMs`) → réévaluer si un pattern récurrent apparaît après quelques subtypes ; pas anticipé en v1.
