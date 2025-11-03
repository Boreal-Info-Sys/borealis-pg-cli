import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {ux} from '@oclif/core'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliArgs,
  cliOptions,
  consoleColours,
  pgExtensionArgName,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const pgExtensionColour = consoleColours.pgExtension

const confirmOptionName = 'confirm'
const suppressMissingOptionName = 'suppress-missing'

const addonResourceType = 'addon'

export default class RemovePgExtensionCommand extends Command {
  static description =
    'Remove a PostgreSQL extension from a Borealis Isolated Postgres add-on database'

  static examples = [
    `$ heroku borealis-pg:extensions:remove --${suppressMissingOptionName} --${appOptionName} sushi postgis`,
    `$ heroku borealis-pg:extensions:remove --${appOptionName} sushi --${addonOptionName} BOREALIS_PG_MAROON btree_gist`,
    `$ heroku borealis-pg:extensions:remove --${confirmOptionName} uuid-ossp --${addonOptionName} borealis-pg-hex-12345 uuid-ossp`,
  ]

  static args = {
    [pgExtensionArgName]: cliArgs.pgExtension,
  }

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [confirmOptionName]: flags.string({
      char: 'c',
      description: 'bypass the prompt for confirmation by specifying the name of the extension',
    }),
    [suppressMissingOptionName]: flags.boolean({
      char: 's',
      default: false,
      description: 'suppress nonzero exit code when an extension is not installed',
    }),
  }

  async run() {
    const {args, flags} = await this.parse(RemovePgExtensionCommand)
    const pgExtension = args[pgExtensionArgName]
    const suppressMissing = flags[suppressMissingOptionName]

    const confirmation = flags.confirm ?
      flags.confirm :
      (await ux.prompt('Enter the name of the extension to confirm its removal'))

    if (confirmation.trim() !== pgExtension) {
      this.error(`Invalid confirmation provided. Expected ${pgExtensionColour(pgExtension)}.`)
    }

    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      await applyActionSpinner(
        `Removing Postgres extension ${pgExtensionColour(pgExtension)} from add-on ${color.addon(addonName)}`,
        HTTP.delete(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions/${pgExtension}`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )
    } catch (error) {
      if (
        error instanceof HTTPError &&
        error.statusCode === 404 &&
        error.body.resourceType !== addonResourceType &&
        suppressMissing) {
        this.warn(getNotInstalledMessage(pgExtension))
      } else {
        throw error
      }
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    const {args} = await this.parse(RemovePgExtensionCommand)
    const pgExtension = args[pgExtensionArgName]

    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        this.error(
          `Extension ${pgExtensionColour(pgExtension)} has dependent extensions or objects. ` +
          'It can only be removed after its dependents are removed first.')
      } else if (err.statusCode === 404) {
        if (err.body.resourceType === addonResourceType) {
          this.error('Add-on is not a Borealis Isolated Postgres add-on')
        } else {
          this.error(getNotInstalledMessage(pgExtension))
        }
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

function getNotInstalledMessage(pgExtension: string): string {
  return `Extension ${pgExtensionColour(pgExtension)} is not installed`
}
