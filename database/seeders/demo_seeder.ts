import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { fakerFR as faker } from '@faker-js/faker'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvitation from '#models/organization_invitation'
import Project from '#models/project'
import CustomFieldDefinition from '#models/custom_field_definition'
import Tag from '#models/tag'
import Contact from '#models/contact'
import Segment from '#models/segment'
import SmtpConnector from '#models/smtp_connector'
import EmailLayout from '#models/email_layout'
import EmailTemplate from '#models/email_template'
import Email from '#models/email'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'
import EmailDelivery from '#models/email_delivery'
import ApiKey from '#models/api_key'
import { slugify } from '#utils/slugify'
import type { SegmentDefinition } from '#types/segment_definition'
import type { ContactStatus } from '#models/contact'

interface CampaignBundle {
  campaign: Campaign
  version: CampaignVersion
  nodes: Record<string, CampaignNode>
  id: number
}

interface SeededCampaigns {
  welcome: CampaignBundle
  cart: CampaignBundle
  reengage: { campaign: Campaign; version: CampaignVersion; id: number }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
]

/**
 * Seeds a self-contained "demo" account — one organization, one richly
 * populated project — so the platform can be shown with realistic data
 * instead of empty screens (contacts, tags, segments, email layouts /
 * templates / emails, SMTP connector, campaigns with a published graph +
 * enrollments + executions, email deliveries & events, 90 days of
 * pre-aggregated statistics, an audit trail and an API key).
 *
 * Login after seeding:  demo@basalt.dev  /  demo1234
 *
 * Idempotent: every run first deletes the previous demo organization
 * (cascades to every project-scoped table) and the `@basalt.dev` users,
 * then rebuilds everything. Never runs outside development / testing.
 */
export default class DemoSeeder extends BaseSeeder {
  static environment = ['development', 'testing']

  private now = DateTime.now()

