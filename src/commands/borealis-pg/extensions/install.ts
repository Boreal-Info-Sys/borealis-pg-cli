import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {OAuthAuthorization} from '@heroku-cli/schema'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliArgs,
  cliOptions,
  consoleColours,
  formatCliOptionName,
  pgExtensionArgName,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const pgExtensionColour = consoleColours.pgExtension
const pgExtMetadataColour = consoleColours.dataFieldValue

const recursiveOptionName = 'recursive'
const suppressConflictOptionName = 'suppress-conflict'

export default class InstallPgExtensionsCommand extends Command {
  static description =
    `Install a PostgreSQL extension on a Borealis Isolated Postgres add-on database

Each extension is typically installed with its own dedicated database schema,
which may be used to store types, functions, tables or other objects that are
part of the extension.

If an extension has any unsatisfied dependencies, its dependencies will be
installed automatically only if the ${formatCliOptionName(recursiveOptionName)} option is provided.

Details of all supported extensions can be found here:
https://www.borealis-data.com/pg-extensions-support.html`

  static examples = [
    `$ heroku borealis-pg:extensions:install --${recursiveOptionName} --${appOptionName} sushi hstore_plperl`,
    `$ heroku borealis-pg:extensions:install --${appOptionName} sushi --${addonOptionName} BOREALIS_PG_MAROON bloom`,
    `$ heroku borealis-pg:extensions:install --${suppressConflictOptionName} --${addonOptionName} borealis-pg-hex-12345 pg_trgm`,
  ]

  static args = {
    [pgExtensionArgName]: cliArgs.pgExtension,
  }

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [recursiveOptionName]: flags.boolean({
      char: 'r',
      default: false,
      description: 'automatically install Postgres extension dependencies recursively',
    }),
    [suppressConflictOptionName]: flags.boolean({
      char: 's',
      default: false,
      description: 'suppress nonzero exit code when an extension is already installed',
    }),
  }

  async run() {
    const {args, flags} = await this.parse(InstallPgExtensionsCommand)
    const pgExtension = args[pgExtensionArgName]
    const suppressConflict = flags[suppressConflictOptionName]
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      const extInfos = await applyActionSpinner(
        `Installing Postgres extension ${pgExtensionColour(pgExtension)} for add-on ${color.addon(addonName)}`,
        this.installExtension(addonName, pgExtension, authorization, flags.recursive),
      )

      for (const extInfo of extInfos) {
        this.log(
          `- ${pgExtensionColour(extInfo.extension)} ` +
          `(version: ${pgExtMetadataColour(extInfo.version)}, ` +
          `schema: ${pgExtMetadataColour(extInfo.schema)})`)
      }
    } catch (error) {
      if (error instanceof HTTPError && error.statusCode === 409 && suppressConflict) {
        this.warn(getAlreadyInstalledMessage(pgExtension))
      } else {
        throw error
      }
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async installExtension(
    addonName: string,
    pgExtension: string,
    authorization: OAuthAuthorization,
    recursive: boolean): Promise<PgExtensionDetails[]> {
    try {
      const response: HTTP<{pgExtensionSchema: string, pgExtensionVersion: string}> = await HTTP.post(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions`),
        {
          headers: {Authorization: getBorealisPgAuthHeader(authorization)},
          body: {pgExtensionName: pgExtension},
        })

      return [
        {
          extension: pgExtension,
          schema: response.body.pgExtensionSchema,
          version: response.body.pgExtensionVersion,
        },
      ]
    } catch (error) {
      if (error instanceof HTTPError &&
        error.statusCode === 400 &&
        error.body.dependencies &&
        recursive) {
        // The extension has unsatisfied dependencies
        return this.recursiveInstallation(
          addonName,
          pgExtension,
          authorization,
          error.body.dependencies)
      } else {
        throw error
      }
    }
  }

  private async recursiveInstallation(
    addonName: string,
    pgExtension: string,
    authorization: OAuthAuthorization,
    dependencies: string[]): Promise<PgExtensionDetails[]> {
    const dependencyResults = await Promise.all(dependencies.map(
      async (dependency: string) => {
        try {
          return await this.installExtension(addonName, dependency, authorization, true)
        } catch (error) {
          if (error instanceof HTTPError && error.statusCode === 409) {
            // This particular dependency is already installed
            return []
          } else {
            throw error
          }
        }
      }))

    // Retry now that the dependencies are installed
    try {
      const retryResults = await this.installExtension(addonName, pgExtension, authorization, false)

      return [...retryResults, ...dependencyResults.flat()]
    } catch (error) {
      throw new Error(`Unexpected error during installation: ${error}`)
    }
  }

  async catch(err: any) {
    const {args} = await this.parse(InstallPgExtensionsCommand)
    const pgExtension = args[pgExtensionArgName]

    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        if (err.body.dependencies) {
          const dependencies: string[] = err.body.dependencies
          const dependenciesString =
            dependencies.map(dependency => pgExtensionColour(dependency)).join(', ')
          this.error(
            `Extension ${pgExtensionColour(pgExtension)} has one or more unsatisfied ` +
            `dependencies. All of its dependencies (${dependenciesString}) must be installed.\n` +
            `Run this command again with the ${formatCliOptionName(recursiveOptionName)} option ` +
            'to automatically and recursively install the extension and the missing extension(s) ' +
            'it depends on.')
        } else {
          this.error(`${pgExtensionColour(pgExtension)} is not a supported Postgres extension`)
        }
      } else if (err.statusCode === 404) {
        this.error('Add-on is not a Borealis Isolated Postgres add-on')
      } else if (err.statusCode === 409) {
        this.error(getAlreadyInstalledMessage(pgExtension))
      } else if (err.statusCode === 422) {
        this.error('Add-on is not finished provisioning')
      } else if (err.statusCode === 423) {
        this.error('Add-on is undergoing a PostgreSQL major version upgrade')
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}

function getAlreadyInstalledMessage(pgExtension: string): string {
  return `Extension ${pgExtensionColour(pgExtension)} is already installed or there is a schema ` +
    'name conflict with an existing database schema'
}

interface PgExtensionDetails {
  extension: string;
  schema: string;
  version: string;
}
