# Mission

Tu travailles sur un projet web existant dont l'objectif est de créer une plateforme de marketing automation inspirée de **Mautic**, mais construite entièrement avec une stack Node.js moderne.

L'application doit principalement être spécialisée dans :

- la gestion de contacts ;
- la segmentation automatique ;
- la création de campagnes email ;
- l'automatisation visuelle de campagnes ;
- l'envoi d'emails via SMTP ;
- les statistiques ;
- la gestion multi-organisations et multi-projets.

L'objectif n'est **PAS** de reproduire Mautic à l'identique.

Il faut concevoir une architecture moderne, simple à maintenir, scalable et adaptée à la stack actuelle du projet.

---

# Stack technique actuelle

Le projet existe déjà.

Stack :

- **Node.js**
- **AdonisJS v7**
- **Vue.js**
- **Inertia.js**
- **Tailwind CSS**
- **DaisyUI**

Avant toute proposition, inspecte le projet existant afin de comprendre :

- son architecture ;
- ses conventions ;
- ses modèles existants ;
- son système d'authentification ;
- son routing ;
- ses migrations ;
- ses services ;
- ses controllers ;
- ses jobs éventuels ;
- sa structure Vue/Inertia ;
- ses composants UI ;
- ses conventions TypeScript ;
- les packages déjà installés ;
- les éventuelles fonctionnalités déjà implémentées.

Ne propose pas une nouvelle architecture déconnectée du projet existant si l'architecture actuelle peut être proprement étendue.

---

# RÈGLE ABSOLUE POUR CETTE PHASE

## TU NE DOIS ÉCRIRE AUCUN CODE APPLICATIF.

Cette première phase est exclusivement une phase :

- d'analyse ;
- d'architecture ;
- de conception ;
- de documentation ;
- de planification.

Tu ne dois :

- créer aucun controller ;
- créer aucun model ;
- créer aucune migration ;
- modifier aucun composant Vue ;
- installer aucun package ;
- modifier aucun fichier applicatif ;
- implémenter aucune feature ;
- modifier aucun comportement existant.

La seule zone du repository que tu es autorisé à créer ou modifier pendant cette phase est :

```text
./docs/plans/
```

Tu dois créer les différents plans techniques nécessaires **avant que le développement commence**.

Ces documents serviront ensuite de référence à Claude Code pour implémenter chaque fonctionnalité séparément.

---

# Objectif produit

L'application doit fonctionner selon cette hiérarchie principale :

```text
User
  └── Organization
        └── Project
              ├── Contacts
              ├── Segments
              ├── SMTP Connectors
              ├── Email Templates
              ├── Emails
              ├── Campaigns
              ├── Campaign Executions
              ├── Email Events
              └── Statistics
```

Un utilisateur peut appartenir à une ou plusieurs organisations.

Une organisation peut contenir plusieurs projets.

Les principales données marketing doivent être isolées au niveau du **Project**.

Par exemple :

- contacts ;
- segments ;
- campagnes ;
- emails ;
- templates ;
- connecteurs SMTP ;
- statistiques.

---

# Fonctionnalités principales à concevoir

## 1. Organisations

Créer un système multi-organisation.

Conceptuellement :

```text
User
  ↓
Organization Membership
  ↓
Organization
```

Prévoir notamment :

- création d'organisation ;
- édition ;
- suppression ;
- membres ;
- rôles ;
- permissions ;
- propriétaire ;
- invitation éventuelle de nouveaux membres ;
- sélection de l'organisation active ;
- isolation des données.

Réfléchir à un système de permissions suffisamment évolutif.

Exemples :

- owner ;
- admin ;
- member ;
- viewer.

Le système pourra évoluer ultérieurement.

---

# 2. Projets

Chaque organisation peut disposer de plusieurs projets.

Un projet constitue l'espace principal dans lequel les campagnes marketing sont créées.

Exemple :

```text
Organization
   ├── Project A
   ├── Project B
   └── Project C
```

Chaque projet possède ses propres :

- contacts ;
- segments ;
- SMTP ;
- emails ;
- templates ;
- campagnes ;
- statistiques ;
- paramètres.

Les données entre projets doivent être strictement isolées.

---

