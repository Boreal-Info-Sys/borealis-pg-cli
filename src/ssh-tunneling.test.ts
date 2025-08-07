import assert from 'assert'
import {ChildProcess} from 'child_process'
import {Server, Socket} from 'net'
import {Client as SshClient, ClientChannel} from 'ssh2'
import {
  anyFunction,
  anyNumber,
  anyString,
  anything,
  capture,
  deepEqual,
  instance,
  mock,
  verify,
  when,
} from 'ts-mockito'
import {consoleColours} from './command-components'
import {openSshTunnel, tunnelServices} from './ssh-tunneling'
import {expect} from './test-utils'

const localPgHostname = 'pg-tunnel.borealis-data.com'
const defaultSshPort = 22
const customSshPort = 51_022
const defaultPgPort = 5432
const customPgPort = 55_432

const fakeSshHost = 'my-fake-ssh-hostname'
const fakeSshUsername = 'ssh-test-user'
const fakeSshPrivateKey = 'my-fake-ssh-private-key'
const fakePgHost = 'my-fake-pg-hostname'
const fakePgReadWriteUsername = 'rw_db_test_user'
const fakePgPassword = 'my-fake-db-password'
const fakePgDbName = 'fake_db'

const expectedSshHostKeyFormat = 'ssh-ed25519'
const expectedSshHostKey = 'AAAAC3NzaC1lZDI1NTE5AAAAIKkk9uh8+g/gKlLlbi4sVv4VJkiaLjYOJj+wVVyTGzhI'
const expectedSshHostKeyEntry = `${expectedSshHostKeyFormat} ${expectedSshHostKey}`

const fakeCompleteConnInfo = {
  db: {
    dbHost: fakePgHost,
    dbPort: customPgPort,
    dbName: fakePgDbName,
    dbUsername: fakePgReadWriteUsername,
    dbPassword: fakePgPassword,
  },
  ssh: {
    sshHost: fakeSshHost,
    sshPort: customSshPort,
    sshUsername: fakeSshUsername,
    sshPrivateKey: fakeSshPrivateKey,
    publicSshHostKey: expectedSshHostKeyEntry,
  },
  localPgHost: localPgHostname,
  localPgPort: customPgPort,
}

const fakeNoPortsConnInfo = {
  db: {
    dbHost: fakePgHost,
    dbName: fakePgDbName,
    dbUsername: fakePgReadWriteUsername,
    dbPassword: fakePgPassword,
  },
  ssh: {
    sshHost: fakeSshHost,
    sshUsername: fakeSshUsername,
    sshPrivateKey: fakeSshPrivateKey,
    publicSshHostKey: expectedSshHostKeyEntry,
  },
  localPgHost: localPgHostname,
  localPgPort: defaultPgPort,
}

