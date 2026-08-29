import type { HttpContext } from '@adonisjs/core/http'
import ObservabilityPolicy from '#policies/observability_policy'
import ProjectTransformer from '#transformers/project_transformer'
import FailedJobsService, { FailedJobsUnavailableError } from '#services/jobs/failed_jobs_service'
import { queueNames, type QueueName } from '#config/queue'

const failedJobsService = new FailedJobsService()

export default class FailedJobsController {
  async index({ project, request, bouncer, inertia }: HttpContext) {
    await bouncer.with(ObservabilityPolicy).authorize('viewFailedJobs', project)

    const queue = request.input('queue') as QueueName | undefined

    try {
      const jobs = await failedJobsService.list(
        queue && queueNames.includes(queue) ? queue : undefined
      )

      return inertia.render('settings/jobs/index', {
        project: ProjectTransformer.transform(project),
        queues: [...queueNames],
        selectedQueue: queue ?? null,
        jobs,
        error: null,
      })
    } catch (error) {
      if (!(error instanceof FailedJobsUnavailableError)) throw error

      return inertia.render('settings/jobs/index', {
        project: ProjectTransformer.transform(project),
        queues: [...queueNames],
        selectedQueue: queue ?? null,
        jobs: [],
        error: error.message,
      })
    }
  }

  async retry({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(ObservabilityPolicy).authorize('retryFailedJob', project)

    const queue = params.queue as QueueName
    if (!queueNames.includes(queue)) {
      return response.notFound()
    }

    try {
      const retried = await failedJobsService.retry(queue, params.jobId)
      session.flash(retried ? 'success' : 'error', retried ? 'Job re-queued.' : 'Job not found.')
    } catch (error) {
      if (!(error instanceof FailedJobsUnavailableError)) throw error
      session.flash('error', error.message)
    }

    return response.redirect().back()
  }
}
