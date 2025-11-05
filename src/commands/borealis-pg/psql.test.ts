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
import {tunnelServices} from '../../ssh-tunneling'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../test-utils'

const localPgHostname = 'pg-tunnel.borealis-data.com'
const defaultSshPort = 22
const defaultPgPort = 5432
const customPgPort = 65_432
const defaulPsqlPath = 'psql'
const customPsqlPath = 'bin/run'  // This is a real file path

const fakeAddonId = '0d6058d6-8ac1-4938-825c-f6ceae650093'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = '302aa43f-4b86-4c58-803f-553e607bc96d'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = '0b4541be-218b-4827-8346-b83227f354ab'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeSshHost = 'my-fake-ssh-hostname'
const fakeSshUsername = 'ssh-test-user'
const fakeSshPrivateKey = 'my-fake-ssh-private-key'
const fakePgWriterHost = 'my-fake-pg-writer-hostname'
const fakePgReaderHost = 'my-fake-pg-reader-hostname'
const fakePgPersonalUsername = 'personal_db_test_user'
const fakePgPersonalPassword = 'my-fake-personal-db-password'
const fakePgDbName = 'fake_db'

const expectedSshHostKeyFormat = 'ssh-ed25519'
const expectedSshHostKey = 'AAAAC3NzaC1lZDI1NTE5AAAAIKkk9uh8+g/gKlLlbi4sVv4VJkiaLjYOJj+wVVyTGzhI'
const expectedSshHostKeyEntry = `${expectedSshHostKeyFormat} ${expectedSshHostKey}`

const baseTestContext = test.stdout()
  .stderr()
  .nock(herokuApiBaseUrl, api => api
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
        id: '1c86ab21-8ec6-4f39-9d8a-835100125d69',
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
    ]))

const readOnlyTestContext = getPersonalUserTestContext(false)
const readWriteTestContext = getPersonalUserTestContext(true)

