import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {ux} from '@oclif/core'
import {DateTime} from 'luxon'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliOptions,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

export default class ListDataIntegrationsCommand extends Command {
  static description = `List registered data integrations for a Borealis Isolated Postgres add-on

A data integration allows a third party service access to an add-on database
via a secure tunnel using semi-permanent SSH server and database credentials.`

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(ListDataIntegrationsCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)
    try {
      const response = await applyActionSpinner(
        `Fetching data integration list for add-on ${color.addon(addonName)}`,
        HTTP.get(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/data-integrations`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )

      const responseBody = response.body as {integrations: Array<DataIntegrationInfo>}
      if (responseBody.integrations.length > 0) {
        const columns: {[name: string]: any} = {
          name: {header: 'Data Integration'},
          dbUsername: {header: 'DB Username'},
          sshUsername: {header: 'SSH Username'},
          writeAccess: {header: 'Write Access'},
          createdAt: {header: 'Created At'},
        }
        const normalizedIntegrations = responseBody.integrations.map(value => {
          return {
            name: value.name,
            dbUsername: value.dbUsername,
            sshUsername: value.sshUsername,
            writeAccess: value.writeAccess,
            createdAt: DateTime.fromISO(value.createdAt).toISO(),
          }
        })

        this.log()
        ux.table(normalizedIntegrations, columns, {'no-truncate': true})
      } else {
        this.warn('No data integrations found')
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

interface DataIntegrationInfo {
  name: string;
  dbUsername: string;
  sshUsername: string;
  writeAccess: boolean;
  createdAt: string;
}
