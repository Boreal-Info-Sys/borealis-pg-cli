import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {Client as SshClient} from 'ssh2'
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

const keyboardKeyColour = color.italic
const connKeyColour = consoleColours.dataFieldName
const connValueColour = consoleColours.dataFieldValue

export default class TunnelCommand extends Command {
  static description = `establishes a secure tunnel to a Borealis Isolated Postgres add-on

This operation allows for a secure, temporary session connection to an add-on
Postgres database that is, by design, otherwise inaccessible from outside of
its virtual private cloud. Once a tunnel is established, use a tool such as
psql or pgAdmin and the provided user credentials to interact with the add-on
database.

The credentials that will be provided belong to a database user role that is
specifically tied to the current Heroku user account. By default the user role
allows read-only access to the add-on database; to enable read and write
access, supply the ${formatCliOptionName(writeAccessOptionName)} option.

Note that any tables, indexes, views or other objects that are created when
connected as a personal user role will be owned by that user role rather than
the application database user role unless ownership is explicitly reassigned
afterward (for example, by using the REASSIGN OWNED command).

See also the ${consoleColours.cliCmdName('borealis-pg:run')} command to execute a noninteractive script or the
${consoleColours.cliCmdName('borealis-pg:psql')} command to launch an interactive psql session directly.`

  static examples = [
    `$ heroku borealis-pg:tunnel --${appOptionName} sushi --${portOptionName} 54321`,
    `$ heroku borealis-pg:tunnel --${appOptionName} sushi --${addonOptionName} BOREALIS_PG_MAROON`,
    `$ heroku borealis-pg:tunnel --${addonOptionName} borealis-pg-hex-12345 --${writeAccessOptionName}`,
  ]

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [portOptionName]: cliOptions.port,
    [writeAccessOptionName]: cliOptions.writeAccess,
  }

  async run() {
    const {flags} = await this.parse(TunnelCommand)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    const [sshConnInfo, dbConnInfo] =
      await this.createPersonalUsers(addonName, flags[writeAccessOptionName])

    const localPgHost = await getLocalPgHost()

    const sshClient = this.connect({
      ssh: sshConnInfo,
      db: dbConnInfo,
      localPgHost,
      localPgPort: flags.port,
    })

    tunnelServices.nodeProcess.on('SIGINT', _ => {
      sshClient.end()
      tunnelServices.nodeProcess.exit(0)
    })
  }

  private async createPersonalUsers(
    addonName: string,
    enableWriteAccess: boolean): Promise<[SshConnectionInfo, DbConnectionInfo]> {
    const authorization = await createHerokuAuth(this.heroku)
    const accessLevelName = enableWriteAccess ? 'read/write' : 'read-only'
    try {
      const [sshConnInfoResult, dbConnInfoResult] = await applyActionSpinner(
        `Configuring ${accessLevelName} user session for add-on ${color.addon(addonName)}`,
        Promise.allSettled([
          HTTP.post<SshConnectionInfo>(
            getBorealisPgApiUrl(`/heroku/resources/${addonName}/personal-ssh-users`),
            {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
          HTTP.post<DbConnectionInfo>(
            getBorealisPgApiUrl(`/heroku/resources/${addonName}/personal-db-users`),
            {
              headers: {Authorization: getBorealisPgAuthHeader(authorization)},
              body: {enableWriteAccess},
            }),
        ]),
      )

      if (sshConnInfoResult.status === 'rejected') {
        throw sshConnInfoResult.reason
      } else if (dbConnInfoResult.status === 'rejected') {
        throw dbConnInfoResult.reason
      }

      return [sshConnInfoResult.value.body, dbConnInfoResult.value.body]
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private connect(connInfo: FullConnectionInfo): SshClient {
    const {db, localPgHost, localPgPort} = connInfo
    const dbUrl =
      `postgres://${db.dbUsername}:${db.dbPassword}@${localPgHost}:${localPgPort}/${db.dbName}`

    return openSshTunnel(
      connInfo,
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      _ => {
        this.log()
        this.log(
          'Secure tunnel established. Use the following values to connect to the database:')

        this.log(`      ${connKeyColour('Username')}: ${connValueColour(db.dbUsername)}`)
        this.log(`      ${connKeyColour('Password')}: ${connValueColour(db.dbPassword)}`)
        this.log(`          ${connKeyColour('Host')}: ${connValueColour(localPgHost)}`)
        this.log(`          ${connKeyColour('Port')}: ${connValueColour(localPgPort.toString())}`)
        this.log(` ${connKeyColour('Database name')}: ${connValueColour(db.dbName)}`)
        this.log(`           ${connKeyColour('URL')}: ${connValueColour(dbUrl)}`)

        this.log(`
This process does not accept any keyboard input and will continue to run
indefinitely. To interact with the database via a command line tool (e.g. psql)
while the tunnel remains open, start and use a new terminal session. No extra
steps are required to use a graphical user interface (e.g. pgAdmin).`)

        this.log()
        this.log(
          `Press ${keyboardKeyColour('Ctrl')}+${keyboardKeyColour('C')} ` +
          'to close the tunnel and exit')
      },
    )
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 403) {
        this.error(
          'Access to the add-on database has been temporarily revoked for personal users. ' +
          'Generally this indicates the database has persistently exceeded its storage limit. ' +
          'Try upgrading to a new add-on plan to restore access.')
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