describe('interactive psql command', () => {
  let originalChildProcessFactory: typeof tunnelServices.childProcessFactory
  let originalNodeProcess: typeof tunnelServices.nodeProcess
  let originalSshClientFactory: typeof tunnelServices.sshClientFactory
  let originalTcpServerFactory: typeof tunnelServices.tcpServerFactory

  let mockChildProcessFactoryType: typeof tunnelServices.childProcessFactory
  let mockChildProcessType: ChildProcess

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
    originalChildProcessFactory = tunnelServices.childProcessFactory
    originalNodeProcess = tunnelServices.nodeProcess
    originalSshClientFactory = tunnelServices.sshClientFactory
    originalTcpServerFactory = tunnelServices.tcpServerFactory

    mockChildProcessType = mock()
    const mockChildProcessInstance = instance(mockChildProcessType)
    when(mockChildProcessType.on(anyString(), anyFunction())).thenReturn(mockChildProcessInstance)

    mockChildProcessFactoryType = mock()
    when(mockChildProcessFactoryType.spawn(anyString(), anything()))
      .thenReturn(mockChildProcessInstance)
    tunnelServices.childProcessFactory = instance(mockChildProcessFactoryType)

    mockNodeProcessType = mock()
    const mockNodeProcessInstance = instance(mockNodeProcessType)
    mockNodeProcessInstance.env = {FOO_EXAMPLE: 'BAR'}
    tunnelServices.nodeProcess = mockNodeProcessInstance

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
  })

  afterEach(() => {
    tunnelServices.childProcessFactory = originalChildProcessFactory
    tunnelServices.nodeProcess = originalNodeProcess
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory
  })

  readOnlyTestContext.command(['borealis-pg:psql', '--app', fakeHerokuAppName])
    .it('starts the proxy server', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).once()
      verify(mockTcpServerType.on(anyString(), anyFunction())).once()
      verify(mockTcpServerType.on('error', anyFunction())).once()
      verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
      verify(mockTcpServerType.listen(defaultPgPort, localPgHostname)).once()
    })

  readOnlyTestContext.command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('connects to the SSH server', () => {
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
      expect(hostVerifier(expectedSshHostKey)).to.be.true
      expect(hostVerifier('no good!')).to.be.false
    })

  readOnlyTestContext.command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('starts a psql session and ends with an exit code', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()

      // Check what happens when the child process ends with a nonzero exit code
      const fakeExitCode = 14

      verify(mockChildProcessType.on(anyString(), anyFunction())).once()

      const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
      expect(childProcEvent).to.equal('exit')

      const childProcExitListener: (code: number | null, _: any) => void = childProcListener

      childProcExitListener(fakeExitCode, null)

      verify(mockSshClientType.end()).once()
      verify(mockNodeProcessType.exit(fakeExitCode))
    })

  readOnlyTestContext.command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('starts a psql session and ends without an exit code', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()

      // Check what happens when the child process ends without an exit code
      verify(mockChildProcessType.on(anyString(), anyFunction())).once()

      const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
      expect(childProcEvent).to.equal('exit')

      const childProcExitListener: (code: number | null, _: any) => void = childProcListener

      childProcExitListener(null, null)

      verify(mockSshClientType.end()).once()
      verify(mockNodeProcessType.exit())
    })

  readWriteTestContext.command(['borealis-pg:psql', '--app', fakeHerokuAppName, '--write-access'])
    .it('starts a psql session with DB write access', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '--app', fakeHerokuAppName, '--port', customPgPort.toString()])
    .it('starts a psql session with a custom Postgres port', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: customPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '--app', fakeHerokuAppName, '--binary-path', customPsqlPath])
    .it('starts a psql session with a custom psql path', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        customPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()
    })

  readOnlyTestContext.command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('starts SSH port forwarding for a read-only user', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgReaderHost,
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

  readWriteTestContext.command(['borealis-pg:psql', '-a', fakeHerokuAppName, '-w'])
    .it('starts SSH port forwarding for a read/write user', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgWriterHost,
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

  readOnlyTestContext.command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('does not end the process when the user presses Ctrl+C', () => {
      verify(mockNodeProcessType.on(anyString(), anyFunction())).once()
      verify(mockNodeProcessType.on('SIGINT', anyFunction())).once()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, processListener] = capture(mockNodeProcessType.on).last()
      const sigintListener = (processListener as unknown) as NodeJS.SignalsListener
      sigintListener('SIGINT')

      verify(mockSshClientType.end()).never()
      verify(mockNodeProcessType.exit()).never()
      verify(mockNodeProcessType.exit(anyNumber())).never()
    })

  test.stdout()
    .stderr()
    .command(
      ['borealis-pg:psql', '--app', fakeHerokuAppName, '--binary-path', '/this/is/not/a/real/file'])
    .catch('The file "/this/is/not/a/real/file" does not exist')
    .it('rejects a custom psql path that does not exist', _ => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:psql', '--app', fakeHerokuAppName, '--port', 'port-must-be-an-integer'])
    .catch(/.*Expected an integer but received: port-must-be-an-integer.*/)
    .it('rejects a custom port that is not an integer', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName, '-p', '0'])
    .catch(/.*Expected an integer greater than or equal to 1 but received: 0.*/)
    .it('rejects a custom port that is less than 1', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName, '-p', '65536'])
    .catch(/.*Expected an integer less than or equal to 65535 but received: 65536.*/)
    .it('rejects a custom port that is greater than 65535', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  readOnlyTestContext
    .do(() => when(mockSshClientFactoryType.create()).thenThrow(new Error('An error')))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .catch('An error')
    .it('throws an unexpected SSH client error when encountered', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName, '-p', customPgPort.toString()])
    .it('handles a local port conflict', ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, listener] = capture(mockTcpServerType.on).last()
      const errorListener = listener as ((err: unknown) => void)

      errorListener({code: 'EADDRINUSE'})

      expect(ctx.stderr).to.contain(`Local port ${customPgPort} is not available`)
      verify(mockNodeProcessType.exit(1)).once()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('handles a generic proxy server error', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, listener] = capture(mockTcpServerType.on).last()
      const errorListener = listener as ((err: unknown) => void)

      const fakeError = new Error("This isn't a real error")
      try {
        errorListener(fakeError)

        expect.fail('The error listener call should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('handles an error when starting port forwarding', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
      assert(typeof portForwardListener !== 'undefined')

      const fakeError = new Error('Just testing!')
      try {
        portForwardListener(fakeError, mockSshStreamInstance)

        expect.fail('The port forward listener call should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }

      verify(mockTcpSocketType.pipe(mockSshStreamInstance)).never()
      verify(mockSshStreamType.pipe(mockTcpSocketInstance)).never()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .it('handles an unexpected TCP socket error', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      const expectedCallCount = 2
      verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
      const socketListener = getTcpSocketListener('error', expectedCallCount)

      const fakeError = new Error('Foobarbaz')
      try {
        socketListener(fakeError)

        expect.fail('The socket error listener should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }

      verify(mockTcpSocketType.destroy()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(404, {reason: 'Add-on does not exist for this personal SSH user'})
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(
          200,
          {
            dbHost: fakePgReaderHost,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error if the add-on was not found', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(422, {reason: 'Add-on is not ready for a personal SSH user yet'})
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(
          201,
          {
            dbHost: fakePgReaderHost,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error if the add-on is still provisioning', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshPort: defaultSshPort,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          })
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(423, {reason: 'Locked'}))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .catch(/^Add-on is undergoing a PostgreSQL major version upgrade/)
    .it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(503, {reason: 'Server error!'})
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(
          200,
          {
            dbHost: fakePgReaderHost,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .catch(/^Add-on service is temporarily unavailable/)
    .it('exits with an error when there is an API error while creating the SSH user', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(403, {reason: 'DB write access revoked'})
        .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          }))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .catch(/^Access to the add-on database has been temporarily revoked for personal users/)
    .it('exits with an error when DB write access is revoked', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`, {enableWriteAccess: false})
        .reply(503, {reason: 'Server error!'})
        .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          }))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error while creating a personal DB user', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
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

  function executeSshClientListener(): void {
    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    const [sshClientEvent, listener] = capture(mockSshClientType.on).last()

    expect(sshClientEvent).to.equal('ready')

    const sshClientListener = (listener as unknown) as (() => void)
    sshClientListener()
  }
})

function getPersonalUserTestContext(enableWriteAccess: boolean) {
  return baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshPort: defaultSshPort,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          })
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`, {enableWriteAccess})
        .reply(
          200,
          {
            dbHost: enableWriteAccess ? fakePgWriterHost : fakePgReaderHost,
            dbPort: customPgPort,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
}
