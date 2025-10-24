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

export default class PgVersionUpgradeCommand extends Command {
  static description =
    `upgrades the PostgreSQL version of a Borealis Isolated Postgres add-on

Initiates an upgrade to the next major version of PostgreSQL. Upgrades are
performed asynchronously and may take well over an hour to complete. The
system sends an email at the start and end of the upgrade process to all team
members and collaborators with access to the add-on.

Once the upgrade process has finished, the add-on database can't be rolled back
to the previous major version. It is generally a good idea to test an upgrade
on a clone that was created with the ${consoleColours.cliCmdName('borealis-pg:restore:execute')} command before
upgrading a production add-on database.

The add-on database will remain online and usable throughout most of the
upgrade process, with some limitations. Check the documentation at
https://devcenter.heroku.com/articles/borealis-pg#postgresql-version-upgrades
for details.`

  static examples = [
    `$ heroku borealis-pg:upgrade:execute --${appOptionName} sushi`,
  ]

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(PgVersionUpgradeCommand)

    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      const pgVersionUpgradeInfo = await applyActionSpinner(
        `Starting PostgreSQL major version upgrade for add-on ${color.addon(addonName)}`,
        this.triggerPgVersionUpgrade(addonName, authorization),
      )

      console.warn(
        `${color.addon(addonName)} is being upgraded from PostgreSQL version ` +
        `${pgVersionUpgradeInfo.currentPgMajorVersion} to version ` +
        `${pgVersionUpgradeInfo.targetPgMajorVersion} in the background. ` +
        'The system will send an email when the upgrade process is complete.')
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async triggerPgVersionUpgrade(
    addonName: string,
    authorization: OAuthAuthorization): Promise<PgVersionUpgradeInfo> {
    const response: HTTP<PgVersionUpgradeInfo> = await HTTP.post(
      getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-version-upgrades`),
      {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})

    return response.body
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        this.error(`The add-on is in a state that prevents upgrades: ${err.body.reason.toString()}`)
      } else if (err.statusCode === 403) {
        this.error('Add-on database write access has been revoked')
      } else if (err.statusCode === 404) {
        this.error('Add-on is not a Borealis Isolated Postgres add-on')
      } else if (err.statusCode === 409) {
        this.error('Add-on database is currently undergoing maintenance. Please try again later.')
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
  targetPgMajorVersion: string;
  currentPgMajorVersion: string;
}
