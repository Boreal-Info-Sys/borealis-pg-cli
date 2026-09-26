import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import Table, {Header} from 'tty-table'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  baseTableHeaderStyle,
  cliOptions,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

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
    const attachmentInfo = await fetchAddonAttachmentInfo(
      this.heroku,
      flags.addon,
      flags.app,
      this.error,
    )
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)
    try {
      const response = await applyActionSpinner(
        `Fetching Postgres extension list for add-on ${color.addon(addonName)}`,
        HTTP.get<{extensions: ExtensionInfo[]}>(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}},
        ),
      )

      if (response.body.extensions.length > 0) {
        this.log(renderResultsTable(response.body.extensions))
      } else {
        this.warn('No extensions found')
      }
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: Error) {
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

function renderResultsTable(extensions: ExtensionInfo[]) {
  const headers: Header[] = [
    {...baseTableHeaderStyle, alias: 'Name', value: 'name'},
    {...baseTableHeaderStyle, alias: 'Version', value: 'version'},
    {...baseTableHeaderStyle, alias: 'Schema', value: 'schema'},
  ]

  const table = Table(headers, extensions, {truncate: false, borderStyle: 'dashed', compact: true})

  return table.render()
}

interface ExtensionInfo {
  name: string
  schema: string
  version: string
}
