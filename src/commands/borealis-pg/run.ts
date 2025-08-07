import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {ConfigVars} from '@heroku-cli/schema'
import {ux} from '@oclif/core'
import {readFileSync} from 'fs'
import {QueryResult} from 'pg'
import {applyActionSpinner} from '../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliOptions,
  consoleColours,
  defaultPorts,
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

const defaultOutputFormat = 'table'
const dbCommandOptionName = 'db-cmd'
const dbCommandFileOptionName = 'db-cmd-file'
const outputFormatOptionName = 'format'
const personalUserOptionName = 'personal-user'
const shellCommandOptionName = 'shell-cmd'

const cliCmdColour = consoleColours.cliCmdName
const envVarColour = consoleColours.dataFieldName

export default class RunCommand extends Command {
  static description = `runs a command with a secure tunnel to a Borealis Isolated Postgres add-on

An add-on Postgres database is, by design, inaccessible from outside of its
virtual private cloud. As such, this operation establishes an ephemeral secure
tunnel to an add-on database to execute a provided noninteractive command, then
immediately closes the tunnel.

A command can take the form of a database command or a shell command. In either
case, it is executed using the Heroku application's dedicated database user
role by default, but it can be made to execute as a database user role that is
specifically tied to the current Heroku user account via the ${formatCliOptionName(personalUserOptionName)}
option instead. Note that any tables, indexes, views or other objects that are
created when connected as a personal user role will be owned by that user role
rather than the Heroku application user role unless ownership is explicitly
reassigned afterward (for example, by using the REASSIGN OWNED command).

Regardless of whether running as the Heroku application's database user role
or as a personal user role, the command will have read-only access to the
add-on database by default; to enable read and write access, supply the
${formatCliOptionName(writeAccessOptionName)} option.

Database commands are raw statements (e.g. SQL, PL/pgSQL) that are sent over
the secure tunnel to the add-on Postgres database to be executed verbatim, with
the results then written to the console on stdout.

Shell commands are useful for executing an application's database migration
scripts or other unattended database scripts. They are executed in a shell on
the local machine with the following environment variables automatically set to
allow scripts and applications that are launched by the command to connect over
the secure tunnel to the remote add-on Postgres database:
    - ${envVarColour('PGHOST')}
    - ${envVarColour('PGPORT')}
    - ${envVarColour('PGDATABASE')}
    - ${envVarColour('PGUSER')}
    - ${envVarColour('PGPASSWORD')}
    - ${envVarColour('DATABASE_URL')}

See also the ${cliCmdColour('borealis-pg:psql')} command to launch an interactive psql session or
the ${cliCmdColour('borealis-pg:tunnel')} command to start a secure tunnel session that can be
used in combination with any PostgreSQL client (e.g. a graphical user interface
like pgAdmin).`

