import {captureOutput, runCommand} from '@oclif/test'
import assert from 'assert'
import {Server, Socket} from 'net'
import nock from 'nock'
import {Client as SshClient, ClientChannel} from 'ssh2'
import {
  anyFunction,
  anyNumber,
  anyString,
  anything,
  capture,
  instance,
  mock,
  verify,
  when,
} from 'ts-mockito'
import {tunnelServices} from '../../ssh-tunneling'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../test-utils'

const localPgHostname = 'pg-tunnel.borealis-data.com'
const defaultSshPort = 22
const customSshPort = 50_022
const defaultPgPort = 5432
const customPgPort = 54_321

const fakeAddonId = 'd43af828-9551-45bd-9c2a-2e29ce7ba94f'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = 'd95a93b0-8795-4e58-be14-efe18ece1d56'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = 'cbc0b280-7ddc-4a0d-b43a-aab916258675'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeSshHost = 'my-fake-ssh-hostname'
const fakeSshUsername = 'ssh-test-user'
const fakeSshPrivateKey = 'my-fake-ssh-private-key'
const fakePgHost = 'my-fake-pg-hostname'
const fakePgReadonlyUsername = 'ro_db_test_user'
const fakePgReadWriteUsername = 'rw_db_test_user'
const fakePgPassword = 'my-fake-db-password'
const fakePgDbName = 'fake_db'

const expectedSshHostKeyFormat = 'ssh-ed25519'
const expectedSshHostKey = 'AAAAC3NzaC1lZDI1NTE5AAAAIKkk9uh8+g/gKlLlbi4sVv4VJkiaLjYOJj+wVVyTGzhI'
const expectedSshHostKeyEntry = `${expectedSshHostKeyFormat} ${expectedSshHostKey}`