  async run() {
    // Deterministic fake data across runs.
    faker.seed(20260829)

    await db.transaction(async (trx) => {
      await this.cleanup(trx)

      const { demoUser, sofia, marc } = await this.seedUsers(trx)
      const organization = await this.seedOrganization(trx, demoUser, [sofia, marc])
      const project = await this.seedProject(trx, organization)

      const tags = await this.seedTags(trx, project)
      await this.seedCustomFields(trx, project)
      const contacts = await this.seedContacts(trx, project)
      await this.seedContactTags(trx, contacts, tags)
      const segments = await this.seedSegments(trx, project, contacts, tags)
      const connector = await this.seedSmtpConnector(trx, project)
      const { emails } = await this.seedEmailContent(trx, project)

      const campaigns = await this.seedCampaigns(trx, project, {
        segments,
        tags,
        emails,
        author: demoUser,
      })

      await this.seedDeliveriesAndEvents(trx, project, { contacts, emails, connector, campaigns })
      await this.seedUnsubscribeData(trx, project, contacts, campaigns.welcome.id)
      await this.seedDailyStats(trx, project, campaigns)
      await this.seedAuditLog(trx, organization, project, {
        actors: [demoUser, sofia, marc],
        campaigns,
        contacts,
      })
      await this.seedApiKeys(trx, project, demoUser)
    })

    console.log('Demo account ready — login: demo@basalt.dev / demo1234')
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  private async cleanup(trx: TransactionClientContract) {
    const demoUsers = await User.query({ client: trx }).where('email', 'like', '%@basalt.dev')
    if (demoUsers.length === 0) return

    for (const user of demoUsers) {
      // Deleting the organization cascades (FK ON DELETE CASCADE) to
      // projects and every project-scoped table below them.
      await Organization.query({ client: trx }).where('ownerUserId', user.id).delete()
    }

    await User.query({ client: trx })
      .whereIn(
        'id',
        demoUsers.map((u) => u.id)
      )
      .delete()
  }

  // ---------------------------------------------------------------------------
  // Users / organization / project
  // ---------------------------------------------------------------------------

  private async seedUsers(trx: TransactionClientContract) {
    const demoUser = await User.create(
      { fullName: 'Camille Moreau', email: 'demo@basalt.dev', password: 'demo1234' },
      { client: trx }
    )
    const sofia = await User.create(
      { fullName: 'Sofia Nguyen', email: 'sofia@basalt.dev', password: 'demo1234' },
      { client: trx }
    )
    const marc = await User.create(
      { fullName: 'Marc Lefebvre', email: 'marc@basalt.dev', password: 'demo1234' },
      { client: trx }
    )

    return { demoUser, sofia, marc }
  }

  private async seedOrganization(
    trx: TransactionClientContract,
    owner: User,
    members: User[]
  ): Promise<Organization> {
    const organization = await Organization.create(
      {
        name: 'Lumen Studio',
        slug: 'lumen-studio',
        ownerUserId: owner.id,
        createdAt: this.now.minus({ months: 8 }),
      },
      { client: trx }
    )

    await OrganizationMembership.create(
      {
        organizationId: organization.id,
        userId: owner.id,
        role: 'owner',
        joinedAt: this.now.minus({ months: 8 }),
      },
      { client: trx }
    )

    const roles = ['admin', 'member'] as const
    for (const [index, member] of members.entries()) {
      await OrganizationMembership.create(
        {
          organizationId: organization.id,
          userId: member.id,
          role: roles[index] ?? 'member',
          invitedByUserId: owner.id,
          joinedAt: this.now.minus({ months: 6, days: index * 9 }),
        },
        { client: trx }
      )
    }

    // One still-pending invitation so the members screen isn't all-accepted.
    await OrganizationInvitation.create(
      {
        organizationId: organization.id,
        email: 'julie.rousseau@example.com',
        role: 'member',
        token: randomBytes(24).toString('hex'),
        invitedByUserId: owner.id,
        expiresAt: this.now.plus({ days: 5 }),
        createdAt: this.now.minus({ days: 2 }),
      },
      { client: trx }
    )

    return organization
  }

  private async seedProject(
    trx: TransactionClientContract,
    organization: Organization
  ): Promise<Project> {
    return Project.create(
      {
        organizationId: organization.id,
        name: 'Boutique Lumen',
        slug: 'boutique-lumen',
        timezone: 'Europe/Paris',
        settings: {},
        defaultSenderName: 'Boutique Lumen',
        defaultSenderEmail: 'hello@boutique-lumen.fr',
        createdAt: this.now.minus({ months: 7 }),
      },
      { client: trx }
    )
  }

  // ---------------------------------------------------------------------------
  // Custom fields / tags / contacts
  // ---------------------------------------------------------------------------

  private async seedCustomFields(trx: TransactionClientContract, project: Project) {
    const defs = [
      { key: 'plan', label: 'Formule', type: 'text' as const },
      { key: 'mrr', label: 'MRR (€)', type: 'number' as const },
      { key: 'signup_source', label: "Source d'inscription", type: 'text' as const },
      { key: 'onboarded', label: 'Onboarding terminé', type: 'boolean' as const },
      { key: 'trial_ends_at', label: "Fin d'essai", type: 'date' as const },
    ]

    for (const def of defs) {
      await CustomFieldDefinition.create(
        {
          projectId: project.id,
          key: def.key,
          label: def.label,
          type: def.type,
          createdAt: this.now.minus({ months: 6 }),
        },
        { client: trx }
      )
    }
  }

  private async seedTags(trx: TransactionClientContract, project: Project) {
    const specs = [
      { name: 'Client', color: '#570df8' },
      { name: 'Prospect', color: '#f000b8' },
      { name: 'Newsletter', color: '#37cdbe' },
      { name: 'VIP', color: '#fbbd23' },
      { name: 'Risque de churn', color: '#f87272' },
      { name: 'Panier abandonné', color: '#3abff8' },
    ]

    const created: Record<string, Tag> = {}
    for (const spec of specs) {
      created[spec.name] = await Tag.create(
        {
          projectId: project.id,
          name: spec.name,
          color: spec.color,
          createdAt: this.now.minus({ months: 6 }),
        },
        { client: trx }
      )
    }
    return created
  }

  private async seedContacts(trx: TransactionClientContract, project: Project): Promise<Contact[]> {
    const COUNT = 160
    const statusWeights: [ContactStatus, number][] = [
      ['subscribed', 0.8],
      ['unsubscribed', 0.1],
      ['bounced', 0.05],
      ['complained', 0.03],
      ['blocked', 0.02],
    ]
    const countries = [
      'France',
      'France',
      'France',
      'Belgique',
      'Suisse',
      'Canada',
      'Allemagne',
      'Espagne',
      'Royaume-Uni',
    ]
    const languages = ['fr', 'fr', 'fr', 'fr', 'en', 'de', 'es']
    const domains = ['gmail.com', 'outlook.fr', 'yahoo.fr', 'proton.me', 'orange.fr', 'free.fr']
    const plans = ['free', 'free', 'starter', 'starter', 'pro', 'pro', 'enterprise']
    const sources = ['organic', 'ads', 'referral', 'partner', 'newsletter']

    const contacts: Contact[] = []
    for (let i = 0; i < COUNT; i++) {
      const firstName = faker.person.firstName()
      const lastName = faker.person.lastName()
      const local = `${slugify(firstName)}.${slugify(lastName)}` || 'contact'
      const email = `${local}${i}@${faker.helpers.arrayElement(domains)}`

      // Recent-biased age: most contacts joined in the last couple of months.
      const ageDays = Math.round(Math.pow(this.rand(), 1.7) * 200)
      const createdAt = this.now.minus({ days: ageDays, hours: this.int(0, 23) })
      const status = this.weighted(statusWeights)
      const plan = faker.helpers.arrayElement(plans)

      const customFields: Record<string, string | number | boolean | null> = {
        plan,
        signup_source: faker.helpers.arrayElement(sources),
        onboarded: this.rand() < 0.7,
      }
      if (plan !== 'free') {
        customFields.mrr = faker.helpers.arrayElement([12, 19, 29, 49, 79, 129, 199, 299])
      }
      if (this.rand() < 0.25) {
        customFields.trial_ends_at = this.now.plus({ days: this.int(-20, 20) }).toISODate()
      }

      // A handful of soft-deleted (archived) contacts.
      const deletedAt = i > 0 && i % 41 === 0 ? createdAt.plus({ days: this.int(10, 60) }) : null

      const contact = await Contact.create(
        {
          projectId: project.id,
          email,
          firstName,
          lastName,
          phone: this.rand() < 0.5 ? faker.phone.number() : null,
          company: this.rand() < 0.55 ? faker.company.name() : null,
          country: faker.helpers.arrayElement(countries),
          city: faker.location.city(),
          language: faker.helpers.arrayElement(languages),
          timezone: 'Europe/Paris',
          status,
          customFields,
          deletedAt,
          createdAt,
          updatedAt: createdAt,
        },
        { client: trx }
      )
      contacts.push(contact)
    }

    return contacts
  }

  private async seedContactTags(
    trx: TransactionClientContract,
    contacts: Contact[],
    tags: Record<string, Tag>
  ) {
    const tagList = Object.values(tags)
    const rows: Record<string, unknown>[] = []

    for (const contact of contacts) {
      if (contact.deletedAt) continue
      const count = this.weighted([
        [0, 0.15],
        [1, 0.4],
        [2, 0.3],
        [3, 0.15],
      ])
      for (const tag of faker.helpers.arrayElements(tagList, count)) {
        rows.push({
          contact_id: contact.id,
          tag_id: tag.id,
          created_at: this.sql(contact.createdAt.plus({ days: this.int(0, 20) })),
        })
      }
    }

    await this.bulkInsert(trx, 'contact_tags', rows)
  }

  // ---------------------------------------------------------------------------
  // Segments
  // ---------------------------------------------------------------------------

  private async seedSegments(
    trx: TransactionClientContract,
    project: Project,
    contacts: Contact[],
    tags: Record<string, Tag>
  ) {
    const alive = contacts.filter((c) => !c.deletedAt)
    const thirtyDaysAgo = this.now.minus({ days: 30 }).toISODate()!

    const specs: {
      name: string
      description: string
      definition: SegmentDefinition
      referencedFields: string[]
      match: (c: Contact) => boolean
    }[] = [
      {
        name: 'Clients payants',
        description: 'Contacts abonnés sur une formule payante.',
        definition: {
          combinator: 'AND',
          conditions: [
            { field: 'status', operator: 'equals', value: 'subscribed' },
            { field: 'customFields.plan', operator: 'in', value: ['starter', 'pro', 'enterprise'] },
          ],
        },
        referencedFields: ['status', 'customFields.plan'],
        match: (c) =>
          c.status === 'subscribed' &&
          ['starter', 'pro', 'enterprise'].includes(String(c.customFields?.plan)),
      },
      {
        name: 'Prospects France',
        description: 'Prospects abonnés localisés en France.',
        definition: {
          combinator: 'AND',
          conditions: [
            { field: 'status', operator: 'equals', value: 'subscribed' },
            { field: 'country', operator: 'equals', value: 'France' },
            { field: 'tags', operator: 'in', value: [tags['Prospect'].id] },
          ],
        },
        referencedFields: ['status', 'country', 'tags'],
        match: (c) => c.status === 'subscribed' && c.country === 'France',
      },
      {
        name: 'Contacts désabonnés',
        description: 'Tous les contacts qui se sont désabonnés.',
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'status', operator: 'equals', value: 'unsubscribed' }],
        },
        referencedFields: ['status'],
        match: (c) => c.status === 'unsubscribed',
      },
      {
        name: 'Nouveaux inscrits (30 j)',
        description: 'Contacts créés au cours des 30 derniers jours.',
        definition: {
          combinator: 'AND',
          conditions: [
            { field: 'status', operator: 'equals', value: 'subscribed' },
            { field: 'createdAt', operator: 'after', value: thirtyDaysAgo },
          ],
        },
        referencedFields: ['status', 'createdAt'],
        match: (c) => c.status === 'subscribed' && c.createdAt.toISODate()! > thirtyDaysAgo,
      },
    ]

    const created: Record<string, { segment: Segment; members: Contact[] }> = {}

    for (const spec of specs) {
      const members = alive.filter(spec.match)
      const segment = await Segment.create(
        {
          projectId: project.id,
          name: spec.name,
          description: spec.description,
          definition: spec.definition,
          referencedFields: spec.referencedFields,
          contactCountCache: members.length,
          lastComputationStatus: 'success',
          lastComputedAt: this.now.minus({ hours: this.int(1, 40) }),
          createdAt: this.now.minus({ months: 5, days: this.int(0, 30) }),
        },
        { client: trx }
      )

      await this.bulkInsert(
        trx,
        'segment_contacts',
        members.map((c) => ({
          segment_id: segment.id,
          contact_id: c.id,
          added_at: this.sql(this.now.minus({ days: this.int(0, 25) })),
        }))
      )

      created[spec.name] = { segment, members }
    }

    return created
  }

  // ---------------------------------------------------------------------------
  // SMTP connector
  // ---------------------------------------------------------------------------

  private async seedSmtpConnector(
    trx: TransactionClientContract,
    project: Project
  ): Promise<SmtpConnector> {
    return SmtpConnector.create(
      {
        projectId: project.id,
        name: 'Serveur transactionnel',
        host: 'smtp.mailtrap.io',
        port: 587,
        username: 'demo-lumen',
        passwordEncrypted: encryption.encrypt('demo-smtp-password'),
        encryption: 'tls',
        fromEmail: 'hello@boutique-lumen.fr',
        fromName: 'Boutique Lumen',
        replyTo: 'support@boutique-lumen.fr',
        isDefault: true,
        enabled: true,
        dailyLimit: 5000,
        lastTestStatus: 'success',
        lastTestedAt: this.now.minus({ days: 3 }),
        createdAt: this.now.minus({ months: 6 }),
      },
      { client: trx }
    )
  }

  // ---------------------------------------------------------------------------
  // Email layout / templates / emails
  // ---------------------------------------------------------------------------

  private async seedEmailContent(trx: TransactionClientContract, project: Project) {
    const layoutHtml = `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
          <tr><td style="padding:24px 32px;background:#570df8;color:#ffffff;font-size:20px;font-weight:bold">Boutique Lumen</td></tr>
          <tr><td style="padding:32px">{{ email_body }}</td></tr>
          <tr><td style="padding:24px 32px;background:#fafafa;font-size:12px;color:#71717a">
            Vous recevez cet email car vous êtes inscrit·e chez Boutique Lumen.<br />
            <a href="{{ unsubscribe_url }}" style="color:#71717a">Se désabonner</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
    const layoutText = `Boutique Lumen\n\n{{ email_body }}\n\n--\nSe désabonner : {{ unsubscribe_url }}`
    const strip = (html: string) =>
      html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const layout = await EmailLayout.create(
      {
        projectId: project.id,
        name: 'Layout principal',
        htmlContent: layoutHtml,
        textContent: layoutText,
        createdAt: this.now.minus({ months: 6 }),
      },
      { client: trx }
    )

    const templateSpecs = [
      {
        name: 'Bienvenue',
        subject: 'Bienvenue chez Boutique Lumen 👋',
        body: "<h1>Bienvenue {{ contact.firstName }} !</h1><p>Merci de nous avoir rejoints. Voici tout ce qu'il faut savoir pour bien démarrer.</p>",
      },
      {
        name: 'Promotion',
        subject: '-20 % sur toute la collection cette semaine',
        body: "<h1>Offre limitée</h1><p>Profitez de -20 % sur l'ensemble du catalogue jusqu'à dimanche avec le code <strong>LUMEN20</strong>.</p>",
      },
      {
        name: 'Panier abandonné',
        subject: 'Vous avez oublié quelque chose…',
        body: '<h1>Votre panier vous attend</h1><p>Les articles de votre panier sont toujours disponibles. Finalisez votre commande en un clic.</p>',
      },
    ]

    const templates: Record<string, EmailTemplate> = {}
    for (const spec of templateSpecs) {
      templates[spec.name] = await EmailTemplate.create(
        {
          projectId: project.id,
          name: spec.name,
          subject: spec.subject,
          htmlContent: layoutHtml.replace('{{ email_body }}', spec.body),
          textContent: strip(spec.body),
          createdAt: this.now.minus({ months: 5, days: this.int(0, 20) }),
        },
        { client: trx }
      )
    }

    const emailSpecs = [
      {
        key: 'welcome',
        name: 'Onboarding — email 1 (bienvenue)',
        subject: 'Bienvenue chez Boutique Lumen 👋',
        preheader: 'On est ravis de vous compter parmi nous',
        body: '<h1>Bienvenue {{ contact.firstName }} !</h1><p>Votre compte est prêt. Découvrez nos nouveautés et configurez vos préférences dès maintenant.</p><p><a href="https://boutique-lumen.fr/nouveautes">Voir les nouveautés</a></p>',
        status: 'published' as const,
      },
      {
        key: 'tips',
        name: 'Onboarding — email 2 (conseils)',
        subject: '3 astuces pour tirer le meilleur de Lumen',
        preheader: 'Nos meilleures recommandations',
        body: '<h1>Bien démarrer</h1><p>Voici trois conseils de nos clients les plus fidèles pour profiter pleinement de la boutique.</p>',
        status: 'published' as const,
      },
      {
        key: 'cart',
        name: 'Relance panier — email 1',
        subject: 'Vous avez oublié quelque chose…',
        preheader: 'Votre panier est toujours là',
        body: '<h1>Votre panier vous attend</h1><p>Finalisez votre commande avant que les articles ne partent.</p><p><a href="https://boutique-lumen.fr/panier">Reprendre ma commande</a></p>',
        status: 'published' as const,
      },
      {
        key: 'reminder',
        name: 'Relance panier — email 2 (dernier rappel)',
        subject: 'Dernier rappel : -10 % sur votre panier',
        preheader: 'Une petite remise pour vous décider',
        body: '<h1>Un coup de pouce</h1><p>Utilisez le code <strong>PANIER10</strong> pour -10 % sur votre commande, valable 48 h.</p>',
        status: 'draft' as const,
      },
      {
        key: 'newsletter',
        name: 'Newsletter — Sélection du mois',
        subject: 'La sélection Lumen du mois ✨',
        preheader: 'Nos coups de cœur, rien que pour vous',
        body: '<h1>La sélection du mois</h1><p>Chaque mois, notre équipe déniche pour vous les plus belles pièces.</p>',
        status: 'draft' as const,
      },
    ]

    const emails: Record<string, Email> = {}
    for (const spec of emailSpecs) {
      emails[spec.key] = await Email.create(
        {
          projectId: project.id,
          emailLayoutId: layout.id,
          name: spec.name,
          subject: spec.subject,
          preheader: spec.preheader,
          senderName: 'Boutique Lumen',
          senderEmail: 'hello@boutique-lumen.fr',
          replyTo: 'support@boutique-lumen.fr',
          bodyContent: spec.body,
          htmlContent: layoutHtml.replace('{{ email_body }}', spec.body),
          textContent: strip(spec.body),
          status: spec.status,
          createdAt: this.now.minus({ months: 4, days: this.int(0, 30) }),
        },
        { client: trx }
      )
    }

    return { layout, templates, emails }
  }

  // ---------------------------------------------------------------------------
  // Campaigns (published graph + versions + nodes + edges)
  // ---------------------------------------------------------------------------

  private async seedCampaigns(
    trx: TransactionClientContract,
    project: Project,
    deps: {
      segments: Record<string, { segment: Segment; members: Contact[] }>
      tags: Record<string, Tag>
      emails: Record<string, Email>
      author: User
    }
  ): Promise<SeededCampaigns> {
    const { segments, tags, emails, author } = deps

    // --- Campaign 1: "Séquence de bienvenue" (active) ---------------------
    const welcome = await Campaign.create(
      {
        projectId: project.id,
        name: 'Séquence de bienvenue',
        description: 'Accueille les nouveaux inscrits en deux emails.',
        status: 'active',
        reentryPolicy: 'never',
        enrollExistingMembers: false,
        createdAt: this.now.minus({ months: 3 }),
      },
      { client: trx }
    )
    const welcomeVersion = await CampaignVersion.create(
      {
        campaignId: welcome.id,
        versionNumber: 1,
        status: 'published',
        graphFormatVersion: 1,
        createdByUserId: author.id,
        publishedAt: this.now.minus({ months: 3 }),
        createdAt: this.now.minus({ months: 3 }),
      },
      { client: trx }
    )
    const welcomeNodes = await this.createGraph(trx, welcomeVersion.id, [
      {
        key: 'source',
        type: 'source',
        subtype: 'segment',
        x: 0,
        y: 0,
        config: { segmentId: segments['Nouveaux inscrits (30 j)'].segment.id },
      },
      {
        key: 'send-welcome',
        type: 'action',
        subtype: 'send_email',
        x: 0,
        y: 160,
        config: this.frozenSendConfig(emails['welcome']),
      },
      {
        key: 'wait-2d',
        type: 'action',
        subtype: 'wait',
        x: 0,
        y: 320,
        config: { durationValue: 2, durationUnit: 'days' },
      },
      {
        key: 'send-tips',
        type: 'action',
        subtype: 'send_email',
        x: 0,
        y: 480,
        config: this.frozenSendConfig(emails['tips']),
      },
      {
        key: 'tag-client',
        type: 'action',
        subtype: 'add_tag',
        x: 0,
        y: 640,
        config: { tagId: tags['Client'].id },
      },
    ])
    await this.createEdges(trx, welcomeVersion.id, welcomeNodes, [
      ['source', 'send-welcome', null],
      ['send-welcome', 'wait-2d', null],
      ['wait-2d', 'send-tips', null],
      ['send-tips', 'tag-client', null],
    ])
    welcome.publishedVersionId = welcomeVersion.id
    welcome.draftVersionId = null
    welcome.useTransaction(trx)
    await welcome.save()

    // --- Campaign 2: "Relance panier abandonné" (paused) ----------------
    const cart = await Campaign.create(
      {
        projectId: project.id,
        name: 'Relance panier abandonné',
        description: 'Relance les paniers non finalisés, avec branche selon le clic.',
        status: 'paused',
        reentryPolicy: 'after_exit',
        enrollExistingMembers: false,
        createdAt: this.now.minus({ months: 2 }),
      },
      { client: trx }
    )
    const cartVersion = await CampaignVersion.create(
      {
        campaignId: cart.id,
        versionNumber: 1,
        status: 'published',
        graphFormatVersion: 1,
        createdByUserId: author.id,
        publishedAt: this.now.minus({ months: 2 }),
        createdAt: this.now.minus({ months: 2 }),
      },
      { client: trx }
    )
    const cartNodes = await this.createGraph(trx, cartVersion.id, [
      {
        key: 'source',
        type: 'source',
        subtype: 'segment',
        x: 0,
        y: 0,
        config: { segmentId: segments['Clients payants'].segment.id },
      },
      {
        key: 'wait-1h',
        type: 'action',
        subtype: 'wait',
        x: 0,
        y: 160,
        config: { durationValue: 1, durationUnit: 'hours' },
      },
      {
        key: 'send-cart',
        type: 'action',
        subtype: 'send_email',
        x: 0,
        y: 320,
        config: this.frozenSendConfig(emails['cart']),
      },
      {
        key: 'clicked',
        type: 'condition',
        subtype: 'email_clicked',
        x: 0,
        y: 480,
        config: { referenceNodeId: 'send-cart' },
      },
      {
        key: 'tag-vip',
        type: 'action',
        subtype: 'add_tag',
        x: -180,
        y: 640,
        config: { tagId: tags['VIP'].id },
      },
      {
        key: 'send-reminder',
        type: 'action',
        subtype: 'send_email',
        x: 180,
        y: 640,
        config: this.frozenSendConfig(emails['reminder']),
      },
    ])
    await this.createEdges(trx, cartVersion.id, cartNodes, [
      ['source', 'wait-1h', null],
      ['wait-1h', 'send-cart', null],
      ['send-cart', 'clicked', null],
      ['clicked', 'tag-vip', 'true'],
      ['clicked', 'send-reminder', 'false'],
    ])
    cart.publishedVersionId = cartVersion.id
    cart.draftVersionId = null
    cart.useTransaction(trx)
    await cart.save()

    // --- Campaign 3: "Réengagement des inactifs" (draft, empty graph) ---
    const reengage = await Campaign.create(
      {
        projectId: project.id,
        name: 'Réengagement des inactifs',
        description: 'Brouillon — cible les contacts sans ouverture depuis 60 jours.',
        status: 'draft',
        reentryPolicy: 'never',
        enrollExistingMembers: true,
        createdAt: this.now.minus({ days: 6 }),
      },
      { client: trx }
    )
    const reengageVersion = await CampaignVersion.create(
      {
        campaignId: reengage.id,
        versionNumber: 1,
        status: 'draft',
        graphFormatVersion: 1,
        createdByUserId: author.id,
        createdAt: this.now.minus({ days: 6 }),
      },
      { client: trx }
    )
    reengage.draftVersionId = reengageVersion.id
    reengage.useTransaction(trx)
    await reengage.save()

    return {
      welcome: { campaign: welcome, version: welcomeVersion, nodes: welcomeNodes, id: welcome.id },
      cart: { campaign: cart, version: cartVersion, nodes: cartNodes, id: cart.id },
      reengage: { campaign: reengage, version: reengageVersion, id: reengage.id },
    }
  }

  private frozenSendConfig(email: Email): Record<string, unknown> {
    return {
      emailId: email.id,
      subject: email.subject,
      htmlContent: email.htmlContent ?? '',
      textContent: email.textContent ?? '',
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      replyTo: email.replyTo,
    }
  }

  private async createGraph(
    trx: TransactionClientContract,
    versionId: number,
    specs: {
      key: string
      type: 'source' | 'action' | 'condition' | 'trigger'
      subtype: string
      x: number
      y: number
      config: Record<string, unknown>
    }[]
  ) {
    const byKey: Record<string, CampaignNode> = {}
    for (const spec of specs) {
      byKey[spec.key] = await CampaignNode.create(
        {
          campaignVersionId: versionId,
          clientKey: spec.key,
          type: spec.type,
          subtype: spec.subtype,
          config: spec.config,
          positionX: spec.x,
          positionY: spec.y,
        },
        { client: trx }
      )
    }
    return byKey
  }

  private async createEdges(
    trx: TransactionClientContract,
    versionId: number,
    nodes: Record<string, CampaignNode>,
    edges: [string, string, 'true' | 'false' | null][]
  ) {
    for (const [from, to, handle] of edges) {
      await CampaignEdge.create(
        {
          campaignVersionId: versionId,
          sourceNodeId: nodes[from].id,
          targetNodeId: nodes[to].id,
          sourceHandle: handle,
        },
        { client: trx }
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Enrollments + executions + deliveries + events
  // ---------------------------------------------------------------------------

  private async seedDeliveriesAndEvents(
    trx: TransactionClientContract,
    project: Project,
    deps: {
      contacts: Contact[]
      emails: Record<string, Email>
      connector: SmtpConnector
      campaigns: SeededCampaigns
    }
  ) {
    const { contacts, emails, connector, campaigns } = deps
    const alive = contacts.filter((c) => !c.deletedAt)
    const events: Record<string, unknown>[] = []

    const addFunnel = (deliveryId: number, contactId: number, sentAt: DateTime, status: string) => {
      events.push(this.eventRow(project.id, deliveryId, contactId, 'sent', sentAt))

      if (status === 'bounced') {
        events.push(
          this.eventRow(project.id, deliveryId, contactId, 'bounced', sentAt.plus({ minutes: 2 }), {
            code: '550',
            reason: 'Mailbox unavailable',
          })
        )
        return
      }
      if (status === 'failed') {
        events.push(
          this.eventRow(project.id, deliveryId, contactId, 'failed', sentAt.plus({ minutes: 1 }), {
            reason: 'SMTP timeout',
          })
        )
        return
      }

      const deliveredAt = sentAt.plus({ seconds: this.int(20, 180) })
      events.push(this.eventRow(project.id, deliveryId, contactId, 'delivered', deliveredAt))

      if (this.rand() < 0.47) {
        const openedAt = deliveredAt.plus({ minutes: this.int(3, 3600) })
        events.push(
          this.eventRow(project.id, deliveryId, contactId, 'opened', openedAt, {
            userAgent: faker.helpers.arrayElement(USER_AGENTS),
            ip: faker.internet.ipv4(),
          })
        )

        if (this.rand() < 0.34) {
          events.push(
            this.eventRow(
              project.id,
              deliveryId,
              contactId,
              'clicked',
              openedAt.plus({ minutes: this.int(1, 120) }),
              { url: 'https://boutique-lumen.fr/nouveautes' }
            )
          )
        }
        if (this.rand() < 0.03) {
          events.push(
            this.eventRow(
              project.id,
              deliveryId,
              contactId,
              'unsubscribed',
              openedAt.plus({ minutes: this.int(1, 240) })
            )
          )
        }
      }
      if (this.rand() < 0.008) {
        events.push(
          this.eventRow(
            project.id,
            deliveryId,
            contactId,
            'complained',
            deliveredAt.plus({ hours: this.int(1, 48) })
          )
        )
      }
    }

    // --- Campaign 1 enrollments / executions -----------------------------
    const welcome = campaigns.welcome
    const enrollmentPool = faker.helpers.arrayElements(
      alive.filter((c) => c.status === 'subscribed' || c.status === 'unsubscribed'),
      64
    )

    type PendingExec = {
      enrolledAt: DateTime
      contact: Contact
      status: 'active' | 'completed' | 'exited' | 'cancelled'
      reachedTips: boolean
    }
    const pending: PendingExec[] = []
    const enrollmentRows: Record<string, unknown>[] = []

    for (const contact of enrollmentPool) {
      const enrolledAt = this.now.minus({ days: this.int(1, 84), hours: this.int(0, 23) })
      const status = this.weighted([
        ['completed', 0.5],
        ['active', 0.3],
        ['exited', 0.13],
        ['cancelled', 0.07],
      ])
      const reachedTips = status === 'completed' || (status === 'active' && this.rand() < 0.4)
      const exitedAt =
        status === 'completed'
          ? enrolledAt.plus({ days: this.int(3, 9) })
          : status === 'exited'
            ? enrolledAt.plus({ days: this.int(1, 6) })
            : status === 'cancelled'
              ? enrolledAt.plus({ days: this.int(1, 4) })
              : null
      const exitReason =
        status === 'completed'
          ? 'completed_all_steps'
          : status === 'exited'
            ? faker.helpers.arrayElement(['unsubscribed', 'left_segment', 'manual'])
            : status === 'cancelled'
              ? 'contact_removed'
              : null

      enrollmentRows.push({
        project_id: project.id,
        campaign_id: welcome.id,
        campaign_version_id: welcome.version.id,
        contact_id: contact.id,
        status,
        source: 'segment_match',
        enrolled_at: this.sql(enrolledAt),
        exited_at: exitedAt ? this.sql(exitedAt) : null,
        exit_reason: exitReason,
        created_at: this.sql(enrolledAt),
        updated_at: this.sql(exitedAt ?? enrolledAt),
      })
      pending.push({ enrolledAt, contact, status, reachedTips })
    }

    const enrollmentIds = await this.bulkInsertReturning(
      trx,
      'campaign_enrollments',
      enrollmentRows
    )

    const execRows: Record<string, unknown>[] = []
    for (const [i, p] of pending.entries()) {
      const startedAt = p.enrolledAt.plus({ minutes: this.int(1, 10) })
      const execStatus =
        p.status === 'completed'
          ? 'completed'
          : p.status === 'active'
            ? this.rand() < 0.6
              ? 'waiting'
              : 'running'
            : 'cancelled'
      const finishedAt =
        p.status === 'completed' || p.status === 'cancelled'
          ? p.enrolledAt.plus({ days: this.int(2, 9) })
          : null
      const currentKey =
        p.status === 'completed' ? 'tag-client' : p.reachedTips ? 'send-tips' : 'wait-2d'
      const scheduledAt =
        execStatus === 'waiting' ? this.now.plus({ hours: this.int(2, 40) }) : startedAt

      execRows.push({
        campaign_enrollment_id: enrollmentIds[i],
        current_node_id: welcome.nodes[currentKey].id,
        status: execStatus,
        scheduled_at: this.sql(scheduledAt),
        started_at: this.sql(startedAt),
        finished_at: finishedAt ? this.sql(finishedAt) : null,
        attempt_count: this.rand() < 0.9 ? 1 : 2,
        lock_version: 0,
        created_at: this.sql(p.enrolledAt),
        updated_at: this.sql(finishedAt ?? startedAt),
      })
    }
    const execIds = await this.bulkInsertReturning(trx, 'campaign_executions', execRows)

    // Execution timeline events + the plan for campaign-linked deliveries.
    const execEventRows: Record<string, unknown>[] = []
    const campaignDeliveryPlan: {
      execId: number
      nodeKey: 'send-welcome' | 'send-tips'
      contact: Contact
      sentAt: DateTime
    }[] = []

    for (const [i, p] of pending.entries()) {
      const execId = execIds[i]
      execEventRows.push(
        this.execEventRow(
          execId,
          welcome.nodes['source'].id,
          'enrollment_started',
          p.enrolledAt,
          'Contact inscrit via le segment'
        )
      )
      const sentWelcomeAt = p.enrolledAt.plus({ minutes: this.int(2, 15) })
      execEventRows.push(
        this.execEventRow(
          execId,
          welcome.nodes['send-welcome'].id,
          'node_completed',
          sentWelcomeAt,
          'Email « bienvenue » envoyé'
        )
      )
      campaignDeliveryPlan.push({
        execId,
        nodeKey: 'send-welcome',
        contact: p.contact,
        sentAt: sentWelcomeAt,
      })

      if (p.status !== 'cancelled') {
        execEventRows.push(
          this.execEventRow(
            execId,
            welcome.nodes['wait-2d'].id,
            'node_entered',
            sentWelcomeAt.plus({ minutes: 1 }),
            'Attente de 2 jours'
          )
        )
      }
      if (p.reachedTips) {
        const sentTipsAt = sentWelcomeAt.plus({ days: 2, minutes: this.int(1, 90) })
        execEventRows.push(
          this.execEventRow(
            execId,
            welcome.nodes['send-tips'].id,
            'node_completed',
            sentTipsAt,
            'Email « conseils » envoyé'
          )
        )
        campaignDeliveryPlan.push({
          execId,
          nodeKey: 'send-tips',
          contact: p.contact,
          sentAt: sentTipsAt,
        })
      }
      if (p.status === 'completed') {
        execEventRows.push(
          this.execEventRow(
            execId,
            welcome.nodes['tag-client'].id,
            'enrollment_completed',
            p.enrolledAt.plus({ days: 4 }),
            'Parcours terminé'
          )
        )
      }
      if (p.status === 'cancelled') {
        execEventRows.push(
          this.execEventRow(
            execId,
            null,
            'enrollment_cancelled',
            p.enrolledAt.plus({ days: 1 }),
            'Contact retiré de la campagne'
          )
        )
      }
    }
    await this.bulkInsert(trx, 'campaign_execution_events', execEventRows)

    // Campaign-linked deliveries (persisted via the model for their ids).
    for (const plan of campaignDeliveryPlan) {
      const email = plan.nodeKey === 'send-welcome' ? emails['welcome'] : emails['tips']
      const status = this.weighted([
        ['delivered', 0.9],
        ['bounced', 0.04],
        ['failed', 0.03],
        ['sent', 0.03],
      ])
      const delivery = await EmailDelivery.create(
        {
          projectId: project.id,
          campaignId: welcome.id,
          campaignExecutionId: plan.execId,
          emailId: email.id,
          contactId: plan.contact.id,
          smtpConnectorId: connector.id,
          idempotencyKey: `${plan.execId}:${welcome.nodes[plan.nodeKey].id}`,
          providerMessageId: status === 'failed' ? null : `<${randomUUID()}@mailtrap>`,
          status,
          attemptCount: status === 'failed' ? 2 : 1,
          sentAt: status === 'failed' ? null : plan.sentAt,
          deliveredAt:
            status === 'delivered' ? plan.sentAt.plus({ seconds: this.int(20, 200) }) : null,
          createdAt: plan.sentAt,
          updatedAt: plan.sentAt,
        },
        { client: trx }
      )
      addFunnel(delivery.id, plan.contact.id, plan.sentAt, status)
    }

    // --- Broadcast-style deliveries for a published newsletter email ----
    const broadcastEmail = emails['welcome']
    const broadcastTargets = faker.helpers.arrayElements(
      alive.filter((c) => c.status === 'subscribed'),
      Math.min(280, alive.length)
    )
    let seq = 0
    for (const contact of broadcastTargets) {
      const sentAt = this.now.minus({
        days: this.int(1, 80),
        hours: this.int(0, 23),
        minutes: this.int(0, 59),
      })
      const status = this.weighted([
        ['delivered', 0.93],
        ['bounced', 0.03],
        ['failed', 0.02],
        ['sent', 0.02],
      ])
      seq += 1
      const delivery = await EmailDelivery.create(
        {
          projectId: project.id,
          campaignId: null,
          campaignExecutionId: null,
          emailId: broadcastEmail.id,
          contactId: contact.id,
          smtpConnectorId: connector.id,
          idempotencyKey: `broadcast:${broadcastEmail.id}:${contact.id}:${seq}`,
          providerMessageId: status === 'failed' ? null : `<${randomUUID()}@mailtrap>`,
          status,
          attemptCount: status === 'failed' ? 2 : 1,
          sentAt: status === 'failed' ? null : sentAt,
          deliveredAt: status === 'delivered' ? sentAt.plus({ seconds: this.int(20, 200) }) : null,
          createdAt: sentAt,
          updatedAt: sentAt,
        },
        { client: trx }
      )
      addFunnel(delivery.id, contact.id, sentAt, status)
    }

    await this.bulkInsert(trx, 'email_events', events)
  }

  private eventRow(
    projectId: number,
    deliveryId: number,
    contactId: number,
    type: string,
    occurredAt: DateTime,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      project_id: projectId,
      email_delivery_id: deliveryId,
      contact_id: contactId,
      type,
      metadata: metadata ? JSON.stringify(metadata) : null,
      occurred_at: this.sql(occurredAt),
    }
  }

  private execEventRow(
    execId: number,
    nodeId: number | null,
    type: string,
    occurredAt: DateTime,
    message: string
  ): Record<string, unknown> {
    return {
      campaign_execution_id: execId,
      node_id: nodeId,
      type,
      message,
      metadata: null,
      occurred_at: this.sql(occurredAt),
    }
  }

  // ---------------------------------------------------------------------------
  // Unsubscribe tokens + events
  // ---------------------------------------------------------------------------

  private async seedUnsubscribeData(
    trx: TransactionClientContract,
    project: Project,
    contacts: Contact[],
    welcomeCampaignId: number
  ) {
    const alive = contacts.filter((c) => !c.deletedAt)

    const tokenTargets = faker.helpers.arrayElements(
      alive.filter((c) => c.status === 'subscribed'),
      60
    )
    await this.bulkInsert(
      trx,
      'unsubscribe_tokens',
      tokenTargets.map((c) => ({
        project_id: project.id,
        contact_id: c.id,
        token: randomBytes(24).toString('hex'),
        created_at: this.sql(c.createdAt.plus({ days: this.int(1, 30) })),
        used_at: null,
      }))
    )

    const eventRows: Record<string, unknown>[] = []
    for (const contact of alive) {
      if (!['unsubscribed', 'complained', 'bounced'].includes(contact.status)) continue
      const source =
        contact.status === 'complained'
          ? 'complaint'
          : contact.status === 'bounced'
            ? 'bounce'
            : this.weighted([
                ['link', 0.7],
                ['manual', 0.2],
                ['api', 0.1],
              ])
      const occurredAt = this.now.minus({ days: this.int(1, 70), hours: this.int(0, 23) })
      eventRows.push({
        project_id: project.id,
        contact_id: contact.id,
        campaign_id: source === 'link' && this.rand() < 0.6 ? welcomeCampaignId : null,
        source,
        reason:
          source === 'bounce'
            ? 'Hard bounce (550)'
            : source === 'complaint'
              ? 'Marqué comme spam'
              : null,
        occurred_at: this.sql(occurredAt),
      })
    }
    await this.bulkInsert(trx, 'contact_unsubscribe_events', eventRows)
  }

  // ---------------------------------------------------------------------------
  // Pre-aggregated daily statistics (project + per campaign)
  // ---------------------------------------------------------------------------

  private async seedDailyStats(
    trx: TransactionClientContract,
    project: Project,
    campaigns: SeededCampaigns
  ) {
    const DAYS = 90
    const projectRows: Record<string, unknown>[] = []
    const campaignRows: Record<string, unknown>[] = []

    const campaignRow = (campaignId: number, date: DateTime, iso: string, s: number) => {
      const del = Math.round(s * this.floatBetween(0.93, 0.99))
      campaignRows.push({
        project_id: project.id,
        campaign_id: campaignId,
        date: iso,
        sent: s,
        delivered: del,
        opened: Math.round(del * this.floatBetween(0.35, 0.62)),
        clicked: Math.round(del * this.floatBetween(0.08, 0.2)),
        bounced: Math.max(0, s - del),
        failed: Math.round(s * this.floatBetween(0, 0.02)),
        unsubscribed: Math.round(del * this.floatBetween(0, 0.01)),
        created_at: this.sql(date.endOf('day')),
        updated_at: this.sql(date.endOf('day')),
      })
    }

    for (let d = DAYS; d >= 1; d--) {
      const date = this.now.minus({ days: d })
      const iso = date.toISODate()!
      const isWeekend = date.weekday >= 6
      const progress = (DAYS - d) / DAYS

      const base = isWeekend ? this.int(8, 40) : this.int(55, 140)
      const spike = this.rand() < 0.08 ? this.int(120, 260) : 0
      const sent = base + spike
      const delivered = Math.round(sent * this.floatBetween(0.94, 0.985))
      const opened = Math.round(delivered * this.floatBetween(0.32, 0.56))
      const clicked = Math.round(delivered * this.floatBetween(0.06, 0.16))
      const bounced = Math.max(0, sent - delivered - this.int(0, 2))
      const failed = Math.round(sent * this.floatBetween(0, 0.015))
      const unsubscribes = Math.round(delivered * this.floatBetween(0, 0.006))
      const contactsTotal = Math.round(108 + progress * 50 + this.int(-1, 1))
      const contactsActive = Math.round(contactsTotal * this.floatBetween(0.78, 0.85))

      projectRows.push({
        project_id: project.id,
        date: iso,
        contacts_total: contactsTotal,
        contacts_active: contactsActive,
        emails_sent: sent,
        emails_delivered: delivered,
        emails_opened: opened,
        emails_clicked: clicked,
        emails_bounced: bounced,
        emails_failed: failed,
        unsubscribes: unsubscribes,
        created_at: this.sql(date.endOf('day')),
        updated_at: this.sql(date.endOf('day')),
      })

      campaignRow(campaigns.welcome.id, date, iso, this.int(4, 22))
      campaignRow(campaigns.cart.id, date, iso, d > 10 ? this.int(3, 16) : 0)
    }

    await this.bulkInsert(trx, 'project_daily_stats', projectRows)
    await this.bulkInsert(trx, 'campaign_daily_stats', campaignRows)
  }

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  private async seedAuditLog(
    trx: TransactionClientContract,
    organization: Organization,
    project: Project,
    deps: { actors: User[]; campaigns: SeededCampaigns; contacts: Contact[] }
  ) {
    const { actors, campaigns, contacts } = deps
    const owner = actors[0]
    const rows: Record<string, unknown>[] = []
    const push = (
      action: string,
      occurredAt: DateTime,
      opts: {
        actor?: User
        orgLevel?: boolean
        entityType?: string
        entityId?: number
        metadata?: Record<string, unknown>
      } = {}
    ) => {
      rows.push({
        organization_id: organization.id,
        project_id: opts.orgLevel ? null : project.id,
        actor_user_id: (opts.actor ?? owner).id,
        action,
        entity_type: opts.entityType ?? null,
        entity_id: opts.entityId ?? null,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        occurred_at: this.sql(occurredAt),
      })
    }

    push('project.created', this.now.minus({ months: 7 }), { orgLevel: true })
    push('organization.member_invited', this.now.minus({ months: 6, days: 12 }), {
      orgLevel: true,
      metadata: { email: 'sofia@basalt.dev', role: 'admin' },
    })
    push('organization.member_joined', this.now.minus({ months: 6, days: 10 }), {
      orgLevel: true,
      actor: actors[1],
    })
    push('organization.member_joined', this.now.minus({ months: 5, days: 2 }), {
      orgLevel: true,
      actor: actors[2],
    })
    push('smtp_connector.created', this.now.minus({ months: 6 }), {
      entityType: 'SmtpConnector',
      entityId: 1,
    })
    push('email_layout.created', this.now.minus({ months: 6 }), {
      entityType: 'EmailLayout',
      entityId: 1,
    })

    for (let i = 1; i <= 3; i++) {
      push('email_template.created', this.now.minus({ months: 5, days: i * 4 }), {
        actor: actors[i % 3],
        entityType: 'EmailTemplate',
        entityId: i,
      })
    }
    for (let i = 1; i <= 5; i++) {
      push('email.created', this.now.minus({ months: 4, days: i * 3 }), {
        actor: actors[i % 3],
        entityType: 'Email',
        entityId: i,
      })
    }
    for (let i = 1; i <= 3; i++) {
      push('email.published', this.now.minus({ months: 4, days: i * 2 }), {
        entityType: 'Email',
        entityId: i,
      })
    }

    push('campaign.version_published', this.now.minus({ months: 3 }), {
      entityType: 'Campaign',
      entityId: campaigns.welcome.id,
      metadata: { versionNumber: 1 },
    })
    push('campaign.activated', this.now.minus({ months: 3 }), {
      entityType: 'Campaign',
      entityId: campaigns.welcome.id,
    })
    push('campaign.version_published', this.now.minus({ months: 2 }), {
      entityType: 'Campaign',
      entityId: campaigns.cart.id,
      metadata: { versionNumber: 1 },
    })
    push('campaign.activated', this.now.minus({ months: 2 }), {
      entityType: 'Campaign',
      entityId: campaigns.cart.id,
    })
    push('campaign.paused', this.now.minus({ days: 10 }), {
      actor: actors[1],
      entityType: 'Campaign',
      entityId: campaigns.cart.id,
    })

    for (const name of [
      'Clients payants',
      'Prospects France',
      'Contacts désabonnés',
      'Nouveaux inscrits (30 j)',
    ]) {
      push('segment.recompute', this.now.minus({ days: this.int(1, 30) }), {
        actor: actors[this.int(0, 2)],
        entityType: 'Segment',
        metadata: { name },
      })
    }

    push('api_key.created', this.now.minus({ months: 2 }), { entityType: 'ApiKey', entityId: 1 })

    for (const contact of contacts
      .filter((c) => !c.deletedAt && c.status === 'unsubscribed')
      .slice(0, 12)) {
      push('contact.unsubscribed', this.now.minus({ days: this.int(1, 60) }), {
        actor: actors[this.int(0, 2)],
        entityType: 'Contact',
        entityId: contact.id,
      })
    }

    for (const contact of contacts.filter((c) => !c.deletedAt).slice(0, 8)) {
      push('campaign_enrollment.created', this.now.minus({ days: this.int(1, 40) }), {
        entityType: 'Contact',
        entityId: contact.id,
        metadata: { campaignId: campaigns.welcome.id },
      })
    }

    await this.bulkInsert(trx, 'audit_logs', rows)
  }

  // ---------------------------------------------------------------------------
  // API keys
  // ---------------------------------------------------------------------------

  private async seedApiKeys(trx: TransactionClientContract, project: Project, actor: User) {
    const active = `mtc_${randomBytes(32).toString('base64url')}`
    await ApiKey.create(
      {
        projectId: project.id,
        name: 'Intégration site web',
        tokenHash: createHash('sha256').update(active).digest('hex'),
        tokenPrefix: active.slice(0, 12),
        createdBy: actor.id,
        lastUsedAt: this.now.minus({ hours: 5 }),
        createdAt: this.now.minus({ months: 2 }),
      },
      { client: trx }
    )

    const revoked = `mtc_${randomBytes(32).toString('base64url')}`
    await ApiKey.create(
      {
        projectId: project.id,
        name: "Ancien script d'import (révoquée)",
        tokenHash: createHash('sha256').update(revoked).digest('hex'),
        tokenPrefix: revoked.slice(0, 12),
        createdBy: actor.id,
        lastUsedAt: this.now.minus({ months: 1, days: 10 }),
        revokedAt: this.now.minus({ months: 1 }),
        createdAt: this.now.minus({ months: 3 }),
      },
      { client: trx }
    )
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private rand(): number {
    return faker.number.float({ min: 0, max: 1 })
  }

  private floatBetween(min: number, max: number): number {
    return faker.number.float({ min, max })
  }

  private int(min: number, max: number): number {
    return faker.number.int({ min, max })
  }

  private weighted<const T>(pairs: readonly (readonly [T, number])[]): T {
    const total = pairs.reduce((sum, [, w]) => sum + w, 0)
    let roll = this.rand() * total
    for (const [value, weight] of pairs) {
      roll -= weight
      if (roll <= 0) return value
    }
    return pairs[pairs.length - 1][0]
  }

  /** Luxon → `YYYY-MM-DD HH:mm:ss` for raw multi-inserts (matches Lucid's datetime formatting). */
  private sql(dt: DateTime): string {
    return dt.toFormat('yyyy-LL-dd HH:mm:ss')
  }

  private async bulkInsert(
    trx: TransactionClientContract,
    table: string,
    rows: Record<string, unknown>[]
  ) {
    if (rows.length === 0) return
    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      await trx.table(table).multiInsert(rows.slice(i, i + CHUNK))
    }
  }

  /** Like `bulkInsert`, but returns the auto-increment ids in insertion order. */
  private async bulkInsertReturning(
    trx: TransactionClientContract,
    table: string,
    rows: Record<string, unknown>[]
  ): Promise<number[]> {
    const ids: number[] = []
    for (const row of rows) {
      const [id] = await trx.table(table).insert(row)
      ids.push(id as number)
    }
    return ids
  }
}
