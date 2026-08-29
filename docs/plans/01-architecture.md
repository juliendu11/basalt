# 01 — Architecture

## Principe général : monolithe modulaire

Un seul déploiement AdonisJS (le process HTTP existant) plus un ou plusieurs process **worker** (mêmes sources, autre point d'entrée ace command) consommant des files BullMQ. Pas de microservices : les "modules" sont des dossiers/domaines dans le même repository, avec des frontières de code claires mais un seul schéma de base de données et une seule transaction store.

Cela correspond à la structure déjà en place (`app/controllers`, `app/models`, `app/transformers`, `app/validators`, `app/middleware`, `providers/`) — on l'étend par domaine plutôt que par couche technique.

## Découpage en domaines (modules)

```text
app/
  models/
    organization.ts, organization_membership.ts, organization_invitation.ts
    project.ts
    contact.ts, tag.ts, contact_tag.ts
    segment.ts, segment_contact.ts
    smtp_connector.ts
    email_template.ts, email.ts
    campaign.ts, campaign_version.ts, campaign_node.ts, campaign_edge.ts
    campaign_enrollment.ts, campaign_execution.ts, campaign_execution_event.ts
    email_delivery.ts, email_event.ts
    unsubscribe_token.ts, contact_unsubscribe_event.ts
    audit_log.ts
    campaign_daily_stat.ts, project_daily_stat.ts
  controllers/
    organizations/..., projects/..., contacts/..., segments/..., smtp_connectors/...,
    email_templates/..., emails/..., campaigns/..., tracking/... (public, non authentifié)
  services/
    organizations/, projects/, contacts/, segments/, smtp/, emails/, campaigns/,
    automation/ (campaign engine), tracking/, statistics/, jobs/
  validators/
    organization.ts, project.ts, contact.ts, segment.ts, smtp_connector.ts,
    email_template.ts, email.ts, campaign.ts
  transformers/
    organization_transformer.ts, project_transformer.ts, contact_transformer.ts, ...
  events/
    contact_created.ts, contact_updated.ts, segment_membership_added.ts, ...
  listeners/
    (abonnés aux events ci-dessus : ex. enroll_contacts_on_segment_membership_added.ts)
  jobs/
    (payloads + handlers BullMQ, voir 14-jobs-and-queues.md)
  middleware/
    organization_context_middleware.ts, project_context_middleware.ts
  policies/
    organization_policy.ts, project_policy.ts, ...
  abilities/
    (définitions Bouncer transverses : ex. manageOrganizationMembers)
```

Chaque domaine expose un **service** (classe stateless, injectée via IoC) qui contient la logique métier ; les controllers restent fins (validation → service → transformer/redirect). Les modèles restent des objets de données + relations Lucid + petites méthodes de confort (comme `User.initials` existant), pas de logique métier lourde dedans.

## Frontière module ↔ module

- Un domaine ne requête jamais directement les tables d'un autre domaine par SQL brut ; il passe par le modèle/service public de ce domaine (ex : le Campaign Engine appelle `ContactsService.isEligibleForSending(contact)`, pas une requête ad hoc sur `contacts`).
- La communication asynchrone/faiblement couplée entre domaines passe par l'**event bus interne** (voir plus bas), pas par des appels directs en cascade quand ce n'est pas nécessaire au flux synchrone.

## Event bus interne

Pas de Kafka. On utilise le système d'événements déjà prévu par AdonisJS (`@adonisjs/core/services/emitter`, alias `#events/*` et `#listeners/*` déjà réservés dans `package.json`). Chaque événement métier est une petite classe/type dans `app/events/`, émise via `emitter.emit()`, avec des listeners enregistrés dans `start/events.ts` (nouveau fichier, à créer au premier domaine qui en a besoin).

Deux usages distincts, à ne pas confondre :

1. **Événements synchrones intra-requête** (ex : `ContactCreated` déclenche immédiatement un listener léger comme "invalider le cache de comptage") — exécutés dans le même process, avant la fin de la requête HTTP.
2. **Événements qui déclenchent du travail asynchrone lourd** (ex : `SegmentMembershipAdded` doit potentiellement enroller un contact dans une campagne) — le listener ne fait *pas* le travail lui-même, il **enqueue un job BullMQ**. Ça évite qu'un event handler synchrone ralentisse la requête HTTP ou échoue silencieusement sans retry.

Liste des événements internes prévus (détaillés dans les plans de feature correspondants) : `ContactCreated`, `ContactUpdated`, `ContactUnsubscribed`, `SegmentMembershipAdded`, `SegmentMembershipRemoved`, `CampaignEnrollmentCreated`, `CampaignNodeCompleted`, `EmailQueued`, `EmailSent`, `EmailFailed`, `EmailOpened`, `EmailClicked`.

## Queue / Redis

Redis est déjà provisionné en dev (`docker-compose.dev.yml`, service `cache`, port 6379) mais non encore utilisé par l'app. BullMQ sera ajouté (voir `14-jobs-and-queues.md` et `decisions/ADR-002-queue-system.md`). Les workers tournent comme des commandes ace dédiées (ex : `node ace queue:work`), déployables indépendamment du process HTTP mais issues du même build.

## Backend / Frontend

Inchangé dans son principe : AdonisJS sert des pages Inertia (`inertia.render('domaine/page', props)`), résolues côté client par `resolvePageComponent` (`inertia/app.ts`), et les échanges "API-like" (actions ponctuelles, polling de statut, futurs endpoints du canvas) utilisent `ctx.serialize()` côté serveur et le client Tuyau typé (`inertia/client.ts`) côté front. On ne construit pas une API REST séparée : Inertia reste le mode de communication principal pour la navigation/formulaires, l'API "sérialisée" sert les cas où une page a besoin de données sans navigation complète (ex : preview live d'un email, statut d'exécution d'une campagne).

