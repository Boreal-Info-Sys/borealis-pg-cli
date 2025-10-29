import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {ux} from '@oclif/core'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliOptions,
  consoleColours,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const dataIntegrationNameColour = consoleColours.dataFieldValue

const confirmOptionName = 'confirm'
const dataIntegrationOptionName = 'name'

export default class RemoveDataIntegrationCommand extends Command {
  static description = 'Remove a data integration from a Borealis Isolated Postgres add-on'

  static examples = [
    `$ heroku borealis-pg:integrations:remove --${appOptionName} sushi --${dataIntegrationOptionName} my_integration1`,
    `$ heroku borealis-pg:integrations:remove --${confirmOptionName} my_integration2 --${appOptionName} sushi --${dataIntegrationOptionName} my_integration2`,
  ]

  static aliases = ['borealis-pg:integrations:deregister']

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [confirmOptionName]: flags.string({
      char: 'c',
      description: 'bypass the confirmation prompt by providing the name of the integration',
    }),
    [dataIntegrationOptionName]: flags.string({
      char: 'n',
      description: 'name of the add-on data integration',
      required: true,
    }),
  }

  async run() {
    const {flags} = await this.parse(RemoveDataIntegrationCommand)
    const integrationName = flags[dataIntegrationOptionName]
    const confirmation = flags.confirm ?
      flags.confirm :
      (await ux.prompt('Enter the name of the data integration to confirm its removal'))

    if (confirmation.trim() !== integrationName) {
      this.error(
        `Invalid confirmation provided. Expected ${dataIntegrationNameColour(integrationName)}.`)
    }

    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      await applyActionSpinner(
        `Removing data integration from add-on ${color.addon(addonName)}`,
        HTTP.delete(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/data-integrations/${integrationName}`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 403) {
        this.error('Add-on database write access has been revoked')
      } else if (err.statusCode === 404) {
        this.error('Data integration does not exist')
      } else if (err.statusCode === 422) {
        this.error('Add-on is not finished provisioning')
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}
