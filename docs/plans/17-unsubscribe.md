# 17 — Unsubscribe

## Objective

Fournir un mécanisme de désabonnement fiable et sécurisé (lien à token, statut contact, historique) garantissant qu'un contact désabonné ne reçoit plus jamais d'email — vérifié systématiquement par le Campaign Engine avant tout envoi, jamais une simple préférence UI sans effet garanti.

## Functional requirements

- Génération de `unsubscribe_url` unique par contact/projet, intégrée dans chaque email envoyé (variable `{{ unsubscribe_url }}`, cf. `08-email-templates.md`).
- Page de désabonnement publique (non authentifiée) accessible via ce lien.
- Désabonnement en un clic (conforme aux attentes standard email marketing — pas de formulaire de confirmation obligatoire supplémentaire, voir Domain concepts).
- Désabonnement manuel (par un utilisateur du projet, depuis la fiche contact).
- Historique des événements de désabonnement (`contact_unsubscribe_events`).
- Vérification systématique de l'éligibilité avant tout envoi (déjà spécifié dans `12-campaign-engine.md`, rappelé ici comme contrat de ce domaine).

## User flows

**Génération du lien** (au moment de l'envoi, dans `send_email_executor.ts`) :
```text
UnsubscribeService.urlFor(project, contact)
  → token = UnsubscribeTokenService.getOrCreate(project, contact)  -- réutilise un token existant
    non utilisé s'il y en a un, sinon en crée un nouveau (voir Domain concepts pour la durée de vie)
  → retourne `${APP_URL}/unsubscribe/${token}`
  → cette URL remplace le token {{ unsubscribe_url }} dans le contenu (08-email-templates.md)
```

**Désabonnement via lien** :
```text
Destinataire clique le lien -> GET /unsubscribe/:token   (page publique)
  → affiche une confirmation simple "Vous êtes désabonné de {project.name}" directement
    (le clic seul suffit à désabonner — voir Domain concepts pour cette décision) OU une page
    de confirmation avec un unique bouton "Confirmer" selon la décision retenue (voir ci-dessous)
  → UnsubscribeService.unsubscribe(contact, source='link', token)
      - contact.status -> 'unsubscribed' (si pas déjà)
      - contact_unsubscribe_events créé
      - unsubscribe_tokens.used_at = now()
```

**Désabonnement manuel** (depuis `05-contacts.md`) :
```text
Admin/member clique "Désabonner" sur la fiche contact
  → UnsubscribeService.unsubscribe(contact, source='manual', actorUserId)
```

## Domain concepts

**Clic unique vs. page de confirmation** : **décision retenue = clic unique désabonne immédiatement** (pas de double confirmation) — c'est la pratique standard et attendue de l'email marketing (RGPD et bonnes pratiques anti-spam favorisent un désabonnement "aussi simple que l'abonnement", sans friction) ; une page de confirmation intermédiaire ("Êtes-vous sûr ?") est une anti-pattern reconnue dans ce domaine (peut même être interprétée négativement par les filtres anti-spam qui testent l'accessibilité du lien). La page affichée après le clic est purement informative ("Vous avez été désabonné"), pas une étape d'action supplémentaire.

**Durée de vie du token** : `unsubscribe_tokens` n'expire **jamais** par défaut (`used_at` marque l'usage mais ne rend pas le token invalide pour un futur re-clic — cliquer deux fois sur le même lien doit rester un no-op silencieux, pas une erreur). Un nouveau token est généré uniquement s'il n'en existe aucun encore pour ce (project, contact) — pas un token par email envoyé (économie, et cohérence : un contact a une seule URL de désabonnement stable dans le temps pour un projet donné, réutilisée dans tous ses emails).

**Portée du désabonnement** : **par projet**, pas global à travers toute l'application (cohérent avec `contacts.project_id` — un même individu peut être un contact distinct dans deux projets différents de la même organisation, avec des statuts d'abonnement indépendants). Pas de désabonnement "par campagne" en v1 (`init.md` évoque le cas mais la v1 documentée ici traite le statut contact comme binaire par projet) — voir Open questions pour une éventuelle granularité future.