  static examples = [
    `$ heroku borealis-pg:run --${appOptionName} sushi --${dbCommandOptionName} 'SELECT * FROM hello_greeting' --${outputFormatOptionName} csv`,
    `$ heroku borealis-pg:run --${appOptionName} sushi --${addonOptionName} BOREALIS_PG_MAROON --${dbCommandFileOptionName} ~/scripts/example.sql --${personalUserOptionName}`,
    `$ heroku borealis-pg:run --${addonOptionName} borealis-pg-hex-12345 --${shellCommandOptionName} './manage.py migrate' --${writeAccessOptionName}`,
  ]

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [dbCommandOptionName]: flags.string({
      char: 'd',
      description: 'database command to execute over the secure tunnel',
      exclusive: [dbCommandFileOptionName, shellCommandOptionName],
    }),
    [dbCommandFileOptionName]: flags.string({
      char: 'i',
      description: 'UTF-8 file containing database command(s) to execute over the secure tunnel',
      exclusive: [dbCommandOptionName, shellCommandOptionName],
    }),
    [outputFormatOptionName]: flags.string({
      char: 'f',
      default: defaultOutputFormat,
      description: 'output format for database command results',
      exclusive: [shellCommandOptionName],
      options: [defaultOutputFormat, 'csv', 'json', 'yaml'],
    }),
    [personalUserOptionName]: flags.boolean({
      char: 'u',
      description: 'run as a personal user rather than a user belonging to the Heroku application',
      default: false,
    }),
    [portOptionName]: cliOptions.port,
    [shellCommandOptionName]: flags.string({
      char: 'e',
      description: 'shell command to execute when the secure tunnel is established',
      exclusive: [dbCommandOptionName, dbCommandFileOptionName, outputFormatOptionName],
    }),
    [writeAccessOptionName]: cliOptions.writeAccess,
  }

  async run() {
    const {flags} = await this.parse(RunCommand)
    const shellCommand = flags[shellCommandOptionName]

    if (
      (typeof flags[dbCommandOptionName] === 'undefined') &&
      (typeof flags[dbCommandFileOptionName] === 'undefined') &&
      (typeof shellCommand === 'undefined')) {
      this.error(
        `Either ${formatCliOptionName(dbCommandOptionName)}, ` +
        `${formatCliOptionName(dbCommandFileOptionName)} or ` +
        `${formatCliOptionName(shellCommandOptionName)} must be specified`)
    }

    const dbCommand = this.getDbCommand(flags[dbCommandOptionName], flags[dbCommandFileOptionName])

    const normalizedOutputFormat =
      (flags.format === defaultOutputFormat) ? undefined : flags.format

    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const addonInfo = processAddonAttachmentInfo(attachmentInfo, this.error)

    const [sshConnInfo, dbConnInfo] = await this.prepareUsers(
      addonInfo,
      flags[personalUserOptionName],
      flags[writeAccessOptionName],
      typeof normalizedOutputFormat === 'undefined')

    const localPgHost = await getLocalPgHost()
    const fullConnInfo = {ssh: sshConnInfo, db: dbConnInfo, localPgHost, localPgPort: flags.port}

    if (dbCommand) {
      console.warn('Executing database command...')
      this.executeDbCommand(fullConnInfo, dbCommand, normalizedOutputFormat)
    } else {
      console.warn('Executing shell command...')
      this.executeShellCommand(fullConnInfo, shellCommand as string)
    }
  }

  private async prepareUsers(
    addonInfo: {addonName: string; appName: string; attachmentName: string},
    usePersonalUser: boolean,
    enableWriteAccess: boolean,
    showSpinner: boolean): Promise<[SshConnectionInfo, DbConnectionInfo]> {
    const authorization = await createHerokuAuth(this.heroku)
    try {
      const dbConnInfoPromise =
        !usePersonalUser ?
          this.fetchAppDbConnInfo(addonInfo.appName, addonInfo.attachmentName, enableWriteAccess) :
          HTTP
            .post<DbConnectionInfo>(
              getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-db-users`),
              {
                headers: {Authorization: getBorealisPgAuthHeader(authorization)},
                body: {enableWriteAccess},
              })
            .then(value => value.body)

      const fullConnInfoPromise = Promise.allSettled([
        HTTP
          .post<SshConnectionInfo>(
            getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-ssh-users`),
            {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})
          .then(value => value.body),
        dbConnInfoPromise,
      ])

      const accessLevelName = enableWriteAccess ? 'read/write' : 'read-only'
      const [sshConnInfoResult, dbConnInfoResult] =
        !showSpinner ?
          await fullConnInfoPromise :
          await applyActionSpinner(
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

  private async fetchAppDbConnInfo(
    appName: string,
    attachmentName: string,
    enableWriteAccess: boolean): Promise<DbConnectionInfo> {
    const newConnInfoConfigVarName = `${attachmentName}_TUNNEL_BPG_CONN_INFO`
    const obsoleteConnInfoConfigVarName = `${attachmentName}_SSH_TUNNEL_BPG_CONNECTION_INFO`

    const configVarsInfo = await this.heroku.get<ConfigVars>(`/apps/${appName}/config-vars`)
    const appConnInfoConfigVarName =
      configVarsInfo.body[newConnInfoConfigVarName] ?
        newConnInfoConfigVarName :
        obsoleteConnInfoConfigVarName
    const appConnInfo = configVarsInfo.body[appConnInfoConfigVarName]

    const dbHostVar = enableWriteAccess ? 'POSTGRES_WRITER_HOST' : 'POSTGRES_READER_HOST'
    const dbHostPattern = new RegExp(`${dbHostVar}:=([^|]+)`)
    const dbHostMatch = appConnInfo.match(dbHostPattern)

    const dbPortPattern = /POSTGRES_PORT:=(\d+)/
    const dbPortMatch = appConnInfo.match(dbPortPattern)
    const dbPort = dbPortMatch ? Number.parseInt(dbPortMatch[1], 10) : defaultPorts.pg

    const dbNamePattern = /POSTGRES_DB_NAME:=([^|]+)/
    const dbNameMatch = appConnInfo.match(dbNamePattern)

    const dbUsernameVar =
      enableWriteAccess ? 'POSTGRES_WRITER_USERNAME' : 'POSTGRES_READER_USERNAME'
    const dbUsernamePattern = new RegExp(`${dbUsernameVar}:=([^|]+)`)
    const dbUsernameMatch = appConnInfo.match(dbUsernamePattern)

    const dbPasswordVar =
      enableWriteAccess ? 'POSTGRES_WRITER_PASSWORD' : 'POSTGRES_READER_PASSWORD'
    const dbPasswordPattern = new RegExp(`${dbPasswordVar}:=([^|]+)`)
    const dbPasswordMatch = appConnInfo.match(dbPasswordPattern)

    if (dbHostMatch && dbNameMatch && dbUsernameMatch && dbPasswordMatch) {
      return {
        dbHost: dbHostMatch[1],
        dbPort,
        dbName: dbNameMatch[1],
        dbUsername: dbUsernameMatch[1],
        dbPassword: dbPasswordMatch[1],
      }
    } else {
      this.error(
        `The ${color.configVar(appConnInfoConfigVarName)} config variable value for ` +
        `${color.app(appName)} is invalid. ` +
        'This may indicate that the config variable was manually edited.')
    }
  }

  private executeDbCommand(
    connInfo: FullConnectionInfo,
    dbCommand: string,
    outputFormat?: string): void {
    openSshTunnel(
      connInfo,
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      sshClient => {
        const pgClient = tunnelServices.pgClientFactory.create({
          host: connInfo.localPgHost,
          port: connInfo.localPgPort,
          database: connInfo.db.dbName,
          user: connInfo.db.dbUsername,
          password: connInfo.db.dbPassword,
          ssl: {rejectUnauthorized: false},
        }).on('end', () => {
          sshClient.end()
          tunnelServices.nodeProcess.exit()
        }).on('error', (err: Error) => {
          // Do not let the error function exit or it will generate an ugly stack trace
          this.error(err, {exit: false})
          tunnelServices.nodeProcess.exit(1)
        })

        pgClient.connect()

        pgClient.query(
          dbCommand,
          (err: Error | null | undefined, results: QueryResult<any> | QueryResult<any>[]) => {
            if (err) {
              // Do not let the error function exit or it will generate an ugly stack trace
              this.error(err, {exit: false})
              tunnelServices.nodeProcess.exit(1)
            } else {
              // When multiple statements are executed, the query result will be an array
              const resultInstance = Array.isArray(results) ? results[results.length - 1] : results

              if (resultInstance.fields && resultInstance.fields.length > 0) {
                const columns = resultInstance.fields.reduce(
                  (accumulator: {[name: string]: any}, field) => {
                    accumulator[field.name] = {header: field.name}

                    return accumulator
                  },
                  {})

                ux.table(
                  resultInstance.rows,
                  columns,
                  {'no-truncate': true, output: outputFormat})
              }

              if (!outputFormat) {
                // Only show the row count for the default format (undefined aka "table")
                const rowSuffix = resultInstance.rowCount === 1 ? 'row' : 'rows'
                this.log()
                this.log(`(${resultInstance.rowCount ?? 0} ${rowSuffix})`)
              }

              pgClient.end()
            }
          })
      })
  }

  private executeShellCommand(connInfo: FullConnectionInfo, shellCommand: string): void {
    openSshTunnel(
      connInfo,
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      sshClient => {
        const commandProc = tunnelServices.childProcessFactory.spawn(shellCommand, {
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: connInfo.localPgHost,
            PGPORT: connInfo.localPgPort.toString(),
            PGDATABASE: connInfo.db.dbName,
            PGUSER: connInfo.db.dbUsername,
            PGPASSWORD: connInfo.db.dbPassword,
            DATABASE_URL:
              `postgres://${connInfo.db.dbUsername}:${connInfo.db.dbPassword}@` +
              `${connInfo.localPgHost}:${connInfo.localPgPort}/${connInfo.db.dbName}`,
          },
          shell: true,
          stdio: ['ignore', null, null], // Disable stdin but use the defaults for stdout and stderr
        }).on('exit', (code, _) => {
          sshClient.end()
          tunnelServices.nodeProcess.exit(code ?? undefined)
        })

        if (commandProc.stdout) {
          commandProc.stdout.on('data', data => this.log(data.toString()))
        }

        if (commandProc.stderr) {
          // Do not let the error function exit or it will generate an ugly stack trace
          commandProc.stderr.on('data', data => this.error(data.toString(), {exit: false}))
        }
      })
  }

  private getDbCommand(commandValue?: string, commandFileValue?: string): string | null {
    if (commandValue) {
      return commandValue
    } else if (commandFileValue) {
      try {
        return readFileSync(commandFileValue, {encoding: 'utf-8'})
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          this.error(`File not found: ${commandFileValue}`)
        } else /* istanbul ignore else */ if (error.code === 'EISDIR') {
          this.error(`${commandFileValue} is a directory`)
        } else if (error.code === 'EACCES') {
          this.error(`Permission denied for file ${commandFileValue}`)
        } else {
          throw error
        }
      }
    } else {
      return null
    }
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