# 3. Contacts

Créer un système de gestion de contacts similaire au concept de contacts Mautic.

Fonctionnalités à prévoir :

- création ;
- édition ;
- suppression ;
- consultation ;
- recherche ;
- pagination ;
- filtres ;
- tags éventuels ;
- champs standards ;
- champs personnalisés à terme ;
- import éventuel ;
- statut ;
- informations email.

Exemples de champs :

```text
email
firstname
lastname
phone
company
country
city
language
timezone
status
createdAt
updatedAt
```

Réfléchir également à la manière de gérer :

- désabonnement ;
- email invalide ;
- bounced ;
- blocked ;
- complained ;
- suppression logique éventuelle.

Les contacts appartiennent obligatoirement à un `project`.

---

# 4. Segments

Un segment représente une sélection dynamique de contacts basée sur des critères.

Exemples :

```text
country = France
AND
language = fr
AND
status = active
```

ou :

```text
created_at < 30 days
AND
has_received_campaign_X = false
```

Le système doit permettre de créer :

- des groupes de conditions ;
- AND ;
- OR ;
- opérateurs différents selon le type de champ.

Exemples :

```text
equals
not_equals
contains
not_contains
starts_with
ends_with
greater_than
less_than
before
after
is_null
is_not_null
in
not_in
```

Les segments sont définis par projet.

---

# Calcul automatique des segments

L'appartenance des contacts aux segments ne doit pas forcément être recalculée à chaque requête HTTP.

Prévoir une architecture permettant de recalculer les segments via :

- command Adonis ;
- scheduler ;
- jobs ;
- queue.

Exemple conceptuel :

```text
Segment definition
        ↓
Segment evaluator
        ↓
Contact query
        ↓
Segment membership
```

Il faut réfléchir à la stratégie la plus adaptée.

Comparer si nécessaire :

### Option A
Calcul dynamique permanent.

### Option B
Table de membership persistée :

```text
segment_contacts
```

### Option C
Approche hybride.

Justifier le choix recommandé.

Prévoir également les conséquences sur des bases contenant :

- 1 000 contacts ;
- 100 000 contacts ;
- 1 000 000 contacts.

---

# 5. Connecteurs SMTP

Chaque projet doit pouvoir enregistrer un ou plusieurs connecteurs SMTP.

Exemples :

- Brevo ;
- Mailgun SMTP ;
- SendGrid SMTP ;
- Amazon SES SMTP ;
- serveur SMTP personnalisé.

Configuration typique :

```text
name
host
port
username
password
encryption
from_email
from_name
reply_to
enabled
```

Les credentials doivent être stockés de manière sécurisée.

Prévoir :

- chiffrement des secrets ;
- test de connexion ;
- connecteur par défaut ;
- activation/désactivation ;
- éventuelles limites d'envoi ;
- rotation future de connecteurs.

Ne jamais exposer directement les credentials SMTP au frontend.

---

# 6. Modèles d'emails

Chaque projet peut créer des modèles d'emails réutilisables.

Prévoir :

- nom ;
- subject ;
- contenu HTML ;
- contenu texte ;
- variables ;
- preview ;
- duplication ;
- édition ;
- suppression.

Exemple de variables :

```text
{{ contact.firstname }}
{{ contact.lastname }}
{{ contact.email }}
{{ project.name }}
{{ unsubscribe_url }}
```

Prévoir un moteur de variables extensible.

Il faudra distinguer clairement :

```text
Email Template
```

et éventuellement :

```text
Campaign Email
```

Une campagne doit pouvoir utiliser un template mais conserver son propre contenu/version si nécessaire.

---

# 7. Emails

Permettre la création d'emails destinés aux campagnes.

Prévoir notamment :

- subject ;
- preheader ;
- sender name ;
- sender email ;
- reply-to ;
- contenu HTML ;
- contenu texte ;
- template ;
- variables ;
- statut draft/published éventuel.

Étudier comment gérer la version du contenu d'un email lorsqu'une campagne est déjà active.

Éviter qu'une modification future du template modifie involontairement une campagne déjà en cours d'exécution.

---

# 8. Campagnes

C'est l'une des fonctionnalités centrales.