**Vérification systématique avant envoi** (contrat déjà énoncé dans `12-campaign-engine.md` § Edge cases, rappelé ici comme propriété du domaine désabonnement) : le Campaign Engine vérifie `contact.status == 'subscribed'` immédiatement avant l'appel `send_email_executor`, **pas seulement** au moment de l'enrollment — répond au Scénario 7 de `init.md` ("Contact unsubscribes while already waiting inside several campaigns").

## Data model

Voir `02-database-design.md` § Désabonnement (`unsubscribe_tokens`, `contact_unsubscribe_events`).

## Backend architecture

```text
app/services/unsubscribe/
  unsubscribe_token_service.ts   (getOrCreate, resolve — token -> contact)
  unsubscribe_service.ts         (unsubscribe(contact, source, ...), resubscribe(contact, actorUserId))
app/controllers/unsubscribe/
  unsubscribe_controller.ts      (show — route PUBLIQUE)
app/validators/... (aucun validator complexe, action simple)
app/transformers/... (page publique simple, pas de transformer élaboré nécessaire)
app/events/contact_unsubscribed.ts, contact_resubscribed.ts
```

## Frontend architecture

```text
inertia/pages/unsubscribe/
  show.vue    (page publique, hors layout applicatif standard — pas de navigation projet,
               juste un message de confirmation minimal + nom du projet)
```

Cette page utilise un layout dédié minimal (`inertia/layouts/public.vue`, nouveau — pas `default.vue` qui affiche la navigation applicative/switcher, non pertinente pour un visiteur non authentifié externe).

## Routes

```text
GET  /unsubscribe/:token       unsubscribe.show    [PUBLIC, aucun middleware auth/projet]
```

Volontairement une route **globale** (pas nichée sous `/organizations/:organizationId/projects/:projectId/...`) car le visiteur qui clique ce lien n'est pas authentifié et ne connaît ni l'organisation ni le projet — tout le contexte est dérivé du token (voir `19-security.md` § unsubscribe tokens, même traitement que les routes de tracking § `16-email-tracking.md`).

Action de désabonnement manuel (authentifiée, dans le contexte projet) :
```text
POST .../contacts/:contactId/unsubscribe   contacts.unsubscribe
POST .../contacts/:contactId/resubscribe    contacts.resubscribe   [role >= admin, cf. Edge cases]
```

## Controllers

