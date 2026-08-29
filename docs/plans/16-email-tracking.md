# 16 — Email Tracking

## Objective

Suivre le cycle de vie de chaque email envoyé (`email_deliveries`, statut de remise) et journaliser les événements associés (`email_events` : sent, delivered, opened, clicked, bounced, complained, failed, unsubscribed) via un modèle générique compatible avec plusieurs sources (pixel de tracking, redirection de lien, webhook du provider SMTP).

## Functional requirements

- Enregistrer une `email_delivery` à chaque tentative d'envoi (voir `decisions/ADR-005-email-idempotency.md` pour sa création).
- Tracking d'ouverture (pixel invisible inséré dans le HTML envoyé).
- Tracking de clic (réécriture des liens du contenu HTML vers une URL de redirection trackée).
- Ingestion d'événements de delivery/bounce/complaint via webhook provider (quand le provider SMTP en expose un — dépend du provider, best-effort).
- Distinction stricte statut de delivery vs. journal d'événements (cf. `init.md`, rappelée dans `02-database-design.md`).

## User flows

**Envoi (rappel, orchestré par `12-campaign-engine.md`)** :
```text
send_email_executor exécute l'envoi (via decisions/ADR-005-email-idempotency.md)
  → juste avant l'envoi : le htmlContent figé est post-traité par TrackingContentRewriter :
      - insertion d'un pixel <img src=".../track/open/{deliveryToken}.gif" width="1" height="1" ...">
        juste avant </body> (ou en fin de contenu si pas de </body>)
      - chaque <a href="..."> du contenu est réécrit en <a href=".../track/click/{deliveryToken}?u=<url encodée>">
  → email_deliveries.status: pending -> processing -> sent (ou failed, cf. 15-retry-and-idempotency.md)
  → EmailEvent 'sent' créé au moment où le SMTP confirme l'acceptation
```

**Ouverture** :
```text
Client email du destinataire charge le pixel
  → GET /track/open/:deliveryToken.gif (route PUBLIQUE, non authentifiée)
  → TrackingController.open() :
      - résout deliveryToken -> email_delivery (404 image transparente si token inconnu, jamais d'erreur visible)
      - enqueue job tracking.process_event { deliveryId, type: 'opened', metadata: { userAgent, ip? } }
      - répond IMMÉDIATEMENT avec un gif 1x1 transparent (le traitement de l'event est async,
        ne doit jamais ralentir le chargement de l'email chez le destinataire)
```

**Clic** :
```text
Destinataire clique un lien du contenu
  → GET /track/click/:deliveryToken?u=<url encodée>
  → TrackingController.click() :
      - résout deliveryToken -> email_delivery (si inconnu : redirige quand même vers `u` si présent,
        ne bloque jamais la navigation de l'utilisateur pour un problème de tracking)
      - enqueue job tracking.process_event { deliveryId, type: 'clicked', metadata: { url: u, userAgent } }
      - répond par une redirection HTTP 302 vers l'URL originale décodée
```

**Webhook provider (bounce/complaint/delivery confirmée)** — best-effort, dépend du provider :
```text
Provider SMTP POST vers /webhooks/smtp/:connectorId (route publique, signature vérifiée si le
  provider en fournit une — voir Security considerations)
  → SmtpWebhookController.handle()
      - vérifie la signature si applicable
      - traduit le format spécifique du provider vers { providerMessageId, type, metadata }
        (un adapter par provider connu, extensible — voir Domain concepts)
      - résout providerMessageId -> email_delivery (via email_deliveries.provider_message_id)
      - enqueue tracking.process_event { deliveryId, type, metadata }
```

## Domain concepts

**`deliveryToken`** : identifiant public opaque distinct de `email_deliveries.id` (cf. `02-database-design.md` § IDs — jamais l'ID auto-increment exposé publiquement). **Décision de conception** : plutôt qu'une nouvelle colonne dédiée, `deliveryToken` est dérivé de façon stable et non-devinable à partir de `idempotency_key` (déjà unique et non-séquentiel par construction, cf. `decisions/ADR-005-email-idempotency.md`) — évite d'ajouter une colonne supplémentaire uniquement pour cet usage. Si `idempotency_key` s'avère prévisible dans son format, une colonne `public_token` dédiée (générée aléatoirement) serait ajoutée à la place — décision finale à l'implémentation selon la forme exacte retenue pour `idempotency_key` (`campaignExecutionId:nodeId` hashé, cf. `15-retry-and-idempotency.md`, n'est **pas** directement adapté comme token public car il fuiterait des IDs internes s'il n'est pas haché avec un secret) — **implémentation retenue** : `deliveryToken = HMAC-SHA256(APP_KEY, email_deliveries.id).slice(0, 32)`, calculé à la volée (non stocké), vérifiable dans les deux sens sans colonne supplémentaire, non-devinable sans `APP_KEY`.

