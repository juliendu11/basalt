# 11 — Campaign Builder (canvas)

## Objective

Documenter l'architecture du constructeur visuel de campagnes (nodes/edges) : sauvegarde du graphe, synchronisation frontend/backend, validation, et le choix de librairie pour le canvas. **Ne pas implémenter le canvas lui-même dans cette phase** (cf. `init.md` — "Ne l'implémente pas maintenant. Conçois son architecture.").

## Functional requirements

- Éditeur visuel drag-and-drop : ajouter/déplacer/connecter/supprimer des nodes.
- Catégories de nodes : `source`, `action`, `condition`, `trigger` (voir Domain concepts pour les subtypes v1).
- Sauvegarde du draft courant (auto-save périodique + sauvegarde explicite).
- Validation du graphe avant publication (voir Validation).
- Panneau de configuration contextuel par node sélectionné (formulaire spécifique au `subtype`).
- Historique de versions en lecture seule (voir la version publiée précédente, sans pouvoir l'éditer directement).

## User flows

```text
Ouverture du builder (campaigns.builder) sur une campagne
  → charge campaigns.draft_version_id (le crée si absent : clone depuis published, cf.
    decisions/ADR-004-campaign-versioning.md, ou vide si aucune version published)
  → CampaignGraphTransformer sérialise { nodes: [...], edges: [...] } vers le frontend

Édition dans le canvas (état local Vue/librairie de canvas)
  → auto-save debounced (ex. 2s après la dernière modification) : POST du diff complet du graphe
  → CampaignBuilderService.saveDraft(version, payload) applique upserts/deletes en transaction

Sélection d'un node → panneau de configuration
  → formulaire spécifique au subtype (ex. "wait" : durée ; "condition_field" : champ+opérateur+valeur ;
    "send_email" : sélection d'un Email existant)
  → mise à jour de campaign_nodes.config au prochain auto-save

Publication → voir 10-campaigns.md (CampaignsController.activate), qui appelle
  CampaignBuilderService.publish(draftVersion) après validation du graphe
```

## Domain concepts

**Catégories et subtypes v1** :

```text
source
  segment              config: { segmentId }

action
  send_email           config: { emailId, subject, htmlContent, textContent, senderName,
                                  senderEmail, replyTo, smtpConnectorId? }
                        -- subject/htmlContent/... sont VIDES/absents pendant l'édition du draft
                           (seul emailId + smtpConnectorId sont saisis par l'utilisateur) ;
                           ils sont renseignés (copiés depuis Email) UNIQUEMENT au moment de
                           CampaignBuilderService.publish() — voir decisions/ADR-004-campaign-versioning.md
  wait                 config: { durationValue: number, durationUnit: 'minutes'|'hours'|'days',
                                  waitUntil?: { type: 'time_of_day', time: 'HH:mm' } | { type: 'weekday', day: string } }
  add_tag              config: { tagId }
  remove_tag           config: { tagId }
  add_to_segment       config: { segmentId }   -- ajout direct à segment_contacts, hors recalcul normal
  remove_from_segment  config: { segmentId }

condition
  email_opened         config: { referenceNodeId }  -- référence un node send_email antérieur du graphe
  email_clicked         config: { referenceNodeId }
  contact_field         config: { field, operator, value }  -- mêmes opérateurs que 06-segments.md
  in_segment             config: { segmentId }
  -- résultat : deux edges sortantes avec source_handle='true'/'false'

trigger (architecture prévue, non exécuté par le moteur en v1 — voir 12-campaign-engine.md § Open questions)
  email_opened / email_clicked / contact_created / contact_updated / webhook_received
                        config: varie par type ; nodes de type trigger acceptés par le builder/validation
                        de graphe mais ignorés par l'exécution en v1 (pas d'action associée implémentée)
```

**Nodes `condition`** : toujours exactement deux edges sortantes (`source_handle = 'true'` et `'false'`), chacune vers un node différent — contrainte vérifiée en validation de graphe (§ Validation), pas seulement en UI.

**`client_key`** : identifiant stable généré côté frontend (UUID) à la création d'un node dans le canvas, conservé dans `campaign_nodes.client_key` — permet au frontend de réconcilier son état local avec les IDs serveur après sauvegarde sans perdre la sélection/position en cours d'édition.

## Data model

Voir `02-database-design.md` § Campagnes — définition (`campaign_nodes`, `campaign_edges`) et `decisions/ADR-001-campaign-graph-storage.md` pour la justification du modèle hybride. Rappel : `config` (json) n'est validé qu'en application (VineJS discriminé par `subtype`), jamais en contrainte SQL.

## Backend architecture

```text
app/services/campaigns/
  campaign_builder_service.ts   (saveDraft, publish, cloneVersion, validateGraph)
  campaign_graph_validator.ts   (règles structurelles : nodes orphelins, condition à 2 branches, cycles interdits sauf via wait — voir Validation)
app/validators/campaign_node.ts  (schémas VineJS discriminés par subtype, un par subtype)
app/transformers/campaign_graph_transformer.ts  (assemble nodes+edges en { nodes, edges } pour le frontend)
```

**`saveDraft(version, payload)`** — algorithme de diff :
```text
1. Vérifie version.status == 'draft' (refuse toute écriture sur published/archived)
2. Charge les nodes/edges existants de la version
3. Pour chaque node du payload :
     - si client_key connu -> UPDATE (config, position, subtype si changé)
     - si client_key inconnu -> INSERT
4. Supprime les nodes existants dont le client_key n'est plus dans le payload (cascade edges)
5. Pour chaque edge du payload : upsert similaire (clé = source_node_id + target_node_id + source_handle)
6. Le tout dans UNE transaction (tout ou rien)
```

**`publish(draftVersion)`** :
```text
1. validateGraph(draftVersion) -- lève si invalide, liste toutes les erreurs (pas juste la première)
2. Pour chaque node subtype='send_email' : résout emailId -> Email, copie subject/htmlContent/
   textContent/senderName/senderEmail/replyTo dans config (gel, cf. decisions/ADR-004-campaign-versioning.md)
3. Transaction :
     - ancienne version published (s'il y en a une) -> status='archived'
     - draftVersion -> status='published', published_at=now()
     - campaigns.published_version_id = draftVersion.id, campaigns.draft_version_id = null
     - si première publication : campaigns.status 'draft' -> 'active'
4. Émission CampaignVersionPublished
```

**`cloneVersion(sourceVersion)`** (appelé quand un nouveau draft est nécessaire après une publication, ou à la duplication de campagne cf. `10-campaigns.md`) : copie tous les nodes (nouveaux `client_key` = les mêmes, `id` nouveaux) et edges dans une nouvelle `campaign_version` `draft`, dans une transaction.

## Frontend architecture

```text
inertia/pages/.../campaigns/builder.vue
  -- page hôte du canvas, charge { nodes, edges } via une prop Inertia initiale
inertia/components/campaign-builder/
  canvas.vue              (wrapper autour de la librairie de canvas retenue, voir § Canvas library)
  node-palette.vue        (panneau latéral : glisser un nouveau node par subtype)
  node-config-panel.vue   (formulaire contextuel, un composant par subtype)
  node-config/
    send-email-config.vue, wait-config.vue, condition-field-config.vue, ...
  version-history.vue     (liste des versions archivées/published, lecture seule)
```

**Synchronisation frontend/backend** : le canvas maintient un état local complet (nodes/edges/positions) ; à chaque modification significative (ajout/suppression/connexion/déplacement terminé/config modifiée), un debounce déclenche un `PUT` du graphe entier courant vers `campaigns.builder.save`. Pas de synchronisation incrémentale opération-par-opération (pas de CRDT/OT) — jugé disproportionné pour un éditeur mono-utilisateur (pas d'édition collaborative temps réel en v1, voir Open questions). En cas d'échec de sauvegarde (réseau), un indicateur "non sauvegardé" reste visible et les tentatives sont reprises.

## Canvas library

**Recommandation : Vue Flow (`@vue-flow/core`)**.

- **Raisons** : librairie Vue 3 native (pas un wrapper React), maintenue activement, modèle de données proche de ce qui est déjà choisi ici (`nodes: []`, `edges: []`, chaque edge avec `sourceHandle`), support natif des handles multiples par node (nécessaire pour les branches `true`/`false` des conditions), personnalisation complète des nodes via des composants Vue (utile pour afficher un résumé de config directement sur le node, ex. "Wait 2 days" affiché sur le node lui-même).
- **Alternatives écartées** :
  - Construire un canvas maison (SVG/Canvas API à la main) : effort disproportionné pour un besoin déjà bien couvert par une librairie mature ; contredit la priorité "simplicité" et "ne pas surarchitecturer".
  - Librairies orientées React (React Flow, dont Vue Flow s'inspire directement) : incompatibles avec la stack Vue 3 du projet sans wrapper lourd.
  - Konva.js / Fabric.js (canvas génériques bas niveau) : demanderaient de réimplémenter toute la logique de graphe (handles, edges, snapping) que Vue Flow fournit déjà.
- **Non installée dans cette phase** — à ajouter (`npm install @vue-flow/core`) lors de l'implémentation de ce plan.

## Représentation des nodes/edges (frontend)

```ts
// Correspond directement à campaign_nodes / campaign_edges, traduit par CampaignGraphTransformer
type BuilderNode = {
  clientKey: string          // campaign_nodes.client_key
  type: 'source' | 'action' | 'condition' | 'trigger'
  subtype: string
  config: Record<string, unknown>
  position: { x: number; y: number }
}
type BuilderEdge = {
  sourceClientKey: string
  targetClientKey: string
  sourceHandle: 'true' | 'false' | null
}
```

Vue Flow attend un format très proche nativement (`id`, `source`, `target`, `sourceHandle`, `position`, `data`) — `clientKey` sert d'`id` Vue Flow, `config` est stocké dans `data`. Un mapper fin (`toVueFlowElements(nodes, edges)` / `fromVueFlowElements(elements)`) isole cette traduction pour ne pas coupler le format de persistance au format d'une librairie spécifique (si la librairie change un jour, seul ce mapper change).

## Routes

```text
GET  .../campaigns/:campaignId/builder            campaigns.builder.show
PUT  .../campaigns/:campaignId/builder             campaigns.builder.save   (payload = { nodes, edges })
GET  .../campaigns/:campaignId/versions/:versionId  campaigns.versions.show  (lecture seule, archivé/published)
```

## Controllers

`CampaignBuilderController` (show/save), `CampaignVersionsController` (show, lecture seule pour l'historique).

## Services

Voir Backend architecture (`CampaignBuilderService`, `CampaignGraphValidator`).

## Models

`CampaignNode` (relations : `campaignVersion`, `outgoingEdges`, `incomingEdges`), `CampaignEdge` (relations : `campaignVersion`, `sourceNode`, `targetNode`).

## Jobs / Commands

Aucun job propre à ce plan (la sauvegarde reste synchrone, rapide par nature — quelques dizaines de nodes/edges au maximum par graphe).

## Events

`CampaignVersionPublished { campaignId, versionId, versionNumber }` — consommé par `13-campaign-enrollment.md` (aucun effet immédiat requis en v1, la source d'enrollment est réévaluée au prochain recalcul de segment) et `AuditLogListener`.

## Permissions

Standard projet ; édition du builder réservée à `owner`/`admin`/`member` (`viewer` peut consulter en lecture seule, y compris l'historique de versions).

## Validation

**Validation de forme (`config` par subtype)** : `app/validators/campaign_node.ts`, un schéma VineJS par `subtype`, sélectionné par un discriminant côté service avant d'appeler `request.validateUsing(...)`.

**Validation structurelle de graphe (`CampaignGraphValidator`, appelée avant `publish()`)** :
- Au moins un node `type='source'`.
- Chaque node (sauf `source`) a au moins une edge entrante (pas de node orphelin inatteignable).
- Chaque node `condition` a exactement deux edges sortantes, `source_handle` = `'true'` et `'false'` respectivement (l'un et l'autre présents, pas de doublon).
- Chaque node non-`condition` a au plus une edge sortante (pas de branchement implicite hors condition).
- Pas de cycle dans le graphe dirigé nodes→edges (un cycle rendrait l'exécution potentiellement infinie — un `wait` n'est pas un cycle, c'est une pause sur un chemin toujours acyclique).
- Chaque node `send_email` référence un `emailId` existant et appartenant au même projet.
- Chaque node `condition` de type `email_opened`/`email_clicked` référence un `referenceNodeId` qui est bien un node `send_email` **antérieur** dans le graphe (atteignable en amont).

Toutes les erreurs sont collectées et retournées ensemble (pas fail-fast) pour permettre à l'UI de les afficher toutes en une fois sur les nodes concernés.

## Edge cases

- Suppression d'un node `send_email` référencé par un node `condition` `email_opened` en aval → la suppression du node source est bloquée tant que la référence existe (message explicite), plutôt que de laisser une référence orpheline non détectée avant publication.
- Deux nodes `source` dans le même graphe → autorisé structurellement par le modèle de données (voir `10-campaigns.md` § Open questions) mais **la validation v1 n'autorise qu'un seul node `source`** — restriction explicite documentée ici, à lever si le besoin multi-source est priorisé plus tard.
- Auto-save qui arrive après que l'utilisateur a déjà quitté la page → dernier état reçu par le serveur fait foi ; pas de fusion de versions concurrentes en v1 (édition mono-utilisateur supposée, cf. Open questions).
- Publication d'un draft qui référence un `Email` encore en statut `draft` (cf. `09-emails.md`) → autorisée mais avec un avertissement non bloquant (le statut `Email.draft/published` est informationnel, cf. `09-emails.md` § Domain concepts).

## Failure scenarios

- Échec de la transaction `publish()` à mi-parcours (ex. crash serveur pendant la copie de contenu des nodes `send_email`) → transaction SQL garantit l'atomicité (rollback complet, aucune version `published` incohérente) ; l'utilisateur voit l'échec et retente.

## Idempotency considerations

- `saveDraft` est idempotent par construction (un diff appliqué deux fois avec le même payload ne change rien après la première application).
- `publish` **n'est pas** destiné à être rappelé plusieurs fois sur le même draft de façon concurrente — protégé par le fait que `draftVersion.status` passe à `published` dans la même transaction qui vérifie encore `status == 'draft'` au moment du commit (protection contre une double-publication concurrente via une vérification conditionnelle dans l'`UPDATE`, pattern similaire à `decisions/ADR-005-email-idempotency.md`).

## Performance considerations

Volumes de nodes/edges par graphe attendus faibles (dizaines, rarement centaines) — chargement complet du graphe en un aller-retour (2 requêtes : nodes + edges) sans pagination nécessaire. `CampaignGraphValidator` opère en mémoire sur le graphe déjà chargé (pas de requêtes N+1).

## Security considerations

- Toute résolution de référence dans `config` (`emailId`, `segmentId`, `tagId`, `smtpConnectorId`) doit être vérifiée comme appartenant au **même projet** au moment de la validation de forme (empêche un payload malicieux de référencer une entité d'un autre projet) — voir `19-security.md`.
- `saveDraft` refuse toute écriture si `version.status != 'draft'` (empêche de modifier une version `published`/`archived` via un appel API direct, pas seulement via l'UI).

## Testing strategy

- Unit : `CampaignGraphValidator` — chaque règle structurelle testée isolément (graphe valide minimal, node orphelin, condition à une seule branche, cycle, référence croisée invalide).
- Unit : `CampaignBuilderService.saveDraft` — diff correct (ajout/modification/suppression de nodes et edges), rejet sur version non-draft.
- Unit : `CampaignBuilderService.publish` — gel correct du contenu `send_email`, archivage de l'ancienne version published, protection contre double-publication concurrente.
- Functional : parcours complet création → édition (plusieurs auto-saves) → publication → vérification que le graphe publié est bien figé et qu'un nouveau draft cloné à partir de lui est indépendant.

## Implementation steps

1. `node ace make:migration create_campaign_nodes_table`.
2. `node ace make:migration create_campaign_edges_table`.
3. `node ace migration:run`.
4. Créer les modèles `CampaignNode`, `CampaignEdge` (relations).
5. Créer `app/validators/campaign_node.ts` (un schéma par subtype).
6. Créer `app/services/campaigns/campaign_graph_validator.ts`.
7. Créer `app/services/campaigns/campaign_builder_service.ts` (saveDraft, publish, cloneVersion).
8. Créer `app/transformers/campaign_graph_transformer.ts`.
9. Créer l'event `CampaignVersionPublished`.
10. Créer `CampaignBuilderController`, `CampaignVersionsController` et les routes.
11. `npm install @vue-flow/core` (et son CSS associé).
12. Créer les composants frontend listés ci-dessus (`canvas.vue`, `node-palette.vue`, `node-config-panel.vue` + un composant par subtype), le mapper `toVueFlowElements`/`fromVueFlowElements`.
13. Créer `inertia/pages/.../campaigns/builder.vue`.
14. Écrire les tests listés ci-dessus.

## Dependencies

`10-campaigns.md` (modèle `Campaign`/`CampaignVersion`), `09-emails.md` (référence `emailId`), `06-segments.md` (référence `segmentId`), `07-smtp-connectors.md` (référence `smtpConnectorId` optionnelle). Nouvelle dépendance npm : `@vue-flow/core`.

## Open questions

- Édition collaborative temps réel (plusieurs utilisateurs sur le même draft simultanément) : non supportée en v1 (dernier `saveDraft` gagne) — nécessiterait un mécanisme de verrouillage ou de fusion (hors scope, à documenter séparément si demandé).
- Nodes `trigger` : acceptés par le graphe/validation mais sans exécution réelle en v1 (voir `12-campaign-engine.md` § Open questions) — leur présence dans un graphe publié ne bloque pas la publication mais n'a aucun effet runtime tant que le moteur ne les supporte pas.
- Multi-source (plusieurs nodes `source` dans un même graphe) : restreint à un seul en v1 par la validation, cf. Edge cases.
