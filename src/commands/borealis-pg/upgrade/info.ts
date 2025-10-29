import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {OAuthAuthorization} from '@heroku-cli/schema'
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

const keyColour = consoleColours.dataFieldName
const valueColour = consoleColours.dataFieldValue

export default class PgVersionInfoCommand extends Command {
  static description =
    `shows PostgreSQL version upgrade status of a Borealis Isolated Postgres add-on

Indicates whether an add-on can be upgraded to a newer PostgreSQL major
version, and if so, to which version. If an upgrade is available, you can use
the ${consoleColours.cliCmdName('borealis-pg:restore:execute')} command to begin.`

  static examples = [
    `$ heroku borealis-pg:upgrade:info --${appOptionName} sushi`,
  ]

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(PgVersionInfoCommand)

    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      const pgVersionUpgradeInfo = await applyActionSpinner(
        `Fetching PostgreSQL version upgrade info for add-on ${color.addon(addonName)}`,
        this.triggerPgVersionUpgrade(addonName, authorization),
      )

      this.printVersionUpgradeInfo(pgVersionUpgradeInfo)
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async printVersionUpgradeInfo(pgVersionUpgradeInfo: PgVersionUpgradeInfo) {
    const nextPgMajorVersion = pgVersionUpgradeInfo.nextPgMajorVersion ?? 'N/A'

    this.log()
    this.log(` ${keyColour('Current PostgreSQL major version')}: ${valueColour(pgVersionUpgradeInfo.currentPgMajorVersion)}`)
    this.log(`    ${keyColour('Next PostgreSQL major version')}: ${valueColour(nextPgMajorVersion)}`)
    this.log(`                   ${keyColour('Upgrade Status')}: ${valueColour(pgVersionUpgradeInfo.upgradeStatus)}`)
  }

  private async triggerPgVersionUpgrade(
    addonName: string,
    authorization: OAuthAuthorization): Promise<PgVersionUpgradeInfo> {
    const response: HTTP<PgVersionUpgradeInfo> = await HTTP.get(
      getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-version-upgrades`),
      {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})

    return response.body
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

interface PgVersionUpgradeInfo {
  currentPgMajorVersion: string;
  nextPgMajorVersion: string | null;
  upgradeStatus: string;
}
