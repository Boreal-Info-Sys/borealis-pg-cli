import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import fs from 'fs'
import {applyActionSpinner} from '../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliOptions,
  consoleColours,
  formatCliOptionName,
  getLocalPgHost,
  portOptionName,
  processAddonAttachmentInfo,
  writeAccessOptionName,
} from '../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../heroku-api'
import {
  DbConnectionInfo,
  FullConnectionInfo,
  openSshTunnel,
  SshConnectionInfo,
  tunnelServices,
} from '../../ssh-tunneling'

const binaryPathOptionName = 'binary-path'

export default class PsqlCommand extends Command {
  static description = `Run psql with a secure tunnel to a Borealis Isolated Postgres add-on

This operation establishes a temporary secure tunnel to an add-on database to
provide an interactive psql session. It requires that the psql command is
installed on the local machine; generally, psql is installed along with
PostgreSQL (https://www.postgresql.org/download/).

The psql session will be initiated as a database user role that is
specifically tied to the current Heroku user account. By default the user role
allows read-only access to the add-on database; to enable read and write
access, supply the ${formatCliOptionName(writeAccessOptionName)} option.

Note that any tables, indexes, views or other objects that are created when
connected as a personal user role will be owned by that user role rather than
the application database user role unless ownership is explicitly reassigned
afterward (for example, by using the REASSIGN OWNED command).

To override the path to the psql binary, supply the ${formatCliOptionName(binaryPathOptionName)} option.

See also the ${consoleColours.cliCmdName('borealis-pg:run')} command to execute a noninteractive script or the
${consoleColours.cliCmdName('borealis-pg:tunnel')} command to start a secure tunnel session that can be used
in combination with any PostgreSQL client (e.g. a graphical user interface like
pgAdmin).`

  static examples = [
    `$ heroku borealis-pg:psql --${appOptionName} sushi --${binaryPathOptionName} /path/to/psql`,
    `$ heroku borealis-pg:psql --${appOptionName} sushi --${addonOptionName} BOREALIS_PG_MAROON --${writeAccessOptionName}`,
    `$ heroku borealis-pg:psql --${addonOptionName} borealis-pg-hex-12345`,
  ]

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [binaryPathOptionName]: flags.string({
      char: 'b',
      description: 'custom path to a psql binary',
      required: false,
    }),
    [portOptionName]: cliOptions.port,
    [writeAccessOptionName]: cliOptions.writeAccess,
  }

  async run() {
    const {flags} = await this.parse(PsqlCommand)

    const customBinaryPath = flags[binaryPathOptionName]
    if (customBinaryPath && !fs.existsSync(customBinaryPath)) {
      this.error(`The file "${customBinaryPath}" does not exist`)
    }

    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const addonInfo = processAddonAttachmentInfo(attachmentInfo, this.error)

    const [sshConnInfo, dbConnInfo] = await this.prepareUsers(
      addonInfo,
      flags[writeAccessOptionName])

    const localPgHost = await getLocalPgHost()

    this.executePsql(
      {ssh: sshConnInfo, db: dbConnInfo, localPgHost, localPgPort: flags.port},
      customBinaryPath ?? 'psql')

    // Prevent Ctrl+C from ending the process
    tunnelServices.nodeProcess.on('SIGINT', _ => null)
  }

  private async prepareUsers(
    addonInfo: {addonName: string; appName: string; attachmentName: string},
    enableWriteAccess: boolean): Promise<[SshConnectionInfo, DbConnectionInfo]> {
    const authorization = await createHerokuAuth(this.heroku)
    try {
      const sshConnInfoPromise = HTTP
        .post<SshConnectionInfo>(
          getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-ssh-users`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})
        .then(value => value.body)
      const dbConnInfoPromise = HTTP
        .post<DbConnectionInfo>(
          getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-db-users`),
          {
            headers: {Authorization: getBorealisPgAuthHeader(authorization)},
            body: {enableWriteAccess},
          })
        .then(value => value.body)

      const fullConnInfoPromise = Promise.allSettled([sshConnInfoPromise, dbConnInfoPromise])

      const accessLevelName = enableWriteAccess ? 'read/write' : 'read-only'
      const [sshConnInfoResult, dbConnInfoResult] = await applyActionSpinner(
        `Configuring ${accessLevelName} user session for add-on ${color.addon(addonInfo.addonName)}`,
        fullConnInfoPromise,
      )

      if (sshConnInfoResult.status === 'rejected') {
        throw sshConnInfoResult.reason
      } else if (dbConnInfoResult.status === 'rejected') {
        throw dbConnInfoResult.reason
      }

      return [sshConnInfoResult.value, dbConnInfoResult.value]
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private executePsql(connInfo: FullConnectionInfo, psqlPath: string): void {
    openSshTunnel(
      connInfo,
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      sshClient => tunnelServices.childProcessFactory.spawn(psqlPath, {
        env: {
          ...tunnelServices.nodeProcess.env,
          PGHOST: connInfo.localPgHost,
          PGPORT: connInfo.localPgPort.toString(),
          PGDATABASE: connInfo.db.dbName,
          PGUSER: connInfo.db.dbUsername,
          PGPASSWORD: connInfo.db.dbPassword,
        },
        shell: true,
        stdio: 'inherit',
      }).on('exit', (code, _) => {
        sshClient.end()
        tunnelServices.nodeProcess.exit(code ?? undefined)
      }),
    )
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 403) {
        this.error(
          'Access to the add-on database has been temporarily revoked for personal users.\n' +
          'Generally this indicates the database has persistently exceeded its storage limit.\n' +
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
