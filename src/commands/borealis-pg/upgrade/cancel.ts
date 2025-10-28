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

export default class PgVersionCancellationCommand extends Command {
  static description =
    `cancels a PostgreSQL version upgrade of a Borealis Isolated Postgres add-on

Run this command to cancel a PostgreSQL version upgrade that was started with
the ${consoleColours.cliCmdName('borealis-pg:upgrade:execute')} command. Can only be used when an upgrade is
still in progress.

There is no disruption to an add-on database's availability when this command
is executed. It simply discards the logical replica that was created to perform
the upgrade behind the scenes.`

  static examples = [
    `$ heroku borealis-pg:upgrade:cancel --${appOptionName} sushi`,
  ]

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(PgVersionCancellationCommand)

    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      await applyActionSpinner(
        `Cancelling PostgreSQL major version upgrade for add-on ${color.addon(addonName)}`,
        this.cancelPgVersionUpgrade(addonName, authorization),
      )

      console.warn()
      console.warn('It may be several minutes before the add-on is ready to try another upgrade.')
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async cancelPgVersionUpgrade(
    addonName: string,
    authorization: OAuthAuthorization): Promise<any> {
    const response = await HTTP.delete(
      getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-version-upgrades/current`),
      {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})

    return response.body
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        this.error('There is no PostgreSQL version upgrade in progress for add-on')
      } else if (err.statusCode === 404) {
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
