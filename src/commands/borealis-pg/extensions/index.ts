import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
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

const pgExtensionColour = consoleColours.pgExtension
const pgExtMetadataColour = consoleColours.dataFieldValue

export default class ListPgExtensionsCommand extends Command {
  static description =
    'List installed PostgreSQL extensions for a Borealis Isolated Postgres add-on'

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(ListPgExtensionsCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)
    try {
      const response = await applyActionSpinner(
        `Fetching Postgres extension list for add-on ${color.addon(addonName)}`,
        HTTP.get(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )

      const responseBody = response.body as
        {extensions: Array<{name: string, schema: string, version: string}>}
      if (responseBody.extensions.length > 0) {
        for (const extInfo of responseBody.extensions) {
          this.log(
            `- ${pgExtensionColour(extInfo.name)} ` +
            `(version: ${pgExtMetadataColour(extInfo.version)}, ` +
            `schema: ${pgExtMetadataColour(extInfo.schema)})`)
        }
      } else {
        this.warn('No extensions found')
      }
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 404) {
        this.error('Add-on is not a Borealis Isolated Postgres add-on')
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
