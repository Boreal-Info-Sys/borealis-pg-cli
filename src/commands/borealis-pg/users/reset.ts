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
  formatCliOptionName,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const cliCmdColour = consoleColours.cliCmdName

export default class ResetUsersCommand extends Command {
  static description =
    `Reset all database credentials for a Borealis Isolated Postgres add-on

The Heroku application's database user roles will be assigned new, random
usernames and passwords and the application's config vars will be updated
imminently with the new credentials. To ensure there is no application
downtime, the old application database credentials will continue to remain
valid for a short time after this operation is completed, after which they
will be disabled.

Any active personal database user roles will also be deactivated by this
operation, which means that anyone that is currently connected to the database
with a personal user role will be immediately disconnected. Rest assured that
any tables, indexes, views or other objects that are are owned by a personal
user role will not be affected (the user roles and the objects they own will
continue to exist). A personal user role that has been deactivated will be
automatically reactivated when the affected user runs one of the
${cliCmdColour('borealis-pg:psql')} or ${cliCmdColour('borealis-pg:tunnel')} commands (or ${cliCmdColour('borealis-pg:run')} with the
${formatCliOptionName('personal-user')} option).

Add-on data integrations are unaffected by this operation. To revoke database
credentials assigned to a data integration, use the
${cliCmdColour('borealis-pg:integrations:revoke')} command.`

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(ResetUsersCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)
    try {
      await applyActionSpinner(
        `Resetting all database credentials for add-on ${color.addon(addonName)}`,
        HTTP.delete<{success: boolean}>(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/db-users/credentials`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        this.error('Add-on is currently undergoing maintenance. Try again in a few minutes.')
      } else if (err.statusCode === 403) {
        this.error(
          'Write access to the add-on database has been temporarily revoked. ' +
          'Generally this indicates the database has persistently exceeded its storage limit. ' +
          'Try upgrading to a new add-on plan to restore access.')
      } else if (err.statusCode === 404) {
        this.error('Add-on is not a Borealis Isolated Postgres add-on')
      } else if (err.statusCode === 422) {
        this.error('Add-on is not finished provisioning')
      } else if (err.statusCode === 423) {
        this.error('Add-on is undergoing a PostgreSQL major version upgrade.\n' +
          `Try again later or run ${consoleColours.cliCmdName('borealis-pg:upgrade:cancel')} to cancel the upgrade process.`,
        )
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}
