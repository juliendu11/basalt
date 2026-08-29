import vine from '@vinejs/vine'

/**
 * Status-transition actions (activate/pause/resume/archive/duplicate) take
 * no body — validity of the transition itself is enforced in
 * `CampaignService`, not here (docs/plans/10-campaigns.md § Validation).
 */
export const createCampaignValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    description: vine.string().trim().maxLength(2000).optional(),
    /**
     * Defaults to 'never' if omitted (docs/plans/13-campaign-enrollment.md §
     * Domain concepts) — the safest default, avoiding re-enrollment spam
     * for a contact oscillating in/out of the source segment.
     */
    reentryPolicy: vine.enum(['never', 'after_exit', 'always'] as const).optional(),
    /**
     * Defaults to `false` if omitted — same "safest default" reasoning as
     * `reentryPolicy` above (docs/plans/13-campaign-enrollment.md § Domain
     * concepts): opting in is an explicit choice, not the default, since it
     * changes who gets enrolled compared to every other campaign.
     */
    enrollExistingMembers: vine.boolean().optional(),
  })
)

export const updateCampaignValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
  })
)
