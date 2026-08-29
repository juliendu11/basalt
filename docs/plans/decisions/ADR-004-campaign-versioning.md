# ADR-004 — Campaign versioning

## Context

Une campagne est éditée visuellement dans le temps. Il faut empêcher qu'une modification du canvas (ajout/suppression de node, changement de condition) ne corrompe le parcours de contacts déjà engagés dans l'exécution de cette campagne — cf. Scénario 4 de `init.md` ("Campaign is edited while 10 000 contacts are already inside it").

## Options

**A. Pas de versioning — une seule définition mutable par campagne.**
- + Le plus simple à implémenter.
- − Toute édition du graphe change immédiatement le comportement pour les contacts en cours d'exécution : un contact "en attente au node 5" pourrait se retrouver à pointer vers un node supprimé, ou une condition modifiée change rétroactivement un choix déjà fait. Inacceptable pour la fiabilité (priorité #1).

**B. Versioning complet (`campaign_versions` avec draft/published/archived), un enrollment pointe vers la version publiée au moment de son entrée.**
- + Une édition en cours (draft) n'affecte jamais les exécutions en cours, qui continuent sur la version publiée au moment de leur enrollment.
- + Historique complet : on peut inspecter "sur quelle version tournait ce contact" a posteriori (debugging, audit).
- − Nécessite de cloner nodes/edges à chaque nouveau draft issu d'une version publiée (coût de stockage/complexité modérée, acceptable).

## Decision

**Option B.** Chaque `campaign` a au plus un `draft` (`campaigns.draft_version_id`) et au plus un `published` (`campaigns.published_version_id`) parmi ses `campaign_versions` ; les versions précédemment publiées passent en `archived` lors d'une nouvelle publication (jamais supprimées).

### Cycle de vie

```text
Campaign créée
  → CampaignVersion #1 (status=draft) créée automatiquement, campaigns.draft_version_id = #1

Édition du canvas
  → modifie uniquement CampaignVersion #1 (draft) — aucun impact sur des exécutions existantes
    (il n'y en a pas encore, la campagne n'est pas encore publiée)

Publication ("Activer la campagne")
  → CampaignVersion #1 : status draft → published, published_at = now
  → campaigns.published_version_id = #1, campaigns.status = active
  → campaigns.draft_version_id = null (pas de draft tant que personne n'édite à nouveau)

Nouvelle édition après publication
  → clone de CampaignVersion #1 (nodes + edges) vers CampaignVersion #2 (status=draft)
  → campaigns.draft_version_id = #2 ; CampaignVersion #1 reste published et continue de piloter
    les enrollments existants ET les nouveaux enrollments, jusqu'à republication

Republication
  → CampaignVersion #1 : published → archived
  → CampaignVersion #2 : draft → published, published_at = now
  → campaigns.published_version_id = #2, campaigns.draft_version_id = null
  → les nouveaux enrollments utilisent désormais #2 ; les enrollments déjà créés sur #1
    restent sur #1 jusqu'à leur sortie/fin (voir Consequences)
```

Une `campaign_enrollment.campaign_version_id` est écrite une seule fois, à la création de l'enrollment, et n'est **jamais modifiée** : "les contacts existants continuent sur Version 3 alors que les nouveaux utilisent Version 4" (cf. `init.md`).

## Reasons

- C'est la seule option qui satisfait la contrainte explicite du produit ("un changement effectué sur le canvas ne doit pas automatiquement corrompre les contacts déjà engagés") sans complexité disproportionnée (pas d'event sourcing complet, juste un clonage de graphe à la demande).
- Garder les versions `archived` (jamais supprimées) donne un historique exploitable pour le debugging ("pourquoi ce contact a reçu cet email précis ?") et pour l'audit.

## Consequences

- Le contenu d'un `Email` référencé par un node `send_email` doit lui aussi être **figé** au moment de la publication (pas seulement le graphe) — sinon éditer un `Email` après publication changerait rétroactivement ce qu'envoie une campagne déjà active pour des contacts en cours. Décision complémentaire : au moment où `CampaignBuilderService.publish()` fige une version, le `config` JSON de chaque node `send_email` reçoit une **copie** (`subject`, `htmlContent`, `textContent`, `senderName`, `senderEmail`, `replyTo`) de l'`Email` référencé, en plus de `emailId` (gardé pour l'affichage/édition UI, jamais relu pour l'envoi réel). Le Campaign Engine n'utilise **que** cette copie figée pour composer l'email envoyé, jamais l'état courant de l'`Email`. Voir `09-emails.md` § Idempotency/versioning et `12-campaign-engine.md`.
- Une campagne ne peut pas être "dépubliée" en éditant simplement le draft : passer de `active` à `paused`/`archived` est une transition d'état de campagne distincte du versioning (voir `10-campaigns.md` § État d'une campagne), indépendante du cycle draft/published/archived des versions.
- Le service de sauvegarde du builder doit toujours écrire dans `campaigns.draft_version_id`, jamais directement dans la version `published` — contrainte à faire respecter au niveau service (pas seulement UI), par exemple en refusant toute écriture sur une `campaign_version` dont `status != 'draft'`.

## Risks

- Deux enrollments d'un même contact sur deux versions différentes de la même campagne (ex. sorti de v1, ré-entré après republication sur v2) doivent être des lignes distinctes dans `campaign_enrollments` (couvert par la contrainte `UNIQUE (campaign_id, contact_id, campaign_version_id)`), pas une mise à jour de la ligne existante — sinon perte d'historique. Voir `13-campaign-enrollment.md`.
- Le clonage nodes/edges à chaque nouveau draft doit être transactionnel (tout ou rien) pour éviter un draft partiellement cloné en cas de crash pendant l'opération.
