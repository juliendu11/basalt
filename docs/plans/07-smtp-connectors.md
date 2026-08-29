# 07 — SMTP Connectors

## Objective

Permettre à chaque projet d'enregistrer un ou plusieurs connecteurs SMTP (Brevo, Mailgun, SendGrid, SES, serveur personnalisé), avec credentials chiffrés, test de connexion, et un connecteur par défaut utilisé par le Campaign Engine pour l'envoi.

## Functional requirements

- CRUD connecteur SMTP par projet.
- Champs : `name`, `host`, `port`, `username`, `password`, `encryption` (none/ssl/tls), `fromEmail`, `fromName`, `replyTo`, `enabled`, `dailyLimit` (optionnel).
- Test de connexion (sans envoyer d'email réel — vérification de l'établissement de la connexion SMTP/auth).
- Connecteur par défaut (un seul actif par projet) — c'est celui utilisé quand un node `send_email` ne spécifie pas explicitement de connecteur.
- Activation/désactivation.
- Credentials jamais exposés au frontend après écriture (write-only depuis l'UI).
- Limite d'envoi quotidienne optionnelle (`dailyLimit`), appliquée par le Campaign Engine/queue (voir Performance considerations).

## User flows

```text
Création : formulaire (host/port/username/password/encryption/from*/replyTo)
  → validation
  → password chiffré avant écriture (jamais en clair en base)
  → SmtpConnector créé, enabled=true par défaut
  → si c'est le premier connecteur du projet : is_default=true automatiquement

Test de connexion : bouton "Tester" sur un connecteur existant OU sur le formulaire avant sauvegarde
  → POST vers un endpoint dédié (ne persiste rien si appelé depuis le formulaire de création)
  → tentative de connexion SMTP réelle (handshake + auth, sans envoi de message)
  → résultat affiché (succès/échec + message d'erreur brut du serveur SMTP si échec)
  → si connecteur existant : last_tested_at, last_test_status mis à jour

Définir comme défaut : action dédiée
  → transaction : ancien défaut du projet -> is_default=false, nouveau -> is_default=true
```

## Domain concepts

- **Connecteur par défaut** : exactement un `is_default = true` par projet à tout instant (garanti par transaction applicative, pas par contrainte SQL — MySQL ne supporte pas nativement un index unique partiel ; voir `02-database-design.md`).
- **Désactivation (`enabled=false`)** ≠ suppression : un connecteur désactivé reste visible/historique (référencé par d'anciens `email_deliveries`) mais ne peut plus être sélectionné pour de nouveaux envois. Le Campaign Engine doit vérifier `enabled=true` juste avant l'envoi (pas seulement à la configuration du node), voir `12-campaign-engine.md`.
- **Encryption** : `none` (port 25 non chiffré, déconseillé mais permis pour des besoins internes), `ssl` (implicite, généralement port 465), `tls` (STARTTLS, généralement port 587).

## Data model

Voir `02-database-design.md` § SMTP (`smtp_connectors`). `password_encrypted` : chiffré via le service de chiffrement applicatif (`@adonisjs/core/services/encryption`, déjà disponible — `config/encryption.ts` existe dans le projet), jamais en clair, jamais renvoyé déchiffré au frontend (voir Security considerations).

## Backend architecture

```text
app/services/smtp/
  smtp_connector_service.ts   (create, update, delete, setDefault, toggleEnabled)
  smtp_connection_tester.ts   (test de connexion réel, isolé pour être mockable en test)
app/validators/smtp_connector.ts
app/transformers/smtp_connector_transformer.ts   (n'expose JAMAIS password/password_encrypted)
```

`SmtpConnectorService` chiffre/déchiffre via `encryption.encrypt()`/`encryption.decrypt()` d'AdonisJS (AES-256-GCM, clé dérivée de `APP_KEY`) — jamais une implémentation de chiffrement maison. Le déchiffrement n'a lieu que côté service, juste avant l'usage réel (test de connexion, envoi), jamais transporté vers un controller/transformer/frontend.

## Frontend architecture

```text
inertia/pages/.../settings/smtp/
  index.vue    (liste des connecteurs, badge "par défaut", statut enabled/dernier test)
  create.vue / edit.vue  (formulaire — le champ password est toujours vide à l'édition,
                          "laisser vide pour conserver le mot de passe actuel")
```

Le champ password en édition : le formulaire n'affiche jamais la valeur existante (write-only) ; si laissé vide à la soumission, le service **ne modifie pas** `password_encrypted` (distinction "champ vide envoyé" vs "champ absent" gérée explicitement, pas une simple règle "vide = ignorer" qui empêcherait de vider intentionnellement... note : un mot de passe ne doit de toute façon jamais être "vidé" intentionnellement, donc vide = toujours "conserver l'existant").

## Routes

```text
GET    .../settings/smtp                      smtp_connectors.index
GET    .../settings/smtp/create                 smtp_connectors.create
POST   .../settings/smtp                        smtp_connectors.store
GET    .../settings/smtp/:connectorId/edit      smtp_connectors.edit
PATCH  .../settings/smtp/:connectorId           smtp_connectors.update
DELETE .../settings/smtp/:connectorId           smtp_connectors.destroy
POST   .../settings/smtp/:connectorId/default   smtp_connectors.setDefault
POST   .../settings/smtp/:connectorId/toggle    smtp_connectors.toggleEnabled
POST   .../settings/smtp/test                   smtp_connectors.test          (formulaire, non persisté)
POST   .../settings/smtp/:connectorId/test       smtp_connectors.testExisting  (connecteur existant)
```

## Controllers

`SmtpConnectorsController` (index/create/store/edit/update/destroy/setDefault/toggleEnabled), `SmtpConnectorTestController` (test/testExisting). Le test de connexion a un timeout court côté controller (ex. 8s) pour ne jamais bloquer la requête HTTP indéfiniment sur un serveur SMTP injoignable.

## Services

- `SmtpConnectorService.create(project, payload)` : chiffre le password, si premier connecteur du projet force `is_default=true`.
- `SmtpConnectorService.setDefault(connector)` : transaction (désactive l'ancien défaut, active le nouveau).
- `SmtpConnectorService.delete(connector)` : refuse si `is_default=true` et qu'il existe d'autres connecteurs (impose de choisir un nouveau défaut d'abord) ; refuse si le connecteur est référencé par un node `send_email` d'une campagne **active** publiée (comme pour les segments, cf. `06-segments.md`) — message explicite.
- `SmtpConnectionTester.test(connectorConfigOrConnector)` : ouvre une connexion SMTP réelle (ex. via Nodemailer `createTransport(...).verify()` — voir Dependencies), timeout configurable, retourne `{ success: boolean, message?: string }`, ne logue/ne persiste jamais le mot de passe en clair dans les logs d'erreur.

## Models

`SmtpConnector` (relations : `project`, `emailDeliveries`). Scope nommé `SmtpConnector.query().forProject(project)`, `.enabled()`, `.default()`.

## Jobs / Commands

Aucun job dédié à ce domaine ; le test de connexion est synchrone (rapide par nature, timeout court). L'utilisation du connecteur pour l'envoi réel est orchestrée par `12-campaign-engine.md`/`14-jobs-and-queues.md`.

## Events

`SmtpConnectorCreated`, `SmtpConnectorUpdated`, `SmtpConnectorDeleted`, `SmtpConnectorDefaultChanged` — consommés par `AuditLogListener` uniquement (`20-observability-and-audit.md`) ; aucun effet métier en cascade nécessaire pour ce domaine.

## Permissions

Standard projet, avec une restriction supplémentaire : seuls `owner`/`admin` peuvent créer/éditer/supprimer un connecteur SMTP (credentials sensibles) — `member` et `viewer` en lecture seule (statut/nom visibles, jamais les credentials qui de toute façon ne sont jamais exposés à quiconque, cf. Security considerations).

## Validation

`app/validators/smtp_connector.ts` : `name` (unique par projet), `host` (string, format hostname/IP), `port` (entier 1–65535), `username` (string), `password` (string, requis à la création, optionnel à l'édition), `encryption` (enum), `fromEmail` (email valide), `fromName` (string), `replyTo` (email valide, optionnel), `dailyLimit` (entier positif, optionnel).

## Edge cases

- Suppression du connecteur par défaut alors qu'il en existe d'autres → bloqué, message "choisissez un autre connecteur par défaut avant de supprimer celui-ci".
- Suppression du seul connecteur du projet → autorisée (le projet peut temporairement n'avoir aucun connecteur ; toute tentative d'envoi échoue proprement avec un message explicite dans les logs d'exécution de campagne, cf. `12-campaign-engine.md`).
- Connecteur désactivé alors qu'il est le défaut → reste marqué défaut mais `enabled=false` bloque tout envoi ; l'UI affiche un avertissement visible tant qu'aucun connecteur actif n'est défini comme défaut.
- `dailyLimit` atteint → géré au niveau queue (rate limiting BullMQ par connecteur), pas au niveau de ce service — voir `14-jobs-and-queues.md`.

## Failure scenarios

- Test de connexion sur un host injoignable/port fermé → timeout → `success: false`, message généré à partir de l'erreur réseau (ex. `ECONNREFUSED`), jamais une 500 non gérée.
- Credentials valides au moment du test mais expirés/révoqués au moment d'un envoi réel plus tard → échec d'authentification SMTP au moment de l'envoi, traité comme une erreur potentiellement **non-retryable** par la classification du système de retry (voir `15-retry-and-idempotency.md` — une erreur d'auth ne se résout pas en réessayant).

## Idempotency considerations

Pas de préoccupation d'idempotence propre à ce domaine (CRUD classique). Le test de connexion est par nature sans effet de bord (aucun email envoyé), donc naturellement rejouable sans risque.

## Performance considerations

Volumes faibles (quelques connecteurs par projet) — aucune préoccupation particulière. Le point de performance pertinent (débit d'envoi, limite quotidienne) est traité au niveau queue (`14-jobs-and-queues.md`), pas dans ce domaine.

## Security considerations

- `password_encrypted` chiffré avec `@adonisjs/core/services/encryption` (AES-256-GCM via `APP_KEY`) — jamais stocké en clair, jamais journalisé.
- `SmtpConnectorTransformer` (et tout transformer dérivé) exclut explicitement `password`/`password_encrypted` de sa sortie — vérifié par un test dédié (voir Testing strategy) plutôt que laissé à la seule discipline du code.
- Le champ formulaire "password" n'est jamais pré-rempli côté frontend, même masqué — pas de round-trip du secret vers le navigateur, dans un sens comme dans l'autre.
- Erreurs de test de connexion : le message affiché à l'utilisateur peut contenir des détails techniques du serveur SMTP distant, mais ne doit jamais contenir le mot de passe (les erreurs Nodemailer standard ne le font pas nativement — vérification explicite en test que ce n'est pas le cas si un message d'erreur custom est construit).
- Voir `19-security.md` § SMTP credentials pour la politique transverse (rotation, accès restreint).

## Testing strategy

- Unit : `SmtpConnectorService` (chiffrement/déchiffrement round-trip, règle "un seul défaut par projet", édition avec password vide qui préserve l'existant).
- Unit : `SmtpConnectorTransformer` — test explicite que `password`/`password_encrypted` ne sont jamais dans la sortie sérialisée, quel que soit l'état du modèle.
- Functional : test de connexion avec un serveur SMTP de test (Mailcatcher, déjà disponible dans `docker-compose.dev.yml` sur le port 1025) pour le succès, et un host/port invalide pour l'échec.
- Authorization : `member`/`viewer` ne peuvent pas créer/éditer/supprimer.

## Implementation steps

1. `node ace make:migration create_smtp_connectors_table`.
2. `node ace migration:run`.
3. Créer le modèle `SmtpConnector` (scopes `forProject`, `enabled`, `default`).
4. Créer `app/validators/smtp_connector.ts`.
5. Créer `app/services/smtp/smtp_connector_service.ts` (chiffrement via le service `encryption` d'AdonisJS).
6. Ajouter la dépendance `nodemailer` (voir Dependencies) et créer `app/services/smtp/smtp_connection_tester.ts`.
7. Créer `app/transformers/smtp_connector_transformer.ts` (exclusion explicite des champs sensibles).
8. Créer les events (`app/events/smtp_connector_*.ts`).
9. Créer `SmtpConnectorsController`, `SmtpConnectorTestController` et les routes.
10. Créer les pages Inertia listées ci-dessus.
11. Écrire les tests listés ci-dessus (y compris le test contre Mailcatcher).

## Dependencies

`04-projects.md`. Nouvelle dépendance npm : `nodemailer` (client SMTP standard Node.js — non installée dans cette phase, à ajouter lors de l'implémentation ; c'est aussi la brique utilisée par `12-campaign-engine.md`/`14-jobs-and-queues.md` pour l'envoi réel, donc mutualisée entre ce plan et l'exécution des campagnes).

## Open questions

- Rotation programmée des secrets (ex. alerte si un connecteur n'a pas été testé depuis N jours) : non implémenté en v1, piste d'amélioration d'observabilité.
- Connecteurs "provider-aware" (formulaire simplifié pré-rempli pour Brevo/Mailgun/SES avec juste une clé API plutôt que host/port/user/password bruts) : v1 reste générique SMTP uniquement ; une intégration API-native (au lieu de SMTP) par provider serait un changement de modèle plus large, hors scope.
