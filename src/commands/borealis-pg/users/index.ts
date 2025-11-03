import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {ux} from '@oclif/core'
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

export default class ListUsersCommand extends Command {
  static description = `List database user roles for a Borealis Isolated Postgres add-on

Note that this command's output only includes active add-on database user
roles. The Heroku application's database user roles are always present.
Personal read-only and read/write database user roles are automatically
created or reactivated for any user that has permission to access any app the
add-on is attached to when that user runs one of the ${cliCmdColour('borealis-pg:psql')} or
${cliCmdColour('borealis-pg:tunnel')} commands (or ${cliCmdColour('borealis-pg:run')} with the ${formatCliOptionName('personal-user')}
option). All personal database user roles are automatically deactivated when
the add-on's database user credentials are reset (for example, via the
${cliCmdColour('borealis-pg:users:reset')} command).`

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(ListUsersCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)
    try {
      const response = await applyActionSpinner(
        `Fetching user list for add-on ${color.addon(addonName)}`,
        HTTP.get<{users: [DbUserInfo]}>(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/db-users`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )

      if (response.body.users.length > 0) {
        const columns: {[name: string]: any} = {
          displayName: {header: 'Add-on User'},
          readOnlyUsername: {header: 'DB Read-only Username'},
          readWriteUsername: {header: 'DB Read/Write Username'},
        }
        const normalizedUsers = response.body.users.map(value => {
          return {
            displayName: (value.displayName ?? 'Heroku App User'),
            readOnlyUsername: value.readOnlyUsername,
            readWriteUsername: value.readWriteUsername,
            userType: value.userType,
          }
        })

        this.log()
        ux.table(normalizedUsers, columns, {'no-truncate': true})
      } else {
        this.warn('No users found')
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

type DbUserInfo = {
  displayName: string | null | undefined;
  readOnlyUsername: string;
  readWriteUsername: string;
  userType: string;
}
