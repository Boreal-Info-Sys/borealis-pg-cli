import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {AddOn} from '@heroku-cli/schema'
import {DateTime} from 'luxon'
import {applyActionSpinner} from '../../../async-actions'
import {borealisApiOptions, getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  addonServiceName,
  appOptionName,
  cliOptions,
  componentServices,
  consoleColours,
  formatCliOptionName,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {
  createHerokuAuth,
  fetchAddonAttachmentInfo,
  herokuApiOptions,
  removeHerokuAuth,
} from '../../../heroku-api'

const cliCmdColour = consoleColours.cliCmdName

const herokuProvisioningAddonStatus = 'provisioning'
const borealisProvisioningAddonStatuses: {[name: string]: boolean} = {
  awaiting: true,
  configuring: true,
  provisioning: true,
  requested: true,
}

const attachmentNameOptionName = 'as'
const destinationAppOptionName = 'destination-app'
const newPlanOptionName = 'new-plan'
const restoreToTimeOptionName = 'restore-to-time'
const waitOptionName = 'wait'

export default class DbRestoreExecuteCommand extends Command {
  static description = `Restore or clone a Borealis Isolated Postgres add-on database

Qualifying add-on databases may be restored to an earlier point in time or
cloned. This operation restores/clones the add-on database into a brand new
add-on database, leaving the original add-on database unaffected. Note that,
when an add-on database is cloned (that is, the ${formatCliOptionName(restoreToTimeOptionName)} option is
omitted), it will produce a physical copy as at the current time, regardless
of the add-on's reported latest restorable time.

See the ${cliCmdColour('borealis-pg:restore:capabilities')} command to determine the earliest and
latest restorable times of an add-on.`

  static examples = [
    `$ heroku borealis-pg:restore:execute --${appOptionName} sushi --${addonOptionName} SOURCE_DB --${attachmentNameOptionName} CLONED_DB`,
    `$ heroku borealis-pg:restore:execute --${appOptionName} sushi --${restoreToTimeOptionName} 2023-02-24T18:42:00-08:00`,
    `$ heroku borealis-pg:restore:execute --${appOptionName} sushi --${destinationAppOptionName} my-other-app --${newPlanOptionName} x2-s100-p2-r8`,
  ]

  static flags = {
    [addonOptionName]: flags.string({
      char: cliOptions.addon.char,
      description: 'name or ID of the source add-on or one of its attachments',
    }),
    [appOptionName]: flags.app({
      description: 'app to which the source add-on is attached',
    }),
    [attachmentNameOptionName]: flags.string({
      description: 'name to assign to the new add-on attachment',
    }),
    [destinationAppOptionName]: flags.string({
      char: 'd',
      description: '[default: source add-on app] app to attach the new add-on to',
    }),
    [newPlanOptionName]: flags.string({
      char: 'n',
      description: '[default: source add-on plan] add-on plan to apply to the new add-on',
    }),
    [restoreToTimeOptionName]: flags.string({
      char: 't',
      description: '[default: now] date/time (in ISO 8601 format) to restore to',
      parse: async input => {
        if (!DateTime.fromISO(input).isValid) {
          throw new Error('Expected an ISO 8601 date/time string')
        } else {
          return input
        }
      },
    }),
    [waitOptionName]: flags.boolean({
      default: false,
      description: 'wait until the add-on has finished before exiting',
    }),
  }

  async run() {
    const {flags} = await this.parse(DbRestoreExecuteCommand)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    const herokuAddonInfo = await this.fetchHerokuAddonInfo(addonName)

    /* istanbul ignore next */
    const destinationApp =
      flags[destinationAppOptionName] ?? herokuAddonInfo.app?.name as string

    const destinationPlan = this.getQualifiedPlanName(flags[newPlanOptionName], herokuAddonInfo)

    const dbRestoreToken =
      await applyActionSpinner('Checking authorization', this.createDbRestoreToken(addonName))

    const operationVerb = flags[restoreToTimeOptionName] ? 'restore' : 'clone'

    const newAddon = await applyActionSpinner(
      `Starting ${operationVerb} of add-on ${color.addon(addonName)}`,
      this.heroku.post<AddOn>(
        `/apps/${destinationApp}/addons`,
        {
          body: this.getAddonCreationRequestBody(
            dbRestoreToken,
            destinationPlan,
            flags[restoreToTimeOptionName],
            flags[attachmentNameOptionName]),
        }))

    const newAddonName = newAddon.body.name as string
    if (flags[waitOptionName]) {
      await applyActionSpinner(
        `Creating add-on ${color.addon(newAddonName)} on ${color.app(destinationApp)}`,
        this.waitForProvisioning(newAddonName),
      )

      componentServices.notifier.notify({
        message: `Add-on ${newAddonName} is available`,
        sound: true,
        title: 'borealis-pg-cli',
        timeout: false,
      })
    } else {
      console.warn(
        `${color.addon(newAddonName)} is being created on ${color.app(destinationApp)} in the ` +
        'background. The app will restart when complete...')
    }
  }

  private getQualifiedPlanName(
    planNameOptionValue: string | null | undefined,
    herokuAddonInfo: AddOn): string {
    /* istanbul ignore next */
    const planName = planNameOptionValue ?? herokuAddonInfo.plan?.name as string

    // Ensure the plan name is fully qualified
    return planName.startsWith(`${addonServiceName}:`) ?
      planName :
      `${addonServiceName}:${planName}`
  }

  private async waitForProvisioning(addonName: string) {
    /* eslint-disable no-await-in-loop */
    // First wait until the Heroku API considers the add-on provisioned
    let herokuAddonStatus = herokuProvisioningAddonStatus
    while (herokuAddonStatus === herokuProvisioningAddonStatus) {
      await new Promise(resolve => {
        // Wait between each poll of the Heroku API
        setTimeout(resolve, herokuApiOptions.addonStatePollIntervalMs)
      })

      const herokuAddon = await this.fetchHerokuAddonInfo(addonName)

      herokuAddonStatus = herokuAddon.state as string
    }

    // If a restore/clone takes long enough, the add-on service will indicate to the Heroku API that
    // provisioning is complete to prevent Heroku from cancelling the operation
    // (https://devcenter.heroku.com/articles/add-on-partner-api-reference#add-on-action-create-provision).
    // So now wait until the Borealis API considers the add-on provisioned before proceeding.
    let borealisAddonStatus = await this.fetchBorealisAddonStatus(addonName)
    while (borealisProvisioningAddonStatuses[borealisAddonStatus]) {
      await new Promise(resolve => {
        // Wait between each poll of the Borealis API
        setTimeout(resolve, borealisApiOptions.addonStatePollIntervalMs)
      })

      borealisAddonStatus = await this.fetchBorealisAddonStatus(addonName)
    }
  }

  private async fetchHerokuAddonInfo(addonName: string): Promise<AddOn> {
    const addonInfoResponse = await this.heroku.get<AddOn>(`/addons/${addonName}`)

    return addonInfoResponse.body
  }

  private async fetchBorealisAddonStatus(addonName: string): Promise<string> {
    const authorization = await createHerokuAuth(this.heroku)
    try {
      const borealisAddonResponse = await HTTP.get<{status: string}>(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}`),
        {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})

      return borealisAddonResponse.body.status
    } catch (error) {
      const httpError = error as HTTPError
      if (httpError.statusCode === 404) {
        componentServices.notifier.notify({
          message: `Add-on ${addonName} was cancelled`,
          sound: true,
          title: 'borealis-pg-cli',
          timeout: false,
        })
        this.error('Provisioning cancelled. The new add-on was deprovisioned.')
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async createDbRestoreToken(addonName: string): Promise<string> {
    const authorization = await createHerokuAuth(this.heroku)
    try {
      const response = await HTTP.post<{restoreToken: string}>(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/restore-tokens`),
        {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})

      return response.body.restoreToken
    } catch (error) {
      const httpError = error as HTTPError
      if (httpError.statusCode === 400) {
        // Typically this happens because the source add-on has a multi-tenant plan
        this.error(httpError.body.reason.toString())
      } else if (httpError.statusCode === 404) {
        this.error('Add-on is not a Borealis Isolated Postgres add-on')
      } else if (httpError.statusCode === 422) {
        this.error('Add-on is not finished provisioning')
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private getAddonCreationRequestBody(
    dbRestoreToken: string,
    destinationPlan: string,
    restoreToTime: string | null | undefined,
    attachmentName: string | null | undefined): {[name: string]: any} {
    const restoreOptions: {[name: string]: string} = {'restore-token': dbRestoreToken}
    if (restoreToTime) {
      restoreOptions['restore-to-time'] = restoreToTime
    }

    const body: {[name: string]: any} = {config: restoreOptions, plan: destinationPlan}
    if (attachmentName) {
      body.attachment = {name: attachmentName}
    }

    return body
  }
}