describe('secure tunnel command', () => {
  let originalNodeProcess: NodeJS.Process
  let originalTcpServerFactory: typeof tunnelServices.tcpServerFactory
  let originalSshClientFactory: typeof tunnelServices.sshClientFactory

  let mockNodeProcessType: NodeJS.Process

  let mockTcpServerFactoryType: typeof tunnelServices.tcpServerFactory
  let mockTcpServerType: Server

  let mockSshClientFactoryType: typeof tunnelServices.sshClientFactory
  let mockSshClientType: SshClient

  let mockTcpSocketType: Socket
  let mockTcpSocketInstance: Socket

  let mockSshStreamType: ClientChannel
  let mockSshStreamInstance: ClientChannel

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
    const mockSshClientInstance = instance(mockSshClientType)
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

    nock(herokuApiBaseUrl)
      .post('/oauth/authorizations', {
        description: 'Borealis PG CLI plugin temporary auth token',
        expires_in: 180,
        scope: ['read', 'identity'],
      })
      .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200)
      .get(`/apps/${fakeHerokuAppName}/addons`)
      .reply(200, [
        {
          addon_service: {name: 'other-addon-service'},
          id: '8f048ef1-aca8-4fb6-ae9d-fd9c075e865b',
          name: 'other-addon',
        },
        {addon_service: {name: 'borealis-pg'}, id: fakeAddonId, name: fakeAddonName},
      ])
      .get(`/addons/${fakeAddonId}/addon-attachments`)
      .reply(200, [
        {
          addon: {id: fakeAddonId, name: fakeAddonName},
          app: {id: fakeHerokuAppId, name: fakeHerokuAppName},
          id: fakeAttachmentId,
          name: fakeAttachmentName,
        },
      ])
  })

  afterEach(() => {
    tunnelServices.nodeProcess = originalNodeProcess
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory

    nock.cleanAll()
  })

  it('starts the proxy server', async () => {
    initDefaultRequestMocks()

    const {error} = await runCommand(['borealis-pg:tunnel', '--app', fakeHerokuAppName])

    expect(error).to.be.undefined

    verify(mockTcpServerFactoryType.create(anyFunction())).once()
    verify(mockTcpServerType.on(anyString(), anyFunction())).once()
    verify(mockTcpServerType.on('error', anyFunction())).once()
    verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
    verify(mockTcpServerType.listen(defaultPgPort, localPgHostname)).once()
  })

  it('connects to the SSH server', async () => {
    initDefaultRequestMocks()

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error).to.be.undefined

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
    const hostVerifier = connectConfig.hostVerifier as (keyHash: unknown) => boolean
    expect(hostVerifier(expectedSshHostKey)).to.be.true
    expect(hostVerifier('no good!')).to.be.false
  })

  it('outputs DB connection instructions without a DB port option', async () => {
    initDefaultRequestMocks()

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error).to.be.undefined

    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    const [event, listener] = capture(mockSshClientType.on).last()
    expect(event).to.equal('ready')

    const sshClientListener = listener as unknown as () => void

    const {stdout} = await captureOutput(async () => sshClientListener())

    expect(stdout).to.containIgnoreSpaces(`Username: ${fakePgReadonlyUsername}`)
    expect(stdout).to.containIgnoreSpaces(`Password: ${fakePgPassword}`)
    expect(stdout).to.containIgnoreSpaces(`Host: ${localPgHostname}`)
    expect(stdout).to.containIgnoreSpaces(`Port: ${defaultPgPort}`)
    expect(stdout).to.containIgnoreSpaces(`Database name: ${fakePgDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `URL: postgres://${fakePgReadonlyUsername}:${fakePgPassword}@${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
    )
    expect(stdout).to.containIgnoreCase('Ctrl+C')

    expect(nock.pendingMocks()).to.be.empty
  })

  it('outputs DB connection instructions for a custom DB port option', async () => {
    initDefaultRequestMocks()

    const {error} = await runCommand([
      'borealis-pg:tunnel',
      '-a',
      fakeHerokuAppName,
      '--port',
      '65535',
    ])

    expect(error).to.be.undefined

    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    const [event, listener] = capture(mockSshClientType.on).last()
    expect(event).to.equal('ready')

    const sshClientListener = listener as unknown as () => void

    const {stdout} = await captureOutput(async () => sshClientListener())

    expect(stdout).to.containIgnoreSpaces(`Username: ${fakePgReadonlyUsername}`)
    expect(stdout).to.containIgnoreSpaces(`Password: ${fakePgPassword}`)
    expect(stdout).to.containIgnoreSpaces(`Host: ${localPgHostname}`)
    expect(stdout).to.containIgnoreSpaces('Port: 65535')
    expect(stdout).to.containIgnoreSpaces(`Database name: ${fakePgDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `URL: postgres://${fakePgReadonlyUsername}:${fakePgPassword}@${localPgHostname}:65535/${fakePgDbName}`,
    )
    expect(stdout).to.containIgnoreCase('Ctrl+C')

    expect(nock.pendingMocks()).to.be.empty
  })

  it('configures the DB user with write access when requested', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(200, {
        sshHost: fakeSshHost,
        sshPort: defaultSshPort,
        sshUsername: fakeSshUsername,
        sshPrivateKey: fakeSshPrivateKey,
        publicSshHostKey: expectedSshHostKeyEntry,
      })
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(200, {
        dbHost: fakePgHost,
        dbPort: customPgPort,
        dbName: fakePgDbName,
        dbUsername: fakePgReadWriteUsername,
        dbPassword: fakePgPassword,
      })

    const {error} = await runCommand([
      'borealis-pg:tunnel',
      '-a',
      fakeHerokuAppName,
      '--write-access',
    ])

    expect(error).to.be.undefined

    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    const [event, listener] = capture(mockSshClientType.on).last()
    expect(event).to.equal('ready')

    const sshClientListener = listener as unknown as () => void

    const {stdout} = await captureOutput(async () => sshClientListener())

    expect(stdout).to.containIgnoreSpaces(`Username: ${fakePgReadWriteUsername}`)

    expect(nock.pendingMocks()).to.be.empty
  })

  it('starts SSH port forwarding', async () => {
    initDefaultRequestMocks()

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error).to.be.undefined

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    verify(
      mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgHost,
        customPgPort,
        anyFunction(),
      ),
    ).once()

    const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
    assert(typeof portForwardListener !== 'undefined')
    portForwardListener(undefined, mockSshStreamInstance)

    verify(mockTcpSocketType.pipe(mockSshStreamInstance)).once()
    verify(mockSshStreamType.pipe(mockTcpSocketInstance)).once()

    verify(mockTcpSocketType.on(anyString(), anyFunction())).twice()
    verify(mockTcpSocketType.on('end', anyFunction())).once()
    verify(mockTcpSocketType.on('error', anyFunction())).once()
  })

  it('exits gracefully when the user presses Ctrl+C', async () => {
    initDefaultRequestMocks()

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error).to.be.undefined

    verify(mockNodeProcessType.on(anyString(), anyFunction())).once()
    verify(mockNodeProcessType.on('SIGINT', anyFunction())).once()

    const [_, processListener] = capture(mockNodeProcessType.on).last()
    const sigintListener = processListener as unknown as NodeJS.SignalsListener
    sigintListener('SIGINT')

    verify(mockSshClientType.end()).once()
    verify(mockNodeProcessType.exit(0)).once()
  })

  it('rejects a --port value that is not an integer', async () => {
    const {error} = await runCommand([
      'borealis-pg:tunnel',
      '-a',
      fakeHerokuAppName,
      '--port',
      'not-an-integer',
    ])

    expect(error?.message).to.contain('Expected an integer but received: not-an-integer')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('rejects a --port value that is less than 1', async () => {
    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName, '-p', '0'])

    expect(error?.message).to.contain(
      'Expected an integer greater than or equal to 1 but received: 0',
    )

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('rejects a --port value that is greater than 65535', async () => {
    const {error} = await runCommand([
      'borealis-pg:tunnel',
      '-a',
      fakeHerokuAppName,
      '--port',
      '65536',
    ])

    expect(error?.message).to.contain(
      'Expected an integer less than or equal to 65535 but received: 65536',
    )

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('throws an unexpected SSH client error when it occurs', async () => {
    when(mockSshClientFactoryType.create()).thenThrow(new Error('An error'))

    initDefaultRequestMocks()

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error?.message).to.include('An error')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
  })

  it('handles a local port conflict', async () => {
    initDefaultRequestMocks()

    const {error: cmdError} = await runCommand([
      'borealis-pg:tunnel',
      '--app',
      fakeHerokuAppName,
      '-p',
      customPgPort.toString(),
    ])

    expect(cmdError).to.be.undefined

    const [_, listener] = capture(mockTcpServerType.on).last()
    const errorListener = listener as (err: unknown) => void

    const {stderr} = await captureOutput(async () => errorListener({code: 'EADDRINUSE'}))

    expect(stderr).to.contain(`Local port ${customPgPort} is not available`)
    verify(mockNodeProcessType.exit(1)).once()
  })

  it('handles a generic proxy server error', async () => {
    initDefaultRequestMocks()

    const {error: cmdError} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(cmdError).to.be.undefined

    const [_, listener] = capture(mockTcpServerType.on).last()
    const errorListener = listener as (err: unknown) => void

    const fakeError = new Error("This isn't a real error")

    const {error} = await captureOutput(async () => errorListener(fakeError))

    expect(error).to.equal(fakeError)
  })

  it('handles an error when starting port forwarding', async () => {
    initDefaultRequestMocks()

    const {error: cmdError} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(cmdError).to.be.undefined

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
    assert(typeof portForwardListener !== 'undefined')

    const fakeError = new Error('Just testing!')

    const {error} = await captureOutput(async () =>
      portForwardListener(fakeError, mockSshStreamInstance),
    )

    expect(error).to.equal(fakeError)

    verify(mockTcpSocketType.pipe(mockSshStreamInstance)).never()
    verify(mockSshStreamType.pipe(mockTcpSocketInstance)).never()
  })

  it('handles an unexpected TCP socket error', async () => {
    initDefaultRequestMocks()

    const {error: cmdError} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(cmdError).to.be.undefined

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    const expectedCallCount = 2
    verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
    const socketListener = getTcpSocketListener('error', expectedCallCount)

    const fakeError = new Error('Foobarbaz')

    const {error} = await captureOutput(async () => socketListener(fakeError))

    expect(error).to.equal(fakeError)

    verify(mockTcpSocketType.destroy()).never()
  })

  it('exits with an error if the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(404, {reason: 'Add-on does not exist for a personal DB user'})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(404, {reason: 'Add-on does not exist for a personal SSH user'})

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error if the add-on is still provisioning', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(422, {reason: 'Add-on is not ready for a personal DB user yet'})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(422, {reason: 'Add-on is not ready for a personal SSH user yet'})

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error?.message).to.contain('Add-on is not finished provisioning')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(423, {reason: 'Locked'})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(200, {
        sshHost: fakeSshHost,
        sshPort: defaultSshPort,
        sshUsername: fakeSshUsername,
        sshPrivateKey: fakeSshPrivateKey,
        publicSshHostKey: expectedSshHostKeyEntry,
      })

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error?.message).to.contain('Add-on is undergoing a PostgreSQL major version upgrade')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error when DB write access is revoked', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(403, {reason: 'DB write access revoked'})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(200, {
        sshHost: fakeSshHost,
        sshUsername: fakeSshUsername,
        sshPrivateKey: fakeSshPrivateKey,
        publicSshHostKey: expectedSshHostKeyEntry,
      })

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error?.message).to.contain(
      'Access to the add-on database has been temporarily revoked for personal users',
    )

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error when there is an API error while creating the DB user', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(503, {reason: 'Server error!'})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(200, {
        sshHost: fakeSshHost,
        sshUsername: fakeSshUsername,
        sshPrivateKey: fakeSshPrivateKey,
        publicSshHostKey: expectedSshHostKeyEntry,
      })

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error when there is an API error while creating the SSH user', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(200, {
        dbHost: fakePgHost,
        dbName: fakePgDbName,
        dbUsername: fakePgReadonlyUsername,
        dbPassword: fakePgPassword,
      })
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(503, {reason: 'Server error!'})

    const {error} = await runCommand(['borealis-pg:tunnel', '-a', fakeHerokuAppName])

    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  function getTcpSocketListener(
    expectedEventName: string,
    expectedCallCount: number,
  ): (...args: unknown[]) => void {
    for (let callIndex = 0; callIndex < expectedCallCount; callIndex++) {
      const [eventName, socketListener] = capture(mockTcpSocketType.on).byCallIndex(callIndex)
      if (eventName === expectedEventName) {
        return socketListener
      }
    }

    return expect.fail(`Could not find a TCP socket listener for the "${expectedEventName}" event`)
  }
})

function initDefaultRequestMocks() {
  nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
    .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
    .reply(200, {
      sshHost: fakeSshHost,
      sshPort: customSshPort,
      sshUsername: fakeSshUsername,
      sshPrivateKey: fakeSshPrivateKey,
      publicSshHostKey: expectedSshHostKeyEntry,
    })
    .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
    .reply(200, {
      dbHost: fakePgHost,
      dbPort: customPgPort,
      dbName: fakePgDbName,
      dbUsername: fakePgReadonlyUsername,
      dbPassword: fakePgPassword,
    })
}
