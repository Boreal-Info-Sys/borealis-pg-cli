import childProcess, {SpawnOptions} from 'child_process'
import {createServer, Server, Socket} from 'net'
import {Client as PgClient, ClientConfig as PgClientConfig} from 'pg'
import {Client as SshClient, ServerHostKeyAlgorithm} from 'ssh2'
import {defaultPorts, formatCliOptionName, portOptionName} from './command-components'

const addressInUseErrorCode = 'EADDRINUSE'
const permissionDeniedErrorCode = 'EACCES'

/**
 * The services to be used when tunneling to an add-on database
 *
 * Since oclif doesn't support dependency injection for commands, this is the next best thing.
 */
export const tunnelServices = {
  childProcessFactory: {
    spawn: (command: string, options: SpawnOptions) => childProcess.spawn(command, options),
  },
  nodeProcess: process,
  pgClientFactory: {create: (config: PgClientConfig) => new PgClient(config)},
  sshClientFactory: {create: () => new SshClient()},
  tcpServerFactory: {
    create: (connectionListener: (socket: Socket) => void) => createServer(connectionListener),
  },
}

/**
 * Establishes an SSH tunnel for an add-on Postgres database
 *
 * @param connInfo The connection info
 * @param logger Logging methods
 * @param readyListener The callback to execute when the tunnel is established
 *
 * @returns The SSH client
 */
export function openSshTunnel(
  connInfo: FullConnectionInfo,
  logger: Logger,
  readyListener: (sshClient: SshClient) => void): SshClient {
  const sshClient = tunnelServices.sshClientFactory.create()

  initProxyServer(sshClient, connInfo, logger)

  return initSshClient(sshClient, connInfo, logger, () => readyListener(sshClient))
}

function initProxyServer(
  sshClient: SshClient,
  connInfo: FullConnectionInfo,
  logger: Logger): Server {
  return tunnelServices.tcpServerFactory.create(tcpSocket => {
    tcpSocket.on('end', () => {
      logger.debug(`Ended session on port ${tcpSocket.remotePort}`)
    }).on('error', (socketErr: any) => {
      if (socketErr.code === 'ECONNRESET') {
        logger.debug(`Server connection reset on port ${tcpSocket.remotePort}: ${socketErr}`)
        tcpSocket.destroy()
      } else {
        logger.error(socketErr)
      }
    })

    sshClient.forwardOut(
      connInfo.localPgHost,
      connInfo.localPgPort,
      connInfo.db.dbHost,
      connInfo.db.dbPort ?? defaultPorts.pg,
      (sshErr, sshStream) => {
        if (sshErr) {
          logger.error(sshErr)
        }

        logger.debug(`Started session on port ${tcpSocket.remotePort}`)

        tcpSocket.pipe(sshStream)
        sshStream.pipe(tcpSocket)
      })
  }).on('error', (err: any) => {
    if (err.code === addressInUseErrorCode || err.code === permissionDeniedErrorCode) {
      logger.debug(err)

      const reason = (err.code === addressInUseErrorCode) ? 'port in use' : 'permission denied'

      // Do not let the error function exit or it will generate an ugly stack trace
      logger.error(
        `Local port ${connInfo.localPgPort} is not available to listen on (${reason}). ` +
        `Specify a different port number with the ${formatCliOptionName(portOptionName)} option.`,
        {exit: false})

      tunnelServices.nodeProcess.exit(1)
    } else {
      logger.error(err)
    }
  }).listen(connInfo.localPgPort, connInfo.localPgHost)
}

function initSshClient(
  sshClient: SshClient,
  connInfo: {ssh: SshConnectionInfo; db: DbConnectionInfo; localPgPort: number},
  logger: Logger,
  onReady: () => void): SshClient {
  const [expectedPublicSshHostKeyFormat, expectedPublicSshHostKey] =
    connInfo.ssh.publicSshHostKey.split(' ')

  sshClient.on('ready', onReady)
    .connect({
      host: connInfo.ssh.sshHost,
      port: connInfo.ssh.sshPort ?? defaultPorts.ssh,
      username: connInfo.ssh.sshUsername,
      privateKey: connInfo.ssh.sshPrivateKey,
      algorithms: {serverHostKey: [expectedPublicSshHostKeyFormat as ServerHostKeyAlgorithm]},
      hostVerifier: (keyHash: any) => {
        const keyHashStr =
          (keyHash instanceof Buffer) ? keyHash.toString('base64') : keyHash.toString()

        logger.debug(`Actual SSH host key: ${keyHashStr}`)
        logger.debug(`Expected SSH host key: ${expectedPublicSshHostKey}`)

        return keyHashStr === expectedPublicSshHostKey
      },
    })

  return sshClient
}

export interface SshConnectionInfo {
  sshHost: string;
  sshPort?: number;
  sshUsername: string;
  sshPrivateKey: string;
  publicSshHostKey: string;
}

export interface DbConnectionInfo {
  dbHost: string;
  dbPort?: number;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
}

export interface FullConnectionInfo {
  db: DbConnectionInfo;
  ssh: SshConnectionInfo;
  localPgHost: string;
  localPgPort: number;
}

interface Logger {
  debug: (...args: any[]) => void;
  info: (message?: string | undefined, ...args: any[]) => void;
  warn: (input: string | Error) => void;
  error: (input: string | Error, options?: {[name: string]: any}) => never | void;
}