Créer un système de campagnes visuelles inspiré de :

- Mautic ;
- n8n ;
- Zapier ;
- systèmes de workflow modernes.

Une campagne appartient à un projet.

Une campagne possède une ou plusieurs sources.

Au départ, la source principale sera :

```text
Segment
```

Exemple :

```text
Segment
   ↓
Send Email
   ↓
Wait 2 days
   ↓
Condition
   ├── YES → Send Email B
   └── NO  → Wait 3 days → Send Email C
```

---

# 9. Canvas / Workflow Builder

Le frontend doit à terme disposer d'un canvas permettant de construire visuellement une campagne.

Ne l'implémente pas maintenant.

Conçois son architecture.

Un workflow peut être constitué de nodes.

Catégories initiales :

## Source

Exemple :

```text
Segment
```

---

## Action

Exemples :

```text
Send Email
Wait
Add Tag
Remove Tag
Add To Segment
Remove From Segment
```

Certaines actions pourront être ajoutées plus tard.

---

## Condition

Exemples :

```text
Email opened?
Email clicked?
Contact field condition?
Contact belongs to segment?
```

Résultat :

```text
true
false
```

---

## Trigger / Event

Prévoir l'architecture pour des événements futurs comme :

```text
Email opened
Email clicked
Contact created
Contact updated
Webhook received
```

Même s'ils ne sont pas tous implémentés dans la première version.

---

# Format interne des workflows

Concevoir comment sauvegarder le canvas.

Par exemple :

```json
{
  "nodes": [],
  "edges": []
}
```

Mais ne considère pas cette structure comme imposée.

Analyse les avantages/inconvénients entre :

- stockage JSON ;
- tables relationnelles pour nodes/edges ;
- modèle hybride.

La solution doit permettre :

- modification du workflow ;
- validation ;
- versioning ;
- exécution efficace ;
- debugging ;
- historique ;
- future migration de format.

---

# 10. Campaign Engine

Le canvas n'est que la représentation visuelle.

Il faut concevoir séparément un véritable **Campaign Engine** capable d'exécuter le workflow.

Le moteur devra pouvoir gérer :

```text
Contact
  ↓
Campaign
  ↓
Campaign execution
  ↓
Current node
  ↓
Execute action
  ↓
Determine next node
```

Chaque contact peut être à un endroit différent du workflow.

Exemple :

```text
Contact A → node 3
Contact B → node 8
Contact C → waiting until tomorrow
```

Prévoir une architecture permettant de reprendre l'exécution sans perdre l'état.

---

# 11. Campaign Enrollment

Lorsqu'un contact entre dans un segment source associé à une campagne :

```text
Contact
   ↓
Segment
   ↓
Campaign enrollment
```

Il doit pouvoir entrer dans la campagne.

Définir clairement les règles concernant :

- première entrée ;
- sortie du segment ;
- réentrée ;
- campagne déjà terminée ;
- campagne désactivée ;
- contact désabonné ;
- contact supprimé ;
- contact bloqué.

Prévoir une stratégie configurable pour le futur.

---

# 12. Wait / Scheduling

Une campagne doit pouvoir contenir :

```text
Wait 30 minutes
Wait 2 hours
Wait 3 days
Wait until Monday
Wait until 09:00
```

Il ne faut évidemment pas maintenir une requête Node.js ouverte pendant plusieurs jours.

Concevoir une architecture reposant sur :

- jobs ;
- scheduled_at ;
- scheduler ;
- queue ;
- workers.

Les campagnes doivent pouvoir survivre :

- aux redémarrages du serveur ;
- aux crashs ;
- aux déploiements.

---

# 13. Queue et workers

Étudier la nécessité d'un système de queue.

Exemples envisageables :

- BullMQ ;
- Redis ;
- autre solution compatible avec l'écosystème AdonisJS/Node.js.

Ne pas installer le package maintenant.

Documenter la solution recommandée et sa justification.

Identifier les tâches qui devraient probablement passer dans la queue :

```text
email sending
campaign execution
segment rebuilding
campaign enrollment
event processing
retry
statistics aggregation
```

---

# 14. Système de retry

Le système doit être robuste aux erreurs.

Exemple :

