import { BaseEvent } from '@adonisjs/core/events'
import type Project from '#models/project'
import type User from '#models/user'

export default class ProjectCreated extends BaseEvent {
  constructor(
    public project: Project,
    public actor: User
  ) {
    super()
  }
}