describe('openSshTunnel', () => {
  let originalNodeProcess: NodeJS.Process
  let originalTcpServerFactory: typeof tunnelServices.tcpServerFactory
  let originalSshClientFactory: typeof tunnelServices.sshClientFactory

  let mockNodeProcessType: NodeJS.Process

  let mockTcpServerFactoryType: typeof tunnelServices.tcpServerFactory
  let mockTcpServerType: Server

  let mockSshClientFactoryType: typeof tunnelServices.sshClientFactory
  let mockSshClientType: SshClient
  let mockSshClientInstance: typeof mockSshClientType

  let mockTcpSocketType: Socket
  let mockTcpSocketInstance: typeof mockTcpSocketType

  let mockSshStreamType: ClientChannel
  let mockSshStreamInstance: typeof mockSshStreamType

  let mockLoggerType: {
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  }
  let mockLoggerInstance: typeof mockLoggerType

  let mockReadyListenerContainerType: {func: (sshClient: SshClient) => void}
  let mockReadyListenerContainerInstance: typeof mockReadyListenerContainerType

  beforeEach(() => {
    originalNodeProcess = tunnelServices.nodeProcess
    originalTcpServerFactory = tunnelServices.tcpServerFactory
    originalSshClientFactory = tunnelServices.sshClientFactory

    mockNodeProcessType = mock()
    tunnelServices.nodeProcess = instance(mockNodeProcessType)

    mockTcpServerType = mock(Server)
    const mockTcpServerInstance = instance(mockTcpServerType)
    when(mockTcpServerType.on(anyString(), anyFunction())).thenReturn(mockTcpServerInstance)
    when(mockTcpServerType.listen(anyNumber(), anyString())).thenReturn(mockTcpServerInstance)
    when(mockTcpServerType.close()).thenReturn(mockTcpServerInstance)

    mockTcpServerFactoryType = mock()
    when(mockTcpServerFactoryType.create(anyFunction())).thenReturn(mockTcpServerInstance)
    tunnelServices.tcpServerFactory = instance(mockTcpServerFactoryType)

    mockSshClientType = mock(SshClient)
    mockSshClientInstance = instance(mockSshClientType)
    when(mockSshClientType.on(anyString(), anyFunction())).thenReturn(mockSshClientInstance)

    mockSshClientFactoryType = mock()
    when(mockSshClientFactoryType.create()).thenReturn(mockSshClientInstance)
    tunnelServices.sshClientFactory = instance(mockSshClientFactoryType)

    mockTcpSocketType = mock(Socket)
    mockTcpSocketInstance = instance(mockTcpSocketType)
    when(mockTcpSocketType.on(anyString(), anyFunction())).thenReturn(mockTcpSocketInstance)
    when(mockTcpSocketType.pipe(anything())).thenReturn(mockTcpSocketInstance)

    mockSshStreamType = mock()
    mockSshStreamInstance = instance(mockSshStreamType)
    when(mockSshStreamType.on(anyString(), anyFunction())).thenReturn(mockSshStreamInstance)
    when(mockSshStreamType.pipe(anything())).thenReturn(mockSshStreamInstance)

    mockLoggerType = mock()
    // Throw an exception if the error function is called with only one argument
    when(mockLoggerType.error(anything())).thenThrow(new Error('Error logged'))
    mockLoggerInstance = instance(mockLoggerType)

    mockReadyListenerContainerType = mock()
    mockReadyListenerContainerInstance = instance(mockReadyListenerContainerType)
  })

  afterEach(() => {
    tunnelServices.nodeProcess = originalNodeProcess
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory
  })

  it('starts the proxy server', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    verify(mockTcpServerFactoryType.create(anyFunction())).once()
    verify(mockTcpServerType.on(anyString(), anyFunction())).once()
    verify(mockTcpServerType.on('error', anyFunction())).once()
    verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
    verify(mockTcpServerType.listen(customPgPort, localPgHostname)).once()
  })

  it('connects to the SSH server with an explicit SSH port in the connection info', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    verify(mockSshClientFactoryType.create()).once()
    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    verify(mockSshClientType.on('ready', anyFunction())).once()

    verify(mockSshClientType.connect(anything())).once()
    const [connectConfig] = capture(mockSshClientType.connect).last()
    expect(connectConfig.host).to.equal(fakeSshHost)
    expect(connectConfig.port).to.equal(customSshPort)
    expect(connectConfig.username).to.equal(fakeSshUsername)
    expect(connectConfig.privateKey).to.equal(fakeSshPrivateKey)
    expect(connectConfig.algorithms).to.deep.equal({serverHostKey: [expectedSshHostKeyFormat]})

    expect(connectConfig.hostVerifier).to.exist
    const hostVerifier = connectConfig.hostVerifier as ((keyHash: unknown) => boolean)
    expect(hostVerifier(expectedSshHostKey)).to.be.true
    expect(hostVerifier('no good!')).to.be.false
  })

  it('connects to the SSH server without an SSH port in the connection info', () => {
    openSshTunnel(fakeNoPortsConnInfo, mockLoggerInstance, _ => true)

    verify(mockSshClientFactoryType.create()).once()
    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    verify(mockSshClientType.on('ready', anyFunction())).once()

    verify(mockSshClientType.connect(anything())).once()
    const [connectConfig] = capture(mockSshClientType.connect).last()
    expect(connectConfig.host).to.equal(fakeSshHost)
    expect(connectConfig.port).to.equal(defaultSshPort)
    expect(connectConfig.username).to.equal(fakeSshUsername)
    expect(connectConfig.privateKey).to.equal(fakeSshPrivateKey)
    expect(connectConfig.algorithms).to.deep.equal({serverHostKey: [expectedSshHostKeyFormat]})

    expect(connectConfig.hostVerifier).to.exist
    const hostVerifier = connectConfig.hostVerifier as ((keyHash: unknown) => boolean)
    expect(hostVerifier(Buffer.from(expectedSshHostKey, 'base64'))).to.be.true
    expect(hostVerifier(Buffer.from('no good!', 'base64'))).to.be.false
  })

  it('attaches the ready listener', () => {
    const result = openSshTunnel(
      fakeNoPortsConnInfo,
      mockLoggerInstance,
      mockReadyListenerContainerInstance.func)

    expect(result).to.equal(mockSshClientInstance)

    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    const [event, listener] = capture(mockSshClientType.on).last()
    expect(event).to.equal('ready')

    const sshClientListener = (listener as unknown) as (() => void)
    sshClientListener()

    verify(mockReadyListenerContainerType.func(result)).once()
  })

  it('starts SSH port forwarding with an explicit DB port in the connection info', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    verify(mockSshClientType.forwardOut(
      localPgHostname,
      customPgPort,
      fakePgHost,
      customPgPort,
      anyFunction())).once()

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
    assert(typeof portForwardListener !== 'undefined')
    portForwardListener(undefined, mockSshStreamInstance)

    verify(mockTcpSocketType.pipe(mockSshStreamInstance)).once()
    verify(mockSshStreamType.pipe(mockTcpSocketInstance)).once()

    verify(mockTcpSocketType.on(anyString(), anyFunction())).twice()
    verify(mockTcpSocketType.on('end', anyFunction())).once()
    verify(mockTcpSocketType.on('error', anyFunction())).once()
  })

  it('starts SSH port forwarding without a DB port in the connection info', () => {
    openSshTunnel(fakeNoPortsConnInfo, mockLoggerInstance, _ => true)

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    verify(mockSshClientType.forwardOut(
      localPgHostname,
      defaultPgPort,
      fakePgHost,
      defaultPgPort,
      anyFunction())).once()

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
    assert(typeof portForwardListener !== 'undefined')
    portForwardListener(undefined, mockSshStreamInstance)

    verify(mockTcpSocketType.pipe(mockSshStreamInstance)).once()
    verify(mockSshStreamType.pipe(mockTcpSocketInstance)).once()

    verify(mockTcpSocketType.on(anyString(), anyFunction())).twice()
    verify(mockTcpSocketType.on('end', anyFunction())).once()
    verify(mockTcpSocketType.on('error', anyFunction())).once()
  })

  it('throws an unexpected SSH client error when it occurs', () => {
    when(mockSshClientFactoryType.create()).thenThrow(new Error('An error'))

    expect(() => openSshTunnel(fakeNoPortsConnInfo, mockLoggerInstance, _ => true)).to.throw

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
  })

  it('handles a local port conflict', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, listener] = capture(mockTcpServerType.on).last()
    const errorListener = listener as ((err: unknown) => void)

    errorListener({code: 'EADDRINUSE'})
    verify(
      mockLoggerType.error(
        `Local port ${fakeCompleteConnInfo.localPgPort} is not available to listen on (port in ` +
        `use). Specify a different port number with the ${consoleColours.cliOption('--port')} ` +
        'option.',
        deepEqual({exit: false})))
      .once()
    verify(mockNodeProcessType.exit(1)).once()
  })

  it('handles permission denied for port', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, listener] = capture(mockTcpServerType.on).last()
    const errorListener = listener as ((err: unknown) => void)

    errorListener({code: 'EACCES'})
    verify(
      mockLoggerType.error(
        `Local port ${fakeCompleteConnInfo.localPgPort} is not available to listen on ` +
        '(permission denied). Specify a different port number with the ' +
        `${consoleColours.cliOption('--port')} option.`,
        deepEqual({exit: false})))
      .once()
    verify(mockNodeProcessType.exit(1)).once()
  })

  it('handles a generic proxy server error', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, listener] = capture(mockTcpServerType.on).last()
    const errorListener = listener as ((err: unknown) => void)

    const fakeError = new Error("This isn't a real error")
    try {
      errorListener(fakeError)

      expect.fail('The error listener call should have thrown an error')
    } catch {
      verify(mockLoggerType.error(fakeError)).once()
    }
  })

  it('handles an error when starting port forwarding', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
    assert(typeof portForwardListener !== 'undefined')

    const fakeError = new Error('Just testing!')
    try {
      portForwardListener(fakeError, mockSshStreamInstance)

      expect.fail('The port forward listener call should have thrown an error')
    } catch {
      verify(mockLoggerType.error(fakeError)).once()
    }

    verify(mockTcpSocketType.pipe(anything())).never()
    verify(mockSshStreamType.pipe(anything())).never()
  })

  it('handles a server connection reset', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    const expectedCallCount = 2
    verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
    const socketListener = getTcpSocketListener('error', expectedCallCount)

    try {
      socketListener({code: 'ECONNRESET'})
    } catch {
      expect.fail('The socket error listener should not have thrown an error')
    }

    verify(mockTcpSocketType.destroy()).once()
  })

  it('handles an unexpected TCP socket error', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    const expectedCallCount = 2
    verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
    const socketListener = getTcpSocketListener('error', expectedCallCount)

    const fakeError = new Error('Foobarbaz')
    try {
      socketListener(fakeError)

      expect.fail('The socket error listener should have thrown an error')
    } catch {
      verify(mockLoggerType.error(fakeError)).once()
    }

    verify(mockTcpSocketType.destroy()).never()
  })

  it('handles a TCP socket being ended', () => {
    openSshTunnel(fakeCompleteConnInfo, mockLoggerInstance, _ => true)

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    const expectedCallCount = 2
    verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
    const socketListener = getTcpSocketListener('end', expectedCallCount)

    socketListener()

    verify(mockTcpSocketType.remotePort).once()
  })

  function getTcpSocketListener(
    expectedEventName: string,
    expectedCallCount: number): (...args: unknown[]) => void {
    for (let callIndex = 0; callIndex < expectedCallCount; callIndex++) {
      const [eventName, socketListener] = capture(mockTcpSocketType.on).byCallIndex(callIndex)
      if (eventName === expectedEventName) {
        return socketListener
      }
    }

    return expect.fail(`Could not find a TCP socket listener for the "${expectedEventName}" event`)
  }
})