```text
Send Email
   ↓
SMTP timeout
   ↓
Retry
```

Prévoir une stratégie du type :

```text
attempt 1
↓
30 sec

attempt 2
↓
2 min

attempt 3
↓
10 min

attempt 4
↓
failed
```

Mais déterminer une stratégie pertinente.

Prévoir :

- retry automatique ;
- exponential backoff éventuel ;
- max attempts ;
- erreurs retryables ;
- erreurs non retryables ;
- dead letter / failed jobs éventuels ;
- consultation des erreurs ;
- relance manuelle éventuelle ;
- idempotence.

Une action ne doit pas envoyer accidentellement plusieurs fois le même email si un worker crash après l'envoi mais avant d'avoir marqué le job comme terminé.

Documenter particulièrement ce problème.

---

# 15. Tracking des emails

Prévoir dans l'architecture le tracking futur ou initial de :

```text
sent
delivered
opened
clicked
bounced
complained
failed
unsubscribed
```

Certaines informations peuvent dépendre du fournisseur SMTP/API.

Il faudra réfléchir à un modèle générique d'events.

Exemple :

```text
email_events
```

avec éventuellement :

```text
project_id
campaign_id
campaign_execution_id
contact_id
email_id
type
metadata
occurred_at
```

Ne considère pas cette structure comme obligatoire.

Conçois la meilleure solution.

---

# 16. Désabonnement

L'application doit être compatible avec un système sérieux d'email marketing.

Prévoir :

- lien de désabonnement ;
- token sécurisé ;
- statut du contact ;
- suppression des futurs envois ;
- historique du consentement / unsubscribe si pertinent.

Le Campaign Engine doit toujours vérifier qu'un contact est encore éligible avant un envoi.

---

# 17. Statistiques / Dashboard

Créer à terme un tableau de bord par projet.

Prévoir les statistiques pertinentes.

Par exemple :

```text
Contacts total
Contacts actifs
Segments
Campagnes actives
Emails envoyés
Emails délivrés
Emails ouverts
Emails cliqués
Emails bounced
Emails failed
Unsubscribes
Open rate
Click rate
Bounce rate
```

Statistiques possibles :

```text
Today
Last 7 days
Last 30 days
Custom period
```

Prévoir :

- métriques globales ;
- statistiques par campagne ;
- statistiques par email ;
- statistiques temporelles.

Étudier si certaines statistiques doivent être :

- calculées à la volée ;
- pré-agrégées ;
- stockées dans des tables dédiées.

---

# 18. Audit / Logs / Historique

Prévoir une architecture permettant de comprendre ce qui s'est passé.

Exemples :

```text
Contact enrolled in campaign
Campaign execution started
Node executed
Email queued
Email sent
SMTP failed
Retry scheduled
Condition evaluated
Campaign completed
```

Les informations de debugging doivent être suffisantes pour comprendre pourquoi un contact n'a pas reçu un email.

---

# 19. Idempotence

Ce point est critique.

Le système étant basé sur :

- workers ;
- jobs ;
- retries ;
- événements ;

certaines opérations peuvent être exécutées plusieurs fois.

Concevoir une stratégie d'idempotence.

Cas particulièrement important :

```text
worker sends email
↓
SMTP accepts email
↓
worker crashes
↓
job considered unfinished
↓
job retried
```

Le contact ne doit pas automatiquement recevoir deux fois le même email.

Proposer une architecture fiable pour limiter ces problèmes.

---

# 20. Concurrence

Analyser les problèmes potentiels liés à l'exécution parallèle.

Exemple :

Deux workers essaient simultanément de faire progresser :

```text
CampaignExecution #123
```

Prévoir les mécanismes possibles :

- DB locking ;
- optimistic locking ;
- status transitions ;
- unique constraints ;
- job uniqueness ;
- transactions.

Documenter la solution recommandée.

---

# 21. Scalabilité

L'architecture doit fonctionner dans un premier temps avec une infrastructure simple, mais pouvoir évoluer.

Prévoir plusieurs niveaux.

## Petite installation

```text
1 application
1 database
1 worker
Redis
```

## Installation plus importante

```text
multiple app servers
multiple workers
Redis
database
```

