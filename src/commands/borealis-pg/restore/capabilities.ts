import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {DateTime} from 'luxon'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  cliOptions,
  appOptionName,
  processAddonAttachmentInfo,
  consoleColours,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const keyColour = consoleColours.dataFieldName
const valueColour = consoleColours.dataFieldValue
const cliCmdColour = consoleColours.cliCmdName

export default class DbRestoreInfoCommand extends Command {
  static description =
    `Show the restore capabilities of a Borealis Isolated Postgres add-on database

Qualifying add-on databases may be restored to an earlier point in time or
cloned. This operation outputs the earliest and latest points in time to which
an add-on database may be restored when supported. Note that, when an add-on
database is cloned, it will produce a physical copy as at the current time,
regardless of the add-on's reported latest restorable time.

See the ${cliCmdColour('borealis-pg:restore:execute')} command to perform a restore/clone.`

  static aliases = ['borealis-pg:restore:info']

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(DbRestoreInfoCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      const response = await applyActionSpinner<HTTP<DbRestoreInfo>>(
        `Fetching database restore capabilities of add-on ${color.addon(addonName)}`,
        HTTP.get(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/restore-capabilities`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )

      this.printDbRestoreInfo(response.body)
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async printDbRestoreInfo(dbRestoreInfo: DbRestoreInfo) {
    const nightlyBackupsStatus = 'Enabled'
    const cloneSupportedDisplay = dbRestoreInfo.cloneSupported ? 'Yes' : 'No'
    const restoreSupportedDisplay = dbRestoreInfo.restoreSupported ? 'Yes' : 'No'
    const earliestRestoreTimeDisplay = dbRestoreInfo.earliestRestorableTime ?
      DateTime.fromISO(dbRestoreInfo.earliestRestorableTime).toISO() as string :
      'N/A'
    const latestRestoreTimeDisplay = dbRestoreInfo.latestRestorableTime ?
      DateTime.fromISO(dbRestoreInfo.latestRestorableTime).toISO() as string :
      'N/A'

    this.log()
    this.log(`          ${keyColour('Nightly Backups Status')}: ${valueColour(nightlyBackupsStatus)}`)
    this.log(`                 ${keyColour('Clone Supported')}: ${valueColour(cloneSupportedDisplay)}`)
    this.log(` ${keyColour('Point-in-time Restore Supported')}: ${valueColour(restoreSupportedDisplay)}`)
    this.log(`        ${keyColour('Earliest Restorable Time')}: ${valueColour(earliestRestoreTimeDisplay)}`)
    this.log(`          ${keyColour('Latest Restorable Time')}: ${valueColour(latestRestoreTimeDisplay)}`)
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

interface DbRestoreInfo {
  cloneSupported: boolean;
  earliestRestorableTime: string | null;
  latestRestorableTime: string | null;
  restoreSupported: boolean;
}
