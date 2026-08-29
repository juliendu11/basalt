# 21 — Testing Strategy

## Objective

Définir la stratégie de tests transverse (types de suites, ce qui doit être testé où, exigences de couverture pour les zones critiques) — les tests concrets de chaque domaine sont déjà détaillés dans leur plan respectif (§ Testing strategy) ; ce plan fixe les conventions communes et complète ce qui est spécifiquement transverse.

## État actuel du projet

`adonisrc.ts` déclare déjà trois suites (`unit`, `functional`, `browser`) mais leurs dossiers (`tests/unit`, `tests/functional`, `tests/browser`) n'existent pas encore — à créer au premier test écrit, en suivant cette convention déjà actée par la configuration existante plutôt qu'une structure alternative. Le projet a déjà `@japa/assert`, `@japa/browser-client`, `@japa/plugin-adonisjs`, `@japa/runner` en dépendances (Japa est le framework de test AdonisJS standard, déjà installé).

## Functional requirements

- Suite `unit` : logique pure, sans DB ni HTTP (évaluateurs, services de calcul, helpers).
- Suite `functional` : bout-en-bout HTTP (requêtes via le client de test AdonisJS, DB réelle de test, assertions sur la réponse/l'état DB).
- Suite `job` : exécution de jobs BullMQ en isolation (nouvelle catégorie logique, à l'intérieur de `functional` ou dédiée — voir Domain concepts).
- Suite `browser` : parcours UI critiques (Playwright via `@japa/browser-client`, déjà en dépendance) — utilisée avec parcimonie (coûteuse), réservée aux parcours qui ne peuvent pas être vérifiés autrement (ex. le canvas Vue Flow, `11-campaign-builder.md`).
- Couverture renforcée explicite sur les zones listées par `init.md` comme critiques.

## Domain concepts

**Répartition par type** (convention à appliquer à chaque plan de domaine, déjà globalement respectée dans les sections "Testing strategy" précédentes) :

```text
unit         -- SegmentEvaluator, VariableRenderer, NodeExecutors, CampaignGraphValidator,
                IdempotentOperation, ExecutionLockService, classification d'erreurs retry,
                calculs de statistiques -- tout ce qui est une fonction/service testable sans
                DB ni requête HTTP réelle (utilisation de mocks/fixtures en mémoire uniquement)

functional   -- CRUD complet par domaine (via le client de test HTTP AdonisJS + DB de test réelle),
                isolation projet/organisation, autorisation (matrice de permissions), parcours
                multi-étapes (ex. création organisation -> invitation -> acceptation)

job          -- exécution de jobs BullMQ avec une vraie connexion Redis de test (ou une
                implémentation en mémoire, voir Open questions) : campaign-engine.advance,
                segment.recompute, tracking.process_event, statistics.aggregate_daily --
                inclut la vérification explicite du comportement retry/idempotence

browser      -- campaign builder (drag & drop de nodes, connexion d'edges, sauvegarde) ;
                parcours de désabonnement complet (clic sur un lien réel dans une page de test) ;
                réservé aux cas où l'assertion ne peut raisonnablement pas être faite au niveau
                HTTP/DB seul
```

**Fixtures et factories** : chaque domaine doit disposer de factories de test (`tests/fixtures/` ou équivalent Japa — pattern à établir dès `03-organizations.md`/`04-projects.md`, puis réutilisé par tous les plans suivants) pour construire rapidement un graphe de données cohérent (organisation → projet → contacts/segments/campagnes) sans dupliquer la logique de setup dans chaque fichier de test.

**Temps et scheduling en test** : les tests de `12-campaign-engine.md` (wait de plusieurs jours) et `18-statistics-dashboard.md` (agrégation "hier") ne doivent **jamais** attendre un temps réel — le service d'horloge doit être injectable/mockable (ex. wrapper `Clock` autour de `DateTime.now()` de Luxon, ou manipulation directe de `scheduled_at` en base dans le test pour simuler "cette exécution est déjà due") plutôt qu'un vrai `sleep`.

## Data model / Backend architecture / Frontend architecture / Routes / Controllers / Services / Models / Jobs / Events / Permissions / Validation

Sans objet direct pour ce plan (transverse, pas un domaine fonctionnel).

## Edge cases

Sans objet direct — chaque plan de domaine couvre déjà ses edge cases de test.

## Failure scenarios

Les scénarios explicitement listés dans `init.md` (§ "cas réels à documenter", scénarios 1 à 8) doivent chacun avoir un test d'intégration nommé explicitement d'après le scénario (ex. `campaign_engine.spec.ts` contient un test `'scenario 3: contact waiting for 3 days survives a server restart'`), pour qu'un futur contributeur puisse retrouver directement la couverture de test correspondant à une exigence produit documentée — déjà listé individuellement dans `12-campaign-engine.md`/`15-retry-and-idempotency.md`, consolidé ici comme exigence transverse de traçabilité.

## Idempotency considerations

Toute fonctionnalité documentée comme idempotente dans son plan (recompute de segment, transitions de campagne, envoi d'email, événements de tracking) doit avoir un test explicite "exécuter deux fois produit le même résultat" — pas seulement un test du chemin nominal. C'est une exigence de test transverse, pas seulement une propriété de conception à faire confiance sur documentation.

## Performance considerations

Les tests de volumétrie (ex. recompute de segment par lots, `06-segments.md`) n'ont pas besoin de tester à l'échelle réelle (1M lignes) en CI — vérifier le **comportement par lots** (nombre de requêtes exécutées, absence de chargement complet en mémoire) sur un volume réduit mais représentatif (ex. 3 lots de 100 lignes plutôt que 1 lot de 300) suffit à couvrir la logique sans ralentir la suite de test.

## Security considerations

Couverture minimale obligatoire par domaine (déjà listée dans chaque plan) : isolation cross-projet/organisation, matrice d'autorisation complète, et pour les endpoints publics (`16-email-tracking.md`, `17-unsubscribe.md`) — tokens invalides, tentatives d'injection, absence de fuite de données sensibles dans les réponses d'erreur.

## Testing strategy (méta)

Ce plan est lui-même la stratégie de test — pas de sous-section supplémentaire au-delà de ce qui précède.

## Implementation steps

1. Créer `tests/unit/`, `tests/functional/`, `tests/browser/` (dossiers vides initialement, remplis au fil de l'implémentation de chaque plan de domaine).
2. Établir le pattern de factories/fixtures (`tests/fixtures/` ou bootstrap Japa dédié) dès l'implémentation de `03-organizations.md` — première feature testée, sert de référence de convention pour toutes les suivantes.
3. Créer le wrapper `Clock` (ou équivalent) utilisé par `12-campaign-engine.md`/`18-statistics-dashboard.md` pour rendre le temps mockable en test.
4. Décider et configurer l'environnement Redis/BullMQ de test (voir Open questions) avant l'implémentation de `14-jobs-and-queues.md`.
5. Pour chaque plan de domaine implémenté ensuite, appliquer directement sa section "Testing strategy" déjà rédigée — ce plan-ci ne redéfinit pas ces tests, il fixe le cadre dans lequel ils s'inscrivent.

## Dependencies

Sans dépendance de blocage : peut être mis en place dès la première feature implémentée (`03-organizations.md`) et s'applique en continu ensuite.

## Open questions

- Redis de test : instance réelle dédiée (ex. `docker-compose.dev.yml` étendu avec un service Redis de test sur un port séparé, ou une base Redis différente `DB 1` via `ioredis`) vs. mock complet de BullMQ en test — à trancher à l'implémentation de `14-jobs-and-queues.md` ; une instance réelle (même légère) est recommandée pour tester le comportement réel de retry/backoff/lock, qu'un mock ne reproduirait pas fidèlement.
- Tests de charge/performance réels (au-delà de la vérification de comportement par lots en CI) : hors scope de ces plans, à traiter comme un exercice distinct avant une mise en production à fort volume.