La conception ne doit pas nécessiter une architecture microservices dès le départ.

Favoriser un **monolithe modulaire**.

---

# Principe architectural privilégié

Sauf raison forte contraire, privilégier :

```text
AdonisJS Modular Monolith
```

avec des domaines clairement séparés.

Exemples conceptuels :

```text
Organizations
Projects
Contacts
Segments
Emails
SMTP
Campaigns
Automation
Tracking
Statistics
Jobs
```

Éviter les microservices prématurés.

---

# Frontend

Le frontend utilise :

```text
Vue.js
Inertia.js
Tailwind CSS
DaisyUI
```

Réutiliser autant que possible :

- layouts existants ;
- composants existants ;
- conventions du projet.

Prévoir une UI avec navigation du type :

```text
Dashboard

Contacts
Segments

Campaigns

Emails
Templates

Settings
  SMTP
  Project
```

Ne pas créer l'interface maintenant.

Documenter uniquement :

- pages nécessaires ;
- composants majeurs ;
- responsabilités ;
- état frontend ;
- échanges backend ;
- structure du canvas.

---

# Canvas

Pour le Campaign Builder, analyser les bibliothèques Vue existantes adaptées aux node-based editors.

Par exemple un équivalent conceptuel de :

```text
Vue Flow
```

Mais ne pas installer de dépendance maintenant.

Documenter :

- librairie recommandée ;
- raisons ;
- alternatives ;
- représentation des nodes ;
- représentation des edges ;
- synchronisation frontend/backend ;
- validation.

---

# Sécurité

La documentation doit prendre en compte :

- isolation organisation ;
- isolation projet ;
- authorization ;
- validation des inputs ;
- SMTP credentials ;
- encryption ;
- XSS dans les templates HTML ;
- injections ;
- CSRF ;
- protections liées à Inertia ;
- rate limiting ;
- endpoints de tracking ;
- unsubscribe tokens ;
- webhooks futurs.

---

# Base de données

Je veux une réflexion sérieuse sur le modèle de données.

Créer dans la documentation un ERD conceptuel ou une représentation textuelle claire.

Par exemple :

```text
users

organizations
organization_users

projects

contacts

segments
segment_filters
segment_contacts

smtp_connectors

email_templates
emails

campaigns
campaign_versions
campaign_nodes
campaign_edges

campaign_enrollments
campaign_executions

email_deliveries
email_events

...
```

Cette liste est une piste et non une obligation.

Tu dois proposer ton propre modèle après analyse.

Pour chaque table proposée, documenter :

- responsabilité ;
- relations ;
- contraintes ;
- indexes importants ;
- unique constraints ;
- données JSON éventuelles ;
- stratégie de suppression.

---

# IDs

Analyser si le projet utilise actuellement :

- auto increment ;
- UUID ;
- ULID.

Respecter les conventions existantes autant que possible.

Si une évolution est recommandée, l'expliquer mais ne pas la mettre en œuvre.

---

# Dates et timezones

Les campagnes peuvent être programmées.

Il faut donc définir une stratégie cohérente.

Par exemple :

```text
database → UTC
user/project timezone → configuration
display → timezone utilisateur
campaign scheduling → timezone projet
```

Documenter précisément ce comportement.

---

# Structure des plans

Créer :

```text
./docs/plans/
```

Puis créer au minimum les documents suivants.

```text
00-overview.md

01-architecture.md
02-database-design.md
03-organizations.md
04-projects.md
05-contacts.md
06-segments.md
07-smtp-connectors.md
08-email-templates.md
09-emails.md
10-campaigns.md
11-campaign-builder.md
12-campaign-engine.md
13-campaign-enrollment.md
14-jobs-and-queues.md
15-retry-and-idempotency.md
16-email-tracking.md
17-unsubscribe.md
18-statistics-dashboard.md
19-security.md
20-observability-and-audit.md
21-testing-strategy.md
22-development-roadmap.md
```

Tu peux ajouter d'autres fichiers si l'analyse montre qu'ils sont nécessaires.

---

# 00-overview.md

Ce fichier doit donner une vue globale du produit.

Inclure :

```text
Vision
Scope
Non-scope
Domain model
Main features
Main entities
Main data flows
Architecture summary
Technology decisions
Development phases
```