**Distinction statut de delivery vs. événements** (rappel explicite de `init.md` et `02-database-design.md`) :
- `email_deliveries.status` = **pipeline d'envoi** (`pending → queued → processing → sent/failed`, puis `delivered`/`bounced` si le provider confirme) — une machine à états à une seule valeur courante.
- `email_events` = **journal append-only**, peut contenir plusieurs `opened`/`clicked` pour une même delivery (un destinataire peut ouvrir un email plusieurs fois) — **jamais** utilisé pour dériver `email_deliveries.status` par comptage.

**`TrackingContentRewriter`** : opère sur le HTML **déjà figé** (`campaign_nodes.config.htmlContent`, cf. `decisions/ADR-004-campaign-versioning.md`) au moment de l'envoi, pas au moment de la publication de la campagne — le `deliveryToken` n'existe qu'une fois `email_deliveries` créée (une par envoi réel à un contact), donc la réécriture est nécessairement une étape du `send_email_executor`, pas du builder.

## Data model

Voir `02-database-design.md` § Tracking / Delivery (`email_deliveries`, `email_events`). Aucune colonne supplémentaire nécessaire pour ce plan (le `deliveryToken` est dérivé, pas stocké — voir ci-dessus).

## Backend architecture

```text
app/services/tracking/
  tracking_content_rewriter.ts   (insertion pixel + réécriture des liens)
  delivery_token_service.ts      (encode/decode deliveryToken <-> email_delivery, HMAC)
  tracking_event_service.ts      (processEvent — écrit email_events, met à jour email_deliveries.status
                                   si applicable, ex. 'delivered'/'bounced' changent le statut, 'opened'/
                                   'clicked' ne changent JAMAIS le statut de delivery)
  smtp_webhook_adapters/
    generic_adapter.ts
    (adapters spécifiques par provider ajoutés au besoin, ex. brevo_adapter.ts — non détaillés en v1,
     voir Open questions)
app/controllers/tracking/
  tracking_controller.ts   (open, click — routes PUBLIQUES, non authentifiées, hors contexte projet)
  smtp_webhook_controller.ts (handle — route publique)
```

**`TrackingEventService.processEvent({ deliveryId, type, metadata })`** :
```text
1. Charge email_delivery (404/no-op silencieux si introuvable — jamais d'erreur visible côté
   destinataire/provider)
2. INSERT email_events (append-only, toujours — même un 'opened' répété)
3. Si type in ['delivered', 'bounced', 'failed'] :
     UPDATE email_deliveries SET status = type, delivered_at = now() si 'delivered'
     WHERE id = ? AND status NOT IN ('bounced', 'failed')  -- ne régresse jamais un statut terminal
4. Si type == 'bounced' (hard bounce) ou 'complained' :
     ContactService (05-contacts.md) : contact.status -> 'bounced' / 'complained'
     (uniquement pour un HARD bounce ; un soft bounce ponctuel ne change pas le statut contact —
     distinction faite via metadata.bounceType fourni par l'adapter provider, cf. Edge cases)
5. Si type == 'unsubscribed' : délégué à 17-unsubscribe.md (ContactUnsubscribeService), pas traité
   directement ici (ce plan ne fait qu'enregistrer l'event, la logique de désabonnement vit ailleurs)
```

## Frontend architecture

