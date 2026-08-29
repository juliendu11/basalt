# 18 — Statistics / Dashboard

## Objective

Fournir un tableau de bord par projet et des statistiques par campagne/email, avec une stratégie hybride temps réel ("aujourd'hui") + pré-agrégé (historique), scalable jusqu'à des volumes élevés d'événements.

## Functional requirements

- Dashboard projet : contacts total/actifs, segments, campagnes actives, emails envoyés/délivrés/ouverts/cliqués/bounced/failed, unsubscribes, open rate, click rate, bounce rate.
- Périodes : today, last 7 days, last 30 days, custom period.
- Statistiques par campagne (détail des mêmes métriques, scopées à une campagne).
- Statistiques par email (au sein d'une campagne — quel node `send_email` performe le mieux).
- Statistiques temporelles (évolution dans le temps, graphique).

## User flows

```text
GET dashboard projet (période sélectionnée)
  → StatisticsService.projectSummary(project, period)
      - si period inclut "aujourd'hui" : partie temps réel calculée à la volée (agrégation directe
        sur email_deliveries/email_events du jour, volume toujours faible pour une seule journée)
      - le reste de la période (jours passés complets) : lu depuis project_daily_stats
        (pré-agrégé, jamais recalculé à la demande)
      - les deux parties sont sommées pour produire le total affiché
```

## Domain concepts

**Pourquoi hybride (rappel de la question explicitement posée par `init.md`)** :
- **Temps réel pur** (tout calculé à la volée) : correct par nature mais coûteux à volume élevé — une période "30 derniers jours" sur un projet avec des millions d'`email_events` recalculerait un scan/agrégation important à **chaque** affichage du dashboard.
- **Pré-agrégé pur** (tout lu depuis des tables de stats) : rapide, mais "aujourd'hui" serait toujours en retard d'au moins un cycle d'agrégation (le job nightly n'a pas encore tourné) — inacceptable pour un dashboard qui doit refléter l'activité du jour.
- **Hybride (retenu)** : "aujourd'hui" est calculé à la volée (volume borné à une seule journée, toujours raisonnable même à forte volumétrie globale car les tables sources sont indexées par date), tout le passé est pré-agrégé. C'est la même logique que celle déjà retenue pour les segments (`decisions/ADR-003-segment-membership.md`) — cohérence de pattern à travers le projet.

**Agrégation quotidienne (`campaign_daily_stats`, `project_daily_stats`)** : peuplée par un job planifié nightly (`statistics.aggregate_daily`, cf. `14-jobs-and-queues.md` § Scheduling périodique) qui calcule les compteurs de la **veille** (jour complet, jamais partiel) à partir de `email_deliveries`/`email_events`/`contact_unsubscribe_events`, et les `INSERT ... ON DUPLICATE KEY UPDATE` dans les tables de stats (idempotent — un ré-lancement du job pour la même date écrase avec le même résultat, pas d'accumulation).

**Open rate / Click rate / Bounce rate** : calculés à l'affichage (jamais stockés en base), toujours comme `count(type) / count(sent)` sur la période affichée (ratio recalculé après sommation temps réel + pré-agrégé, pas une moyenne de ratios journaliers déjà calculés — évite un biais de moyenne de moyennes sur des jours à faible volume).

## Data model

Voir `02-database-design.md` § Audit / Statistiques (`campaign_daily_stats`, `project_daily_stats`). Aucun ajout nécessaire pour ce plan.

## Backend architecture

```text
app/services/statistics/
  statistics_service.ts        (projectSummary, campaignSummary, emailSummary, timeSeries)
  statistics_aggregation_service.ts   (aggregateDailyStats — appelé par le job nightly)
app/transformers/statistics_transformer.ts
```

`StatisticsService.projectSummary(project, period)` — algorithme :
```text
1. Découpe `period` en [joursComplets] + [aujourd'hui éventuel]
2. joursComplets -> SUM(campaign_daily_stats / project_daily_stats WHERE date IN joursComplets)
   (une seule requête agrégée, indexée sur (project_id, date) / (campaign_id, date))
3. aujourd'hui (si inclus dans la période) ->
     agrégation directe : COUNT(email_deliveries WHERE project_id=? AND DATE(created_at)=today
       GROUP BY status), COUNT(email_events WHERE project_id=? AND DATE(occurred_at)=today
       GROUP BY type)
4. Sommation des deux parties, calcul des ratios (open rate, click rate, bounce rate)
```

`StatisticsAggregationService.aggregateDailyStats(date)` : traite tous les projets pour une date donnée (typiquement hier), par lots si beaucoup de projets — chaque projet dans sa propre transaction courte (pas une transaction géante multi-projets).

## Frontend architecture

```text
inertia/pages/.../dashboard/
  index.vue    (dashboard projet — sélecteur de période, cartes de métriques, graphique temporel)
inertia/pages/.../campaigns/
  [campaignId]/statistics.vue   (détail campagne — mêmes métriques scopées + performance par email/node)
inertia/components/statistics/
  metric-card.vue, time-series-chart.vue, period-selector.vue
```

Le dashboard projet (`projects.show`, cf. `04-projects.md`) et cette page peuvent être la même route ou des routes liées selon l'implémentation finale — documenté ici comme la page de statistiques dédiée, `04-projects.md` renvoie vers elle pour le détail complet.

## Routes

```text
GET .../dashboard                              statistics.dashboard   (period en query string)
GET .../campaigns/:campaignId/statistics         statistics.campaign
GET .../campaigns/:campaignId/nodes/:nodeId/statistics  statistics.campaignNode  (détail par email/node)
```

## Controllers

`StatisticsController` (dashboard, campaign, campaignNode) — fin, délègue à `StatisticsService`, valide/parse le paramètre `period` (enum `today|last_7_days|last_30_days|custom`, avec `from`/`to` si `custom`).

## Services

Voir Backend architecture.

## Models

Pas de nouveau modèle métier (utilise `EmailDelivery`, `EmailEvent`, `CampaignDailyStat`, `ProjectDailyStat` déjà définis). `CampaignDailyStat`/`ProjectDailyStat` : modèles simples, essentiellement des accumulateurs, scope `forDateRange(from, to)`.

## Jobs / Commands

```text
job (périodique, 1x/jour, cf. 14-jobs-and-queues.md): statistics.aggregate_daily { date? }
  -- si `date` omise, agrège la veille par défaut (usage nightly normal)
  -- si fournie, permet un rattrapage manuel (command `node ace statistics:aggregate --date=2025-01-01`)
     en cas d'échec du job planifié un jour donné
```

## Events

Aucun event émis par ce plan (il ne fait que **lire** les données produites par les autres domaines). Il pourrait écouter des events (`EmailSent`, `EmailOpened`, ...) pour maintenir un compteur incrémental temps réel plutôt que de recalculer "aujourd'hui" à chaque affichage — **non retenu en v1** (voir Performance considerations pour la justification : le recalcul à la volée d'une seule journée est déjà suffisamment rapide, un compteur incrémental ajouterait une source de vérité supplémentaire à maintenir en cohérence, contredisant la priorité "simplicité" sans bénéfice mesurable au volume attendu).

## Permissions

Standard projet, lecture seule pour tous les rôles y compris `viewer` (les statistiques sont un cas d'usage de consultation par excellence, aucune restriction supplémentaire).

## Validation

`period` : enum validé, `from`/`to` (dates ISO, `from <= to`, plage max raisonnable pour `custom` — ex. 1 an, au-delà l'agrégation quotidienne reste performante mais évite un abus de requête sur une plage absurde).

## Edge cases

- Dashboard consulté avant que le job nightly n'ait jamais tourné (projet tout juste créé) → `project_daily_stats` vide pour les jours passés, uniquement la partie "aujourd'hui" s'affiche — comportement correct, pas une erreur (un nouveau projet n'a simplement pas d'historique).
- Période "custom" chevauchant aujourd'hui + plusieurs jours passés → traité normalement par l'algorithme hybride (§ Backend architecture), pas un cas spécial.
- Campagne supprimée/archivée avec des `campaign_daily_stats` existants → les stats restent consultables (jamais supprimées avec la campagne, cohérent avec `campaign_daily_stats` en `CASCADE` sur `campaign_id` — note : `02-database-design.md` spécifie `CASCADE`, ce qui signifie qu'archiver n'efface rien, seule une suppression complète de la campagne — non permise en v1, cf. `10-campaigns.md`, effacerait ces stats).

## Failure scenarios

- Job `statistics.aggregate_daily` échoue pour une date donnée → retry standard (`15-retry-and-idempotency.md`, file `statistics`) ; si échec définitif, la command manuelle de rattrapage (§ Jobs/Commands) permet une reprise a posteriori — le dashboard affiche un historique incomplet pour ce jour en attendant (pas une erreur bloquante pour le reste du dashboard, chaque jour est une ligne indépendante).

## Idempotency considerations

`aggregateDailyStats(date)` est idempotent par construction (`INSERT ... ON DUPLICATE KEY UPDATE` sur la contrainte `UNIQUE (campaign_id, date)`/`UNIQUE (project_id, date)`) — rejouable sans risque pour rattraper un échec ou corriger une divergence détectée a posteriori.

## Performance considerations

- La partie "aujourd'hui" scope toujours une seule journée sur des colonnes indexées (`email_deliveries (project_id, status, created_at)`, `email_events (project_id, type, occurred_at)`) — reste rapide même sur un projet à très fort volume total, car le volume **d'une seule journée** est structurellement borné par le débit d'envoi réel (jamais "tout l'historique").
- La partie historique lit des tables déjà pré-agrégées à la granularité jour — une période de 30 jours ne lit jamais que 30 lignes par métrique, indépendamment du volume brut d'événements sous-jacent.
- Le graphique temporel (`time-series-chart.vue`) lit directement `campaign_daily_stats`/`project_daily_stats` ligne par ligne pour la période (pas de ré-agrégation supplémentaire nécessaire, la granularité jour est déjà le niveau d'affichage voulu).

## Security considerations

Standard (isolation projet — toutes les requêtes d'agrégation scopées `project_id`, jamais un calcul cross-projet même par erreur d'implémentation, à couvrir explicitement en test).

## Testing strategy

- Unit : `StatisticsService.projectSummary` — découpage période/aujourd'hui correct, sommation correcte, calcul de ratios sans biais de moyenne de moyennes.
- Unit : `StatisticsAggregationService.aggregateDailyStats` — idempotence (deux exécutions consécutives produisent le même résultat), exactitude sur un jeu de données de test connu.
- Functional : dashboard affiché correctement après quelques jours d'activité simulée (fixtures avec `email_deliveries`/`email_events` répartis sur plusieurs jours + agrégation exécutée).
- Isolation : stats d'un projet A jamais mélangées à celles d'un projet B.

## Implementation steps

1. `node ace make:migration create_campaign_daily_stats_table`.
2. `node ace make:migration create_project_daily_stats_table`.
3. `node ace migration:run`.
4. Créer les modèles `CampaignDailyStat`, `ProjectDailyStat`.
5. Créer `app/services/statistics/statistics_service.ts` (partie temps réel + lecture pré-agrégée + sommation/ratios).
6. Créer `app/services/statistics/statistics_aggregation_service.ts`.
7. Créer le job `statistics.aggregate_daily` et la command `node ace make:command statistics/aggregate` (dépend de `14-jobs-and-queues.md`).
8. Créer `app/transformers/statistics_transformer.ts`.
9. Créer `StatisticsController` et les routes.
10. Créer les pages/composants Inertia listés ci-dessus.
11. Écrire les tests listés ci-dessus.

## Dependencies

`16-email-tracking.md` (source des `email_events`), `decisions/ADR-005-email-idempotency.md` (source des `email_deliveries`), `17-unsubscribe.md` (source des unsubscribes), `14-jobs-and-queues.md`.

## Open questions

- Compteurs incrémentaux temps réel (event-driven) plutôt que recalcul à la volée pour "aujourd'hui" : non retenu en v1 (cf. Events), à reconsidérer seulement si un volume quotidien par projet devient tel que même l'agrégation d'une seule journée devient mesurablement lente (aucune preuve de ce besoin actuellement).
- Statistiques par tag/segment (au-delà de projet/campagne/email) : non demandées explicitement dans `init.md` au-delà de la liste de métriques fournie, non détaillées ici — extension naturelle du même pattern hybride si priorisée.