Inclure également un diagramme Mermaid global si pertinent.

---

# 01-architecture.md

Décrire :

- architecture générale ;
- monolithe modulaire ;
- modules ;
- services ;
- repositories éventuels ;
- controllers ;
- domain services ;
- jobs ;
- events ;
- frontend/backend ;
- queue ;
- Redis éventuel ;
- DB.

Inclure un diagramme Mermaid.

---

# 02-database-design.md

Documenter l'intégralité du modèle de données envisagé.

Inclure :

- tables ;
- relations ;
- indexes ;
- contraintes ;
- stratégie JSON/relationnel ;
- soft delete éventuel ;
- timestamps ;
- ERD Mermaid.

---

# Chaque plan de feature

Chaque document concernant une fonctionnalité doit suivre approximativement cette structure :

```text
# Feature name

## Objective

## Functional requirements

## User flows

## Domain concepts

## Data model

## Backend architecture

## Frontend architecture

## Routes

## Controllers

## Services

## Models

## Jobs / Commands

## Events

## Permissions

## Validation

## Edge cases

## Failure scenarios

## Idempotency considerations

## Performance considerations

## Security considerations

## Testing strategy

## Implementation steps

## Dependencies

## Open questions
```

Attention :

Les sections :

```text
Routes
Controllers
Services
Models
Jobs
```

décrivent ce qu'il faudra créer plus tard.

Tu ne dois rien créer actuellement.

---

# Implementation steps

La partie :

```text
Implementation steps
```

est particulièrement importante.

Elle doit être suffisamment détaillée pour qu'une future session Claude Code puisse recevoir simplement :

```text
Implement ./docs/plans/06-segments.md
```

et disposer de suffisamment d'informations pour développer la feature correctement.

Les étapes doivent donc être atomiques et ordonnées.

Exemple :

```text
1. Create migration ...
2. Create model ...
3. Create service ...
4. Create query builder ...
5. Add command ...
6. Add queue job ...
7. Create controller ...
8. Add routes ...
9. Add Inertia pages ...
10. Add tests ...
```

Mais NE PAS exécuter ces étapes dans cette phase.

---

# Development roadmap

Créer :

```text
22-development-roadmap.md
```

Déterminer l'ordre optimal de développement.

Par exemple, probablement quelque chose ressemblant à :

```text
Phase 1
Core architecture

Phase 2
Organizations

Phase 3
Projects

Phase 4
Contacts

Phase 5
SMTP

Phase 6
Templates / Emails

Phase 7
Segments

Phase 8
Queue infrastructure

Phase 9
Campaign model

Phase 10
Campaign Builder

Phase 11
Campaign Engine

Phase 12
Tracking

Phase 13
Statistics
```

Mais analyse les dépendances et propose toi-même l'ordre optimal.

Pour chaque phase indiquer :

- dépendances ;
- objectifs ;
- critères de validation ;
- risques ;
- plans concernés.

---

# Architecture Decision Records

Lorsque plusieurs choix architecturaux importants existent, documenter explicitement la décision.

Exemples :

```text
JSON vs relational campaign graph

BullMQ vs alternative

segment membership persisted vs dynamic

campaign graph versioning

event system

email delivery idempotency

statistics aggregation
```

Créer éventuellement :

```text
./docs/plans/decisions/
```

avec des ADR de type :

```text
ADR-001-campaign-graph-storage.md
ADR-002-queue-system.md
ADR-003-segment-membership.md
ADR-004-campaign-versioning.md
ADR-005-email-idempotency.md
```

Chaque ADR doit contenir :

```text
Context
Options
Decision
Reasons
Consequences
Risks
```

---

# Campagnes : distinguer Design et Runtime

La documentation doit faire une distinction très claire entre :

```text
Campaign Definition
```

et :

```text
Campaign Runtime
```

Exemple conceptuel :

```text
Campaign Definition
    ↓
Campaign Version
    ↓
Nodes + Edges
```

contre :

```text
Campaign Enrollment
    ↓
Campaign Execution
    ↓
Current Node
    ↓
Scheduled Execution
```