Aucune UI dédiée à ce plan côté envoi (les routes `/track/*` ne sont jamais visitées par un utilisateur de l'app, seulement par des clients email/providers). La **consultation** des événements (historique par contact/campagne/email) est une UI de `18-statistics-dashboard.md` et de la page détail contact (`05-contacts.md`), qui lisent `email_events`/`email_deliveries` en lecture seule — pas redéfinie ici.

## Routes

```text
GET  /track/open/:deliveryToken.gif      tracking.open     [PUBLIC, aucun middleware auth/projet]
GET  /track/click/:deliveryToken          tracking.click    [PUBLIC]
POST /webhooks/smtp/:connectorId          smtp_webhooks.handle [PUBLIC, signature vérifiée si dispo]
```

Ces routes sont délibérément **hors** du préfixe `/organizations/:organizationId/projects/:projectId/...` (elles n'ont pas de session utilisateur, le contexte est entièrement dérivé du token/de l'ID de connecteur) — voir `19-security.md` § endpoints de tracking pour le traitement de sécurité dédié que cela implique (surface publique non authentifiée).

## Controllers

`TrackingController` (open, click), `SmtpWebhookController` (handle) — voir Domain concepts pour leur comportement détaillé.

## Services

Voir Backend architecture.

## Models

Aucun nouveau modèle (`EmailDelivery`, `EmailEvent` déjà définis dans `02-database-design.md`). Scopes nommés : `EmailDelivery.query().forProject(project)`, `EmailEvent.query().ofType(type)`.

## Jobs / Commands

```text
job: tracking.process_event { deliveryId, type, metadata }
  queue: tracking (voir 14-jobs-and-queues.md — concurrency élevée, jobs très courts)
```

Traitement toujours **asynchrone** (jamais en ligne dans la requête HTTP du pixel/webhook) — impératif pour que le chargement du pixel par le client email du destinataire reste quasi-instantané (certains clients email timeout/bloquent l'affichage si une ressource embarquée est trop lente).

## Events

`EmailOpened`, `EmailClicked`, `EmailDelivered`, `EmailBounced`, `EmailComplained` — émis par `TrackingEventService` après écriture, consommés par `18-statistics-dashboard.md` (compteurs incrémentaux) et `AuditLogListener`. Point d'extension noté dans `12-campaign-engine.md` § Open questions : ces events pourraient un jour réveiller des nodes `trigger` `email_opened`/`email_clicked` — non implémenté en v1.

## Permissions

Les routes `/track/*` et `/webhooks/*` sont **publiques par nature** (pas de session, pas de rôle) — leur sécurité repose sur le token/la signature, pas sur une policy Bouncer (voir Security considerations). La **consultation** des événements dans l'UI suit les permissions standard projet (lecture seule pour tous les rôles, y compris `viewer`).

## Validation

Aucune validation VineJS classique sur les routes publiques (pas de formulaire) — validation structurelle minimale du webhook entrant (forme JSON attendue par l'adapter du provider), avec rejet silencieux (200 OK vide) plutôt qu'une erreur bruyante en cas de payload non reconnu (évite qu'un provider ne désactive le webhook après trop d'erreurs 4xx/5xx en réponse).

## Edge cases

- Pixel de tracking bloqué par le client email (bloqueur d'images par défaut, cas très fréquent) → sous-déclaration structurelle des taux d'ouverture, limite connue et inhérente au tracking par pixel (pas un bug à corriger, à documenter dans l'UI du dashboard comme limite connue de la mesure d'ouverture).
- `deliveryToken` invalide/expiré sur `/track/click/...` → si l'URL cible `u` est présente et décodable, rediriger quand même (ne jamais casser l'expérience du destinataire pour un problème de tracking) ; sinon 404 minimal.
- Bounce reçu pour une delivery déjà `sent` depuis plusieurs jours (provider lent à notifier) → traité normalement, `status` mis à jour tant qu'il n'est pas déjà `bounced`/`failed` (idempotent, cf. étape 3 de `processEvent`).
- Soft bounce (temporaire, ex. boîte pleine) vs hard bounce (permanent, ex. adresse inexistante) → seul le hard bounce change `contact.status` (cf. étape 4) ; le soft bounce reste un simple `email_events` sans conséquence sur l'éligibilité future du contact — distinction fournie par `metadata.bounceType` de l'adapter provider (générique : `soft`/`hard`, valeur par défaut `soft` si le provider ne précise pas, choix conservateur qui évite de bloquer un contact à tort).
- Plusieurs clics sur le même lien par le même destinataire → chaque clic crée une ligne `email_events` distincte (jamais dédupliqué) — utile pour l'analyse d'engagement, le comptage "clics uniques" pour les statistiques se fait par agrégation (`DISTINCT contact_id`) au niveau de `18-statistics-dashboard.md`, pas en empêchant l'enregistrement.

## Failure scenarios

- Job `tracking.process_event` échoue (ex. DB indisponible momentanément) → retry standard (`15-retry-and-idempotency.md`, file `tracking`) ; un événement de tracking non traité après épuisement des tentatives est une perte de donnée mineure (pas un email non-envoyé) — acceptable, journalisé mais pas alerté de façon critique.

## Idempotency considerations

- `INSERT email_events` n'a pas besoin d'idempotence stricte (un event dupliqué en cas de double-livraison du même webhook provider n'est qu'une légère sur-comptabilisation, pas une incohérence dangereuse) — **sauf** pour les types qui modifient `email_deliveries.status` ou `contact.status`, qui sont eux naturellement idempotents par construction (§ Backend architecture, étapes 3-4 : `UPDATE ... WHERE status NOT IN (...)`, changement de statut contact idempotent par nature).
- Un webhook provider qui renvoie plusieurs fois la même notification (comportement documenté de nombreux providers, "at-least-once" côté eux aussi) est donc géré correctement sans mécanisme dédié supplémentaire.

## Performance considerations

- Réponse du pixel (`/track/open/...`) doit être la plus rapide possible : résolution du token (calcul HMAC, pas de requête DB nécessaire pour la validation de forme) + enqueue (opération Redis rapide) + réponse immédiate — **aucune écriture SQL synchrone** dans le cycle de requête HTTP de tracking.
- `email_events (email_delivery_id, type)` et `(project_id, type, occurred_at)` indexés (cf. `02-database-design.md`) pour les agrégations de `18-statistics-dashboard.md`.

## Security considerations

- Routes `/track/*`/`/webhooks/*` **hors** authentification/CSRF (nécessairement — appelées par des clients email et des providers externes, pas par le navigateur d'un utilisateur connecté) — voir `19-security.md` § endpoints de tracking pour la politique complète (rate limiting spécifique, validation stricte des tokens, pas de fuite d'information sur les tokens invalides).
- `deliveryToken` non-devinable (HMAC avec `APP_KEY`, jamais l'ID brut) — empêche un tiers d'énumérer les deliveries ou de forger de faux événements d'ouverture/clic pour un contact ciblé.
- Signature de webhook vérifiée quand le provider en fournit une (HMAC de la requête avec un secret partagé configuré sur le `smtp_connector`, comparaison en temps constant) — si le provider n'en fournit pas, le risque résiduel (faux événements injectés) est documenté comme accepté (impact limité : de fausses données d'engagement, pas un accès aux données ni un envoi non autorisé).
- Réécriture de liens (`TrackingContentRewriter`) : l'URL de redirection doit valider que `u` est une URL absolue `http(s)` avant de rediriger (empêche une redirection vers un schéma dangereux type `javascript:`) — voir `19-security.md`.

## Testing strategy

- Unit : `TrackingContentRewriter` (insertion correcte du pixel, réécriture de tous les liens `<a href>`, préservation du reste du HTML).
- Unit : `DeliveryTokenService` (round-trip encode/decode, rejet d'un token altéré).
- Unit : `TrackingEventService.processEvent` — chaque type d'event, non-régression de statut terminal, distinction hard/soft bounce.
- Functional : pixel appelé → event enregistré de façon asynchrone (vérifié après traitement de la queue de test) → statut contact mis à jour uniquement sur hard bounce.
- Security : token invalide, tentative de redirection vers un schéma non-http(s), payload de webhook malformé — tous doivent répondre proprement sans exception non gérée.

## Implementation steps

1. Créer `app/services/tracking/delivery_token_service.ts` (HMAC via `@adonisjs/core/services/encryption` ou le service de hash approprié).
2. Créer `app/services/tracking/tracking_content_rewriter.ts`.
3. Créer `app/services/tracking/tracking_event_service.ts`.
4. Créer `app/services/tracking/smtp_webhook_adapters/generic_adapter.ts` (structure extensible).
5. Créer le job `tracking.process_event` (dépend de `14-jobs-and-queues.md`).
6. Créer les events (`app/events/email_opened.ts`, etc.).
7. Créer `TrackingController`, `SmtpWebhookController` et les routes publiques dédiées dans `start/routes.ts` (hors groupe `middleware.auth()`/projet).
8. Intégrer `TrackingContentRewriter` dans `send_email_executor.ts` (`12-campaign-engine.md`) juste avant l'appel SMTP.
9. Écrire les tests listés ci-dessus.

## Dependencies

`decisions/ADR-005-email-idempotency.md` (`email_deliveries` déjà créée par l'envoi), `12-campaign-engine.md` (point d'intégration de la réécriture de contenu), `05-contacts.md` (mise à jour de statut sur bounce/complaint), `14-jobs-and-queues.md`.

## Open questions

- Adapters provider-spécifiques (Brevo, Mailgun, SES) pour les webhooks entrants : structure prévue (`smtp_webhook_adapters/`) mais seul un `generic_adapter.ts` minimal est détaillé en v1 — l'ajout d'un adapter par provider réel se fera au fil des besoins, sans changement du reste de l'architecture.
- Tracking d'ouverture par en-tête `List-Unsubscribe`/analyse serveur (au-delà du pixel) : non envisagé en v1, le pixel reste la méthode standard malgré ses limites connues.