## Diagramme d'ensemble

```mermaid
flowchart TB
    subgraph Browser
      Vue[Vue 3 + Inertia pages]
    end

    subgraph HTTP process
      MW[Middleware: auth, organization_context, project_context]
      CTRL[Controllers]
      SVC[Domain services]
      MODEL[Lucid models]
      EMIT[Event emitter]
    end

    subgraph Worker process(es)
      QW[BullMQ workers]
      ENGINE[Campaign Engine]
    end

    DB[(MySQL/MariaDB)]
    REDIS[(Redis)]
    SMTPX[SMTP providers]

    Vue -->|Inertia requests| MW --> CTRL --> SVC --> MODEL --> DB
    SVC --> EMIT
    EMIT -->|listeners enqueue jobs| REDIS
    REDIS --> QW --> ENGINE --> MODEL
    QW --> SMTPX
    SMTPX -->|tracking pixel / redirect / webhook| CTRL
```

## Pourquoi pas de repositories séparés

AdonisJS/Lucid fournit déjà un query builder riche et des scopes de modèle ; ajouter une couche "repository" générique par-dessus n'apporterait rien de plus que ce que les **services** + des **query scopes nommés sur les modèles** (ex : `Contact.query().forProject(project).active()`) apportent déjà, tout en étant plus idiomatique Adonis. On documente donc "services + model scopes", pas "repositories", pour rester aligné avec les conventions existantes du projet et éviter une abstraction qui ne sert aucun besoin concret (cf. priorité "simplicité").

## Configuration/infra par palier

| Palier | Composants |
|---|---|
| Petite installation | 1 app AdonisJS (HTTP), 1 worker BullMQ, 1 MySQL/MariaDB, 1 Redis |
| Installation plus importante | N instances HTTP derrière load balancer, M workers (scalés indépendamment par file), MySQL avec replicas lecture si besoin, Redis managé |

Le code ne change pas entre les deux paliers : seule la topologie de déploiement change (nombre de process). C'est la justification principale du choix "monolithe modulaire + queue" plutôt que microservices dès le départ.