Un changement effectué sur le canvas ne doit pas automatiquement corrompre les contacts déjà engagés dans une campagne.

Réfléchir à un système de versioning.

Exemple :

```text
Campaign
 ├── Draft Version 4
 └── Published Version 3
```

Les contacts existants pourraient continuer sur :

```text
Version 3
```

alors que les nouveaux utilisent :

```text
Version 4
```

après publication.

Documenter la stratégie recommandée.

---

# Event-driven architecture

Analyser l'intérêt d'avoir des événements internes.

Exemples :

```text
ContactCreated
ContactUpdated

SegmentMembershipAdded
SegmentMembershipRemoved

CampaignEnrollmentCreated

CampaignNodeCompleted

EmailQueued
EmailSent
EmailFailed

EmailOpened
EmailClicked

ContactUnsubscribed
```

Cela ne signifie pas qu'il faut introduire Kafka ou une architecture distribuée.

Un event bus interne au monolithe peut être suffisant.

Documenter la meilleure approche.

---

# État des emails

Concevoir une state machine cohérente.

Exemple possible :

```text
pending
queued
processing
sent
delivered
failed
bounced
```

Mais distinguer :

```text
delivery status
```

des événements :

```text
opened
clicked
```

Un email peut être :

```text
delivered
```

et avoir ensuite :

```text
opened
clicked
```

Ne mélange pas ces concepts.

---

# État d'une campagne

Prévoir par exemple :

```text
draft
active
paused
completed
archived
```

Analyser les comportements précis.

Exemple :

Que se passe-t-il lorsqu'une campagne est mise en pause ?

Les jobs existants sont-ils :

- supprimés ;
- laissés en attente ;
- bloqués au moment de l'exécution ?

Documenter le choix.

---

# Campaign execution state machine

Créer une représentation claire des différents états possibles.

Exemple conceptuel :

```text
pending
running
waiting
completed
failed
cancelled
```

Inclure un diagramme Mermaid de state machine.

---

# Performance

Pour chaque feature importante, réfléchir aux indexes nécessaires.

Cas typiques :

```text
contacts project_id + email

segment_contacts segment_id + contact_id

campaign_enrollments campaign_id + contact_id

campaign_executions status + scheduled_at

email_deliveries status + created_at
```

Ne pas accepter aveuglément ces indexes : déterminer ceux réellement pertinents.

Réfléchir aux requêtes qui seront exécutées fréquemment.

---

# Analyse préalable obligatoire

Avant de créer les plans :

1. inspecter le repository ;
2. identifier les conventions actuelles ;
3. identifier les fonctionnalités existantes ;
4. identifier les packages disponibles ;
5. identifier le système DB ;
6. identifier le système d'auth ;
7. identifier l'organisation des routes ;
8. identifier les conventions frontend ;
9. identifier les tests existants ;
10. identifier les composants réutilisables.

Ensuite seulement créer la documentation.

---

# Ne pas surarchitecturer

Cette application doit être sérieuse et scalable mais rester développable par une petite équipe.

Éviter :

```text
microservices
Kafka
CQRS complet
event sourcing complet
Kubernetes obligatoire
```

sauf justification exceptionnelle.

Favoriser :

```text
modular monolith
database transactions
background workers
Redis queue
domain services
internal events
clear boundaries
```

Le système doit pouvoir évoluer vers une architecture plus distribuée si nécessaire, sans payer ce coût dès le départ.

---

# Priorités architecturales

Ordre de priorité :

1. fiabilité ;
2. maintenabilité ;
3. simplicité ;
4. sécurité ;
5. observabilité ;
6. performance ;
7. scalabilité.

Éviter les abstractions complexes ne servant aucun besoin concret.

---

# Tests

Prévoir une stratégie complète de tests.

Différencier :

```text
unit tests
integration tests
functional tests
job tests
campaign engine tests
SMTP tests
authorization tests
```

Les fonctionnalités critiques nécessitent une forte couverture.

En particulier :

```text
segment evaluation
campaign traversal
retry
idempotency
authorization
project isolation
email sending
campaign enrollment
wait scheduling
```

---

# Important : cas réels à documenter

Les plans doivent expliquer comment le système gérera ces scénarios.

### Scénario 1