`UnsubscribeController` (show — gère aussi l'action de désabonnement dans le même appel, cf. User flows "clic unique"). `ContactsController` (extension, `unsubscribe`/`resubscribe` — cf. `05-contacts.md`, actions documentées ici car spécifiques à ce domaine).

## Services

- `UnsubscribeTokenService.getOrCreate(project, contact)` : `SELECT ... WHERE project_id = ? AND contact_id = ?`, sinon `INSERT` (token aléatoire 32 bytes).
- `UnsubscribeTokenService.resolve(token)` : retourne le `contact` associé ou `null` (jamais d'erreur levée pour un token inconnu — traité comme un edge case UI, cf. ci-dessous).
- `UnsubscribeService.unsubscribe(contact, source, options)` : idempotent (si déjà `unsubscribed`, no-op sur le statut mais journalise quand même l'event — utile pour voir "combien de fois ce contact a re-cliqué le lien", cf. Idempotency considerations), émet `ContactUnsubscribed`.
- `UnsubscribeService.resubscribe(contact, actorUserId)` : action **manuelle uniquement** (jamais automatique), `contact.status -> 'subscribed'`, journalise un `contact_unsubscribe_events` avec `source='manual'` et une sémantique de réabonnement (ou une table/valeur dédiée — voir Data model, pas de table `contact_resubscribe_events` séparée, réutilise la même table avec un champ `source` explicite couvrant ce cas, à préciser en implémentation).

## Models

`UnsubscribeToken` (relations : `project`, `contact`), `ContactUnsubscribeEvent` (relations : `project`, `contact`, `campaign` nullable).

## Jobs / Commands

Aucun (opérations synchrones, rapides, sans appel externe).

## Events

`ContactUnsubscribed { contactId, projectId, source, campaignId? }`, `ContactResubscribed` — consommés par `18-statistics-dashboard.md` (compteur unsubscribes) et `AuditLogListener`. `ContactUnsubscribed` correspond directement à l'event `ContactUnsubscribed` déjà listé dans `01-architecture.md` § Event bus interne (ce plan en est l'implémentation, pas une redéfinition).

## Permissions

- La route publique `/unsubscribe/:token` n'a par nature aucune permission (accessible à quiconque possède le lien, c'est le principe même du mécanisme).
- Désabonnement manuel : permissions standard projet (`member` et au-dessus).
- Réabonnement manuel : restreint à `owner`/`admin` (action plus sensible — réintroduire un contact dans le flux d'envoi doit être délibéré, cf. `05-contacts.md` § state machine, "réactivation manuelle, prudence").

## Validation

Aucune validation de formulaire complexe (actions sans payload significatif au-delà du token/de l'ID contact déjà validés par la résolution de route).

## Edge cases

- Token inconnu/déjà utilisé revisité → la page affiche toujours un message de confirmation cohérent ("vous êtes désabonné" ou "ce lien n'est plus valide, contactez-nous si besoin") — **jamais** une erreur 404/500 brute, qui serait une mauvaise expérience pour un destinataire légitime qui re-clique un vieil email.
- Désabonnement manuel d'un contact déjà `bounced`/`complained`/`blocked` → autorisé (transition additionnelle vers `unsubscribed` possible depuis n'importe quel statut sauf `subscribed` lui-même, cohérent avec la state machine de `05-contacts.md` étendue si nécessaire pour couvrir ce cas — à vérifier lors de l'implémentation que la state machine documentée en `05-contacts.md` autorise bien `bounced -> unsubscribed`/`complained -> unsubscribed`, sinon l'étendre).
- Réabonnement d'un contact qui avait été marqué `bounced` (pas `unsubscribed`) → hors scope de ce plan (relève de `05-contacts.md`, pas une action de désabonnement).
- Contact supprimé (soft delete) qui reçoit encore un email en file au moment de sa suppression → déjà couvert par `05-contacts.md` (annulation des enrollments actifs) et par la vérification systématique d'éligibilité — un contact soft-deleted ne passe de toute façon jamais la vérification `status == 'subscribed'` combinée à un scope `forProject` qui exclut les supprimés en amont (défense en profondeur, pas un seul mécanisme dont dépendrait toute la garantie).

## Failure scenarios

Aucun scénario de défaillance critique propre à ce domaine (opérations DB synchrones simples, pas d'appel externe).

## Idempotency considerations

- `unsubscribe()` est idempotent sur le **statut** (`contact.status = 'unsubscribed'` ne change pas si déjà le cas) mais **pas** sur le **journal** (`contact_unsubscribe_events` reçoit une nouvelle ligne à chaque appel, y compris un re-clic) — décision assumée : c'est un journal d'audit, pas un état, donc chaque occurrence a une valeur informative propre (ex. détecter un contact qui re-clique anormalement souvent un vieux lien, signal potentiel d'un problème de contenu réutilisé).
- Génération de token : `getOrCreate` est naturellement idempotent (jamais deux tokens actifs simultanés pour le même (project, contact) — la logique "sinon crée" doit être protégée par une contrainte `UNIQUE` applicative si une race condition est possible, ex. deux envois strictement simultanés au même contact avant qu'aucun token n'existe encore — traité par un `INSERT ... ON DUPLICATE` ou une contrainte `UNIQUE (project_id, contact_id)` sur `unsubscribe_tokens`, à ajouter explicitement, complément à `02-database-design.md`).

## Performance considerations

Volumes proportionnels au nombre de contacts/emails envoyés — `unsubscribe_tokens (contact_id)` déjà indexé (`02-database-design.md`) suffit ; `token` lui-même est `UNIQUE` (donc déjà indexé) pour la résolution `resolve()`, l'opération la plus fréquente de ce domaine (appelée à chaque visite de la page publique).

## Security considerations

- `token` : aléatoire (32 bytes, CSPRNG), jamais dérivé de l'ID contact ou d'une donnée devinable — cohérent avec la politique transverse de `02-database-design.md` § IDs et `19-security.md`.
- Route publique sans CSRF (un lien email n'a par nature pas de jeton CSRF de session — le shield CSRF d'AdonisJS, déjà actif globalement via `start/kernel.ts`, doit être explicitement exempté pour cette route, cf. `19-security.md` § protections liées à Inertia/CSRF).
- Aucune information sensible exposée sur la page de désabonnement au-delà du nom du projet (jamais l'email complet du contact affiché en clair sans nécessité, jamais d'autre donnée du contact).
- Rate limiting recommandé sur `/unsubscribe/:token` (comme toute route publique non authentifiée) pour limiter l'énumération de tokens par force brute — voir `19-security.md` § rate limiting.

## Testing strategy

- Unit : `UnsubscribeService.unsubscribe` (idempotence du statut, journalisation systématique), `UnsubscribeTokenService.getOrCreate` (réutilisation, pas de doublon même en cas d'appels concurrents simulés).
- Functional : clic sur lien → contact désabonné → tentative d'envoi ultérieure dans une campagne active skip proprement l'action (test partagé avec `12-campaign-engine.md` § Edge cases, réexécuté ici du point de vue "désabonnement").
- Security : token invalide/altéré → page de confirmation générique, jamais d'erreur technique exposée ; vérification explicite qu'aucune donnée contact sensible ne fuite sur la page publique.

## Implementation steps

1. `node ace make:migration create_unsubscribe_tokens_table` (avec `UNIQUE (project_id, contact_id)`, complément à `02-database-design.md`).
2. `node ace make:migration create_contact_unsubscribe_events_table`.
3. `node ace migration:run`.
4. Créer les modèles `UnsubscribeToken`, `ContactUnsubscribeEvent`.
5. Créer `app/services/unsubscribe/unsubscribe_token_service.ts`, `unsubscribe_service.ts`.
6. Créer les events (`app/events/contact_unsubscribed.ts`, `contact_resubscribed.ts`).
7. Créer `UnsubscribeController` et la route publique (exemptée CSRF/shield si nécessaire — vérifier la configuration `config/shield.ts` existante).
8. Créer `inertia/layouts/public.vue` et `inertia/pages/unsubscribe/show.vue`.
9. Étendre `ContactsController` (`05-contacts.md`) avec les actions `unsubscribe`/`resubscribe` et leurs routes.
10. Intégrer `UnsubscribeService.urlFor()`/génération de `unsubscribe_url` dans le contexte du `VariableRenderer` (`08-email-templates.md`) au moment de l'envoi réel (`send_email_executor.ts`, `12-campaign-engine.md`).
11. Écrire les tests listés ci-dessus.

## Dependencies

`05-contacts.md` (statut contact), `08-email-templates.md` (variable `unsubscribe_url`), `12-campaign-engine.md` (vérification systématique avant envoi, point d'intégration de la génération d'URL).

## Open questions

- Désabonnement granulaire par campagne/type de communication (plutôt qu'un statut binaire par projet) : non retenu en v1 (`init.md` l'évoque comme un "si pertinent" plutôt qu'une exigence ferme) — extension possible via une table de préférences dédiée si un besoin réel émerge, sans remettre en cause le mécanisme de token/vérification systématique déjà en place.
- Conformité légale approfondie (registre de consentement RGPD complet, double opt-in à l'inscription) : hors scope de ce plan, qui couvre le désabonnement mais pas l'ensemble du cycle de consentement — à documenter séparément si prioritisé.
