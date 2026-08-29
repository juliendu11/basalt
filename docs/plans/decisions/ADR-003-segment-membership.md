# ADR-003 — Segment membership computation

## Context

Un segment définit un ensemble dynamique de contacts via des critères (`06-segments.md`). Il faut décider **quand** et **comment** l'appartenance d'un contact à un segment est déterminée, sachant que :

- le Campaign Engine doit savoir "quels contacts sont entrés dans le segment source" pour déclencher un enrollment ;
- l'UI doit afficher rapidement "combien de contacts dans ce segment" et permettre de lister/filtrer les campagnes par segment ;
- un projet peut aller de 1 000 à 1 000 000+ de contacts ;
- les critères peuvent porter sur des champs qui changent rarement (pays) ou souvent (statut, custom fields mis à jour par intégration externe).

## Options

**A. Calcul dynamique permanent** — pas de table de membership ; chaque lecture ("liste des contacts du segment", "un contact est-il dans ce segment ?") exécute la requête SQL dérivée de `definition` à la volée.
- + Toujours exact, zéro latence de fraîcheur, zéro job de recalcul à opérer.
- − Coûteux à volume élevé (1M contacts, filtres multi-conditions) si exécuté à chaque affichage de dashboard ou pire, à chaque contact modifié pour savoir "dans quels segments il vient d'entrer/sortir" (il faudrait réévaluer *tous* les segments du projet à chaque `ContactUpdated`). Rend la détection d'un *changement* de membership (nécessaire pour déclencher un enrollment de campagne) difficile : sans état persisté, on ne peut pas diffé "avant/après".

**B. Table de membership persistée** — `segment_contacts`, recalculée par job (command Adonis / scheduler / queue).
- + Lecture de membership = requête indexée triviale (`WHERE segment_id = ?`), peu coûteuse même à 1M contacts.
- + Le recalcul peut diffé l'ancien set contre le nouveau et émettre des événements `SegmentMembershipAdded`/`SegmentMembershipRemoved` exploitables par le Campaign Engine.
- − La membership a une **latence de fraîcheur** : un contact qui vient de remplir la condition n'apparaît dans le segment qu'après le prochain recalcul.

**C. Hybride** — membership persistée pour tout usage "liste/déclenchement de campagne/stats", mais avec un recalcul déclenché aussi souvent que raisonnable (pas seulement nightly) : recalcul immédiat (job asynchrone, quasi temps réel) sur `ContactCreated`/`ContactUpdated` limité aux segments dont la `definition` référence un champ qui vient de changer, plus un recalcul complet planifié (filet de sécurité, ex. toutes les nuits) pour rattraper les cas non couverts (segments basés sur `created_at < 30 days`, qui évoluent sans qu'aucun contact ne soit "modifié").

## Decision

**Option C (hybride), construite sur la table de membership persistée de l'option B.**

- `segment_contacts` est la source de vérité pour toute lecture (liste, comptage, déclenchement).
- Recalcul **ciblé** et quasi temps réel : à chaque `ContactCreated`/`ContactUpdated`, un listener enqueue un job "réévalue ce contact contre les segments du projet dont `definition` référence un des champs modifiés" (le service de segment maintient une extraction légère des champs référencés par une définition, calculée à la sauvegarde du segment et stockée à côté — voir `06-segments.md`). Ce job est bon marché (un seul contact, quelques segments).
- Recalcul **complet planifié** par segment (command `node ace segments:recompute`, appelée par un scheduler — ex. toutes les nuits, et systématiquement après une édition de `definition`) : traite tous les contacts du projet par lots (voir Performance ci-dessous), remplace la membership, diffé l'ancien/nouveau set et émet les événements de changement.
- Recalcul **manuel à la demande** (bouton "Recalculer" dans l'UI segment) : enqueue le même job complet.

## Reasons

- Le Campaign Engine a besoin d'un signal explicite de changement (`SegmentMembershipAdded`) pour déclencher l'enrollment — une table persistée + diff est le seul moyen simple d'obtenir ce signal sans réévaluer tous les segments à chaque écriture de contact.
- Le recalcul ciblé sur les segments "impactés par les champs modifiés" évite de réévaluer inutilement des segments non concernés (ex. modifier `company` ne doit pas déclencher le recalcul d'un segment filtrant sur `country`), ce qui garde le coût par écriture de contact faible même avec de nombreux segments.
- Le recalcul planifié filet de sécurité couvre les segments basés sur le temps qui écoulé (`created_at < 30 days`) qu'aucun événement contact ne déclenche naturellement.

## Consequences à différentes volumétries

| Volume contacts | Comportement |
|---|---|
| 1 000 | Recalcul complet quasi instantané (< 1s), aucune optimisation particulière nécessaire. |
| 100 000 | Recalcul complet par lots de ~5 000 (curseur sur `contacts.id`), quelques secondes à quelques dizaines de secondes ; recalcul ciblé (1 contact) toujours instantané. |
| 1 000 000 | Recalcul complet obligatoirement par lots + job idempotent/reprenable (voir `15-retry-and-idempotency.md`) ; prévoir un budget de plusieurs minutes ; éviter de le lancer trop fréquemment en planifié (ex. 1x/nuit plutôt que toutes les heures) ; le recalcul ciblé par contact reste la voie rapide pour la réactivité perçue par l'utilisateur. |

## Consequences

- Ajout d'un job `segment.recompute` (paramètres : `segmentId`, `mode: 'full' | 'targeted'`, `contactId?`) — voir `14-jobs-and-queues.md`.
- `segments.contact_count_cache` et `last_computed_at`/`last_computation_status` permettent à l'UI d'afficher un compte "à jour à telle heure" sans recalcul synchrone.
- Le diff ancien/nouveau set pour un recalcul complet à 1M lignes doit être fait en SQL (ex. `INSERT ... SELECT` dans une table temporaire de nouveaux membres, puis `LEFT JOIN` pour trouver les ajouts/retraits) plutôt qu'en chargeant les IDs en mémoire côté Node.

## Risks

- Latence de fraîcheur sur les segments basés sur le temps (jusqu'à la prochaine exécution planifiée) — acceptable pour un cas d'usage marketing (pas de besoin de la seconde près), à documenter clairement dans l'UI ("dernier calcul : il y a 3h").
- Un recalcul complet mal isolé pourrait verrouiller la table `segment_contacts` pendant le remplacement — mitigé en traitant par lots avec des transactions courtes plutôt qu'une seule transaction géante.