```text
Contact enters Segment A
↓
Campaign starts
↓
Email A
↓
Wait 2 days
↓
Email B
```

---

### Scénario 2

```text
Contact enters Campaign
↓
Email fails
↓
SMTP timeout
↓
Retry
↓
Email succeeds
```

---

### Scénario 3

```text
Contact waiting for 3 days
↓
server restarts
↓
contact must still resume correctly
```

---

### Scénario 4

```text
Campaign is edited
while 10 000 contacts are already inside it
```

Expliquer le comportement attendu.

---

### Scénario 5

```text
Two workers receive the same execution
```

Expliquer comment empêcher une double exécution.

---

### Scénario 6

```text
SMTP accepts email
worker crashes before DB update
job gets retried
```

Expliquer la stratégie contre les doubles emails.

---

### Scénario 7

```text
Contact unsubscribes
while already waiting inside several campaigns
```

Expliquer comment empêcher les prochains emails.

---

### Scénario 8

```text
Segment contains 500 000 contacts
```

Expliquer comment reconstruire le segment sans bloquer l'application.

---

# Livrable attendu

À la fin de cette phase, je veux obtenir uniquement une arborescence documentaire du type :

```text
docs/
└── plans/
    ├── 00-overview.md
    ├── 01-architecture.md
    ├── 02-database-design.md
    ├── 03-organizations.md
    ├── 04-projects.md
    ├── 05-contacts.md
    ├── 06-segments.md
    ├── 07-smtp-connectors.md
    ├── 08-email-templates.md
    ├── 09-emails.md
    ├── 10-campaigns.md
    ├── 11-campaign-builder.md
    ├── 12-campaign-engine.md
    ├── 13-campaign-enrollment.md
    ├── 14-jobs-and-queues.md
    ├── 15-retry-and-idempotency.md
    ├── 16-email-tracking.md
    ├── 17-unsubscribe.md
    ├── 18-statistics-dashboard.md
    ├── 19-security.md
    ├── 20-observability-and-audit.md
    ├── 21-testing-strategy.md
    ├── 22-development-roadmap.md
    └── decisions/
        ├── ADR-001-...
        ├── ADR-002-...
        └── ...
```

Tu peux modifier ou enrichir cette arborescence si ton analyse montre qu'une séparation différente est plus cohérente.

---

# Critère principal de qualité

À la fin de ton travail, chaque feature doit être suffisamment documentée pour qu'une nouvelle session Claude Code puisse recevoir simplement :

```text
Read ./docs/plans/XX-feature.md and implement this feature.
```

et comprendre :

- ce qu'elle doit faire ;
- pourquoi ;
- quelles tables utiliser ;
- quelles relations créer ;
- quels services prévoir ;
- quelles routes prévoir ;
- quels jobs prévoir ;
- quelles pages frontend créer ;
- comment gérer les erreurs ;
- comment gérer la sécurité ;
- comment tester ;
- comment la feature interagit avec le reste du système.

---

# Vérification finale obligatoire

Avant de terminer :

1. relire tous les documents créés ;
2. vérifier qu'ils ne se contredisent pas ;
3. vérifier les noms des entités ;
4. vérifier les relations DB ;
5. vérifier les dépendances entre features ;
6. vérifier que Campaign Builder et Campaign Engine sont correctement séparés ;
7. vérifier que les stratégies de queue/retry/idempotence sont cohérentes ;
8. vérifier que l'isolation Organization/Project est respectée partout ;
9. vérifier que le roadmap respecte les dépendances ;
10. vérifier qu'aucun code applicatif n'a été modifié.

Enfin, produire dans le terminal un court résumé contenant :

```text
Plans created:
- ...
- ...
- ...

Major architectural decisions:
- ...
- ...

Recommended implementation order:
1. ...
2. ...
3. ...

Application code modified: NO
```

---

# CONTRAINTE FINALE

Pour cette mission :

**ANALYSE ET DOCUMENTATION UNIQUEMENT.**

Ne commence l'implémentation d'aucune feature, même si elle semble triviale.

Le développement commencera dans une deuxième phase, feature par feature, en utilisant les fichiers présents dans :

```text
./docs/plans/
```

comme source de vérité.