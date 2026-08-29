# ADR-002 — Queue system

## Context

Plusieurs traitements ne peuvent pas rester dans le cycle requête/réponse HTTP : envoi d'email, avancement du Campaign Engine (y compris des "wait" de plusieurs jours), recalcul de segment, enrollment de contacts, traitement d'événements de tracking entrants, retries, agrégation de statistiques. Il faut un système de queue/jobs qui :

- survit aux redémarrages/déploiements de l'application ;
- supporte des jobs différés (scheduled_at dans le futur, parfois plusieurs jours) ;
- supporte le retry avec backoff et un mécanisme "dead letter"/failed jobs consultable ;
- s'intègre proprement avec Node.js/AdonisJS ;
- n'impose pas une infrastructure lourde dès le départ (cf. priorité "simplicité", pas de Kafka).

## Options

**A. BullMQ + Redis**
- + Standard de facto dans l'écosystème Node.js pour les queues avec délai/retry/backoff/dead-letter natifs (`delay`, `attempts`, `backoff`, jobs "failed" consultables).
- + Redis est **déjà provisionné** dans `docker-compose.dev.yml` (service `cache`, port 6379), donc aucun nouveau composant d'infra à introduire en dev.
- + Écosystème mature (UI d'admin type Bull Board disponible si besoin plus tard), bonne doc, utilisé par de nombreux projets Adonis/Node en prod.
- − Nécessite de faire tourner un ou plusieurs process worker Node séparés du process HTTP (mais c'est vrai de toute solution de queue sérieuse).

**B. Table SQL "jobs" faite maison (polling)**
- + Zéro dépendance supplémentaire, tout dans MySQL déjà là.
- − Réimplémente à la main ce que BullMQ fait déjà bien (locking, retry, backoff, visibilité, priorités) ; risque de bugs de concurrence (deux workers qui pollent la même table) à gérer soi-même ; moins de tooling.

**C. Un service de queue managé externe (SQS, Cloud Tasks, etc.)**
- + Zéro infra à opérer soi-même.
- − Couplage à un fournisseur cloud spécifique, alors que le projet ne présuppose pas d'environnement de déploiement particulier ; complexifie le développement local ; aucun signal dans le projet qu'un tel service est déjà utilisé.

## Decision

**BullMQ + Redis.**

## Reasons

- Redis est déjà disponible dans l'environnement de dev du projet — c'est un signal fort que l'infra cible l'a anticipé.
- BullMQ couvre nativement les besoins listés dans `init.md` (delay/scheduled jobs, retry+backoff, échecs consultables) sans code maison à maintenir.
- S'intègre bien dans un monolithe modulaire Node : les workers sont juste un autre point d'entrée du même codebase (`node ace queue:work`), pas un service séparé à déployer différemment en dev.

## Jobs candidats à passer par la queue

```text
email sending              (send_email node exécuté → job d'envoi SMTP)
campaign execution advance (avancer un contact au nœud suivant, y compris après un wait)
segment rebuilding         (recalcul complet/partiel d'un segment)
campaign enrollment        (traiter un lot de contacts nouvellement membres d'un segment source)
event processing           (ingestion d'un événement de tracking entrant : open/click/bounce)
retry                      (BullMQ le gère nativement via `attempts`/`backoff`, pas un job séparé)
statistics aggregation     (job planifié nightly + job incrémental sur événement)
```

## Structure des files (queues)

Une file par domaine de charge, pour pouvoir scaler/monitorer indépendamment et éviter qu'un pic d'un domaine (ex. recalcul de segment sur 1M contacts) ne retarde un domaine plus sensible à la latence (ex. avancement de campagne) :

```text
emails            (envoi SMTP — sensible au débit/rate limit du connecteur)
campaign-engine   (avancement des executions, y compris les "wait" réveillés)
segments          (recalcul de segment)
tracking          (ingestion d'événements)
statistics        (agrégation)
```

Voir `14-jobs-and-queues.md` pour la configuration détaillée (concurrency, rate limiting par connecteur SMTP, priorités).

## Consequences

- Ajout de la dépendance `bullmq` (et son besoin de `ioredis` ou équivalent) — **non installée dans cette phase**, à faire lors de l'implémentation de `14-jobs-and-queues.md`.
- Ajout d'une commande ace `queue:work` (potentiellement une par file, ou une commande paramétrable `queue:work --queue=emails`) à créer.
- `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` à ajouter à `.env.example` et `config/redis.ts` (ou config BullMQ dédiée) lors de l'implémentation.
- Le déploiement doit prévoir de faire tourner au moins un process worker en continu, en plus du process HTTP (documenté dans `22-development-roadmap.md` comme prérequis de la Phase "Queue infrastructure").

## Risks

- Un worker qui crash pendant le traitement d'un job doit laisser BullMQ reprendre le job (mécanisme de `lockDuration`/stalled jobs natif) — mais ça ne suffit pas à garantir l'idempotence métier (ex. ne pas envoyer deux fois le même email) : voir `decisions/ADR-005-email-idempotency.md` et `15-retry-and-idempotency.md` pour la stratégie complémentaire au niveau applicatif.
- Redis en dev n'a pas de persistance forte configurée par défaut dans `docker-compose.dev.yml` (`--save 20 1`, donc une perte de process peut perdre les dernières secondes de jobs) — acceptable en dev ; en production, prévoir une politique de persistance Redis adaptée (AOF ou RDB plus fréquent) documentée au moment du déploiement, hors scope de ces plans.