describe('tunnel services', () => {
  it('should have a valid child process factory', () => {
    let result: ChildProcess | null = null
    try {
      result = tunnelServices.childProcessFactory.spawn('ls', {})

      expect(result.pid).to.be.greaterThanOrEqual(0)
    } finally {
      if (result) {
        result.kill()
      }
    }
  })

  it('should reference the global Node.js process', () => {
    expect(tunnelServices.nodeProcess).to.equal(process)
  })

  it('should have a valid Postgres client factory', () => {
    const fakeUsername = 'my-user'

    const result = tunnelServices.pgClientFactory.create({
      host: 'my-host',
      port: 58_209,
      database: 'my-db',
      user: fakeUsername,
      password: 'my-password',
    })

    expect(result.user).to.equal(fakeUsername)
  })

  it('should have a valid SSH client factory', () => {
    const result = tunnelServices.sshClientFactory.create()

    expect(result.listenerCount('ready')).to.equal(0)
    expect(result.listenerCount('end')).to.equal(0)
    expect(result.listenerCount('close')).to.equal(0)
    expect(result.listenerCount('error')).to.equal(0)
  })

  it('should have a valid TCP server factory', () => {
    const result = tunnelServices.tcpServerFactory.create(_ => true)

    expect(result.listening).to.be.false
  })
})
