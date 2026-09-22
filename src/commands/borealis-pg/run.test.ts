import {captureOutput, runCommand} from '@oclif/test'
import assert from 'assert'
import {ChildProcess} from 'child_process'
import {readFileSync} from 'fs'
import {Server, Socket} from 'net'
import nock from 'nock'
import path from 'path'
import {Client as PgClient} from 'pg'
import {Client as SshClient, ClientChannel} from 'ssh2'
import internal from 'stream'
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
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../test-utils'

const localPgHostname = 'pg-tunnel.borealis-data.com'
const defaultSshPort = 22
const customSshPort = 52_022
const defaultPgPort = 5432
const customPgPort = 65_432

const fakeAddonId = '67d17393-503c-41cb-9338-0ecb5b2c5d78'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = '53f715b7-af60-4afd-bac8-b8f6b74a3455'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = '12917629-4323-4b22-b9d1-872d0b3e7ebc'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeSshHost = 'my-fake-ssh-hostname'
const fakeSshUsername = 'ssh-test-user'
const fakeSshPrivateKey = 'my-fake-ssh-private-key'
const fakePgWriterHost = 'my-fake-pg-writer-hostname'
const fakePgReaderHost = 'my-fake-pg-reader-hostname'
const fakePgReadWriteAppUsername = 'app_rw_db_test_user'
const fakePgReadWriteAppPassword = 'my-fake-db-writer-password'
const fakePgReadonlyAppUsername = 'app_ro_db_test_user'
const fakePgReadonlyAppPassword = 'my-fake-db-reader-password'
const fakePgPersonalUsername = 'personal_db_test_user'
const fakePgPersonalPassword = 'my-fake-personal-db-password'
const fakePgDbName = 'fake_db'

const expectedSshHostKeyFormat = 'ssh-ed25519'
const expectedSshHostKey = 'AAAAC3NzaC1lZDI1NTE5AAAAIKkk9uh8+g/gKlLlbi4sVv4VJkiaLjYOJj+wVVyTGzhI'
const expectedSshHostKeyEntry = `${expectedSshHostKeyFormat} ${expectedSshHostKey}`

const fakeAppConfigVars: {[name: string]: string} = {FOO_BAR: 'baz'}
fakeAppConfigVars[`${fakeAttachmentName}_URL`] =
  `postgres://${fakePgReadWriteAppUsername}:${fakePgReadWriteAppPassword}@` +
  `${localPgHostname}:${customPgPort}/${fakePgDbName}`
fakeAppConfigVars[`${fakeAttachmentName}_READONLY_URL`] =
  `postgres://${fakePgReadonlyAppUsername}:${fakePgReadonlyAppPassword}@` +
  `${localPgHostname}:${customPgPort}/${fakePgDbName}`
fakeAppConfigVars[`${fakeAttachmentName}_TUNNEL_BPG_CONN_INFO`] =
  `POSTGRES_WRITER_HOST:=${fakePgWriterHost}|` +
  `POSTGRES_READER_HOST:=${fakePgReaderHost}|` +
  `POSTGRES_PORT:=${customPgPort}|` +
  `POSTGRES_DB_NAME:=${fakePgDbName}|` +
  `POSTGRES_WRITER_USERNAME:=${fakePgReadWriteAppUsername}|` +
  `POSTGRES_WRITER_PASSWORD:=${fakePgReadWriteAppPassword}|` +
  `POSTGRES_READER_USERNAME:=${fakePgReadonlyAppUsername}|` +
  `POSTGRES_READER_PASSWORD:=${fakePgReadonlyAppPassword}|` +
  'SSH_HOST:=this-ssh-hostname-should-be-ignored|' +
  'SSH_PORT:=10101|' +
  'SSH_PUBLIC_HOST_KEY:=this-ssh-host-key-should-be-ignored|' +
  'SSH_USERNAME:=this-ssh-username-should-be-ignored|' +
  'SSH_USER_PRIVATE_KEY:=this-ssh-private-key-should-be-ignored'

const fakeObsoleteAppConfigVars: {[name: string]: string} = {}
fakeObsoleteAppConfigVars[`${fakeAttachmentName}_URL`] =
  fakeAppConfigVars[`${fakeAttachmentName}_URL`]
fakeObsoleteAppConfigVars[`${fakeAttachmentName}_READONLY_URL`] =
  fakeAppConfigVars[`${fakeAttachmentName}_READONLY_URL`]
fakeObsoleteAppConfigVars[`${fakeAttachmentName}_SSH_TUNNEL_BPG_CONNECTION_INFO`] =
  fakeAppConfigVars[`${fakeAttachmentName}_TUNNEL_BPG_CONN_INFO`]

const fakeShellCommand = 'my-cool-shell-command'
const fakeDbCommand = 'my-cool-sql-command'

// The actual contents of this file don't matter because we're using mocks
const exampleFilePath = path.join(__dirname, '..', '..', '..', 'package.json')
const exampleFileContents = readExampleFile()

describe('noninteractive run command', () => {
  let originalChildProcessFactory: typeof tunnelServices.childProcessFactory
  let originalNodeProcess: typeof tunnelServices.nodeProcess
  let originalPgClientFactory: typeof tunnelServices.pgClientFactory
  let originalTcpServerFactory: typeof tunnelServices.tcpServerFactory
  let originalSshClientFactory: typeof tunnelServices.sshClientFactory

  let mockChildProcessFactoryType: typeof tunnelServices.childProcessFactory
  let mockChildProcessType: ChildProcess
  let mockChildProcessStdoutType: internal.Readable
  let mockChildProcessStderrType: internal.Readable

  let mockNodeProcessType: NodeJS.Process

  let mockPgClientFactoryType: typeof tunnelServices.pgClientFactory
  let mockPgClientType: PgClient

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
    originalPgClientFactory = tunnelServices.pgClientFactory
    originalTcpServerFactory = tunnelServices.tcpServerFactory
    originalSshClientFactory = tunnelServices.sshClientFactory

    mockChildProcessStdoutType = mock()
    mockChildProcessStderrType = mock()

    mockChildProcessType = mock()
    when(mockChildProcessType.stdout).thenReturn(instance(mockChildProcessStdoutType))
    when(mockChildProcessType.stderr).thenReturn(instance(mockChildProcessStderrType))
    const mockChildProcessInstance = instance(mockChildProcessType)
    when(mockChildProcessType.on(anyString(), anyFunction())).thenReturn(mockChildProcessInstance)

    mockChildProcessFactoryType = mock()
    when(mockChildProcessFactoryType.spawn(anyString(), anything()))
      .thenReturn(mockChildProcessInstance)
    tunnelServices.childProcessFactory = instance(mockChildProcessFactoryType)

    mockPgClientType = mock()
    const mockPgClientInstance = instance(mockPgClientType)
    when(mockPgClientType.on(anyString(), anyFunction())).thenReturn(mockPgClientInstance)

    mockPgClientFactoryType = mock()
    when(mockPgClientFactoryType.create(anything())).thenReturn(mockPgClientInstance)
    tunnelServices.pgClientFactory = instance(mockPgClientFactoryType)

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
          id: '11020644-6a62-4c5c-93a1-bcb6d9d1803a',
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
    tunnelServices.childProcessFactory = originalChildProcessFactory
    tunnelServices.nodeProcess = originalNodeProcess
    tunnelServices.pgClientFactory = originalPgClientFactory
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory

    nock.cleanAll()
  })

  it('starts the proxy server', async () => {
    initDefaultRequestMocks()

    await runCommand(
      ['borealis-pg:run', '--app', fakeHerokuAppName, '--shell-cmd', fakeShellCommand])

    verify(mockTcpServerFactoryType.create(anyFunction())).once()
    verify(mockTcpServerType.on(anyString(), anyFunction())).once()
    verify(mockTcpServerType.on('error', anyFunction())).once()
    verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
    verify(mockTcpServerType.listen(defaultPgPort, localPgHostname)).once()
  })

  it('connects to the SSH server', async () => {
    initDefaultRequestMocks()

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

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

  it('executes a shell command without a DB port option', async () => {
    initDefaultRequestMocks()

    await runCommand(
      ['borealis-pg:run', '--app', fakeHerokuAppName, '--shell-cmd', fakeShellCommand])

    executeSshClientListener()

    verify(mockChildProcessFactoryType.spawn(
      fakeShellCommand,
      deepEqual({
        env: {
          ...tunnelServices.nodeProcess.env,
          PGHOST: localPgHostname,
          PGPORT: defaultPgPort.toString(),
          PGDATABASE: fakePgDbName,
          PGUSER: fakePgReadonlyAppUsername,
          PGPASSWORD: fakePgReadonlyAppPassword,
          DATABASE_URL:
              `postgres://${fakePgReadonlyAppUsername}:${fakePgReadonlyAppPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
        },
        shell: true,
        stdio: ['ignore', null, null],
      }))).once()

    // Check that the child process's stdout is written to this process's stdout
    const fakeStdoutMessage = 'my-stdout-message'

    verify(mockChildProcessType.stdout).atLeast(1)
    verify(mockChildProcessStdoutType.on(anyString(), anyFunction())).once()

    const [childStdoutEvent, childStdoutListener] = capture(mockChildProcessStdoutType.on).last()
    expect(childStdoutEvent).to.equal('data')

    const {stdout} = await captureOutput(async () => childStdoutListener(fakeStdoutMessage))

    expect(stdout).to.endWith(`${fakeStdoutMessage}\n`)

    // Check that the child process's stderr is written to this process's stderr
    const fakeStderrMessage = 'my-stderr-message'

    verify(mockChildProcessType.stderr).atLeast(1)
    verify(mockChildProcessStderrType.on(anyString(), anyFunction())).once()

    const [childStderrEvent, childStderrListener] = capture(mockChildProcessStderrType.on).last()
    expect(childStderrEvent).to.equal('data')

    const {stderr} = await captureOutput(async () => childStderrListener(fakeStderrMessage))

    expect(stderr).to.endWith(`${fakeStderrMessage}\n`)

    // Check what happens when the child process ends with a non-zero exit code
    const fakeExitCode = 14

    verify(mockChildProcessType.on(anyString(), anyFunction())).once()

    const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
    expect(childProcEvent).to.equal('exit')

    const childProcExitListener: (code: number | null, _: any) => void = childProcListener

    childProcExitListener(fakeExitCode, null)

    verify(mockSshClientType.end()).once()
    verify(mockNodeProcessType.exit(fakeExitCode))

    expect(nock.pendingMocks()).to.be.empty
  })

  it('executes a shell command with a custom DB port option', async () => {
    initDefaultRequestMocks()

    await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-p', '2345', '-e', fakeShellCommand])

    executeSshClientListener()

    verify(mockChildProcessFactoryType.spawn(
      fakeShellCommand,
      deepEqual({
        env: {
          ...tunnelServices.nodeProcess.env,
          PGHOST: localPgHostname,
          PGPORT: '2345',
          PGDATABASE: fakePgDbName,
          PGUSER: fakePgReadonlyAppUsername,
          PGPASSWORD: fakePgReadonlyAppPassword,
          DATABASE_URL:
              `postgres://${fakePgReadonlyAppUsername}:${fakePgReadonlyAppPassword}@` +
              `${localPgHostname}:2345/${fakePgDbName}`,
        },
        shell: true,
        stdio: ['ignore', null, null],
      }))).once()

    verify(mockChildProcessStdoutType.on('data', anyFunction())).once()
    verify(mockChildProcessStderrType.on('data', anyFunction())).once()

    // Check what happens when the child process ends without an exit code
    verify(mockChildProcessType.on(anyString(), anyFunction())).once()

    const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
    expect(childProcEvent).to.equal('exit')

    const childProcExitListener: (code: number | null, _: any) => void = childProcListener

    childProcExitListener(null, null)

    verify(mockSshClientType.end()).once()
    verify(mockNodeProcessType.exit())

    expect(nock.pendingMocks()).to.be.empty
  })

  it('executes a shell command even when the child process has no stdout or stderr', async () => {
    initDefaultRequestMocks()

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    when(mockChildProcessType.stdout).thenReturn(null)
    when(mockChildProcessType.stderr).thenReturn(null)

    executeSshClientListener()

    verify(mockChildProcessFactoryType.spawn(fakeShellCommand, anything())).once()
    verify(mockChildProcessStdoutType.on(anyString(), anyFunction())).never()
    verify(mockChildProcessStderrType.on(anyString(), anyFunction())).never()

    expect(nock.pendingMocks()).to.be.empty
  })

  it('executes a database command with the default (table) format', async () => {
    const fakeInputDate = new Date(2026, 9, 22, 13, 15, 45, 928)

    initDefaultRequestMocks()

    const {stderr: cmdStderr} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '--db-cmd', fakeDbCommand])

    expect(cmdStderr).to.contain(
      `Configuring read-only user session for add-on ${fakeAddonName}... done`)

    executeSshClientListener()

    verify(mockPgClientFactoryType.create(deepEqual({
      host: localPgHostname,
      port: defaultPgPort,
      database: fakePgDbName,
      user: fakePgReadonlyAppUsername,
      password: fakePgReadonlyAppPassword,
      ssl: {rejectUnauthorized: false},
    }))).once()

    // Check the PG client event listeners
    verify(mockPgClientType.on(anyString(), anyFunction())).times(2)
    verify(mockPgClientType.on('end', anyFunction())).once()
    verify(mockPgClientType.on('error', anyFunction())).once()
    for (let pgClientListenerIndex = 0; pgClientListenerIndex < 2; pgClientListenerIndex++) {
      const [pgClientEvent, pgClientListener] =
          capture((a: any, b: any) => mockPgClientType.on(a, b)).byCallIndex(pgClientListenerIndex)

      if (pgClientEvent === 'end') {
        const pgClientEndListener: () => void = pgClientListener
        pgClientEndListener()

        verify(mockSshClientType.end()).once()
        verify(mockNodeProcessType.exit()).once()
      } else {
        const pgClientErrorListener: (err: Error) => void = pgClientListener
        const pgClientErrorMessage = 'my-pg-client-error'

        const {stderr} = await captureOutput(async () =>
          pgClientErrorListener(new Error(pgClientErrorMessage)))

        expect(stderr).to.contain(pgClientErrorMessage)
        verify(mockNodeProcessType.exit(1)).once()
      }
    }

    verify(mockPgClientType.connect()).once()

    // Check the query callback function
    const queryCallback = getQueryCallbackFn()

    const {stdout} = await captureOutput(async () => queryCallback(null, {
      command: 'SELECT',
      fields: [{name: 'id'}, {name: 'value1'}, {name: 'value2'}],
      oid: 32_304,
      rows: [
        {id: 10, value1: fakeInputDate, value2: 137.9},
        {id: 21, value1: 'test1', value2: null},
        {id: 33, value1: 'test2', value2: 'test3'},
      ],
      rowCount: 2,
    }))

    expect(stdout).to.containIgnoreSpaces(
      '| id | value1 | value2 |')
    expect(stdout).to.containIgnoreSpaces(
      `| 10 | ${fakeInputDate.toISOString()} | 137.9 |\n` +
      '| 21 | test1 | |\n' +
      '| 33 | test2 | test3 |\n')
    expect(stdout).to.contain('(2 rows)')

    verify(mockPgClientType.end()).once()
  })

  it('executes a database command with multiple result entries', async () => {
    initDefaultRequestMocks()

    const {stderr: cmdStderr} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-d', fakeDbCommand, '-f', 'table'])

    expect(cmdStderr).to.contain(
      `Configuring read-only user session for add-on ${fakeAddonName}... done`)

    const uniqueValue = 'feb88f0d-b630-4c8a-bff5-7167c06c2624'

    executeSshClientListener()

    const queryCallback = getQueryCallbackFn()

    const {stdout} = await captureOutput(async () => queryCallback(null, [
      {
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'value'}],
        oid: 32_304,
        rows: [{id: 21, value: 'test1'}, {id: 33, value: 'test2'}, {id: 0, value: uniqueValue}],
        rowCount: 3,
      },
      {
        command: 'INSERT',
        fields: [],
        rows: [],
        rowCount: 1,
      },
    ]))

    // Only the last query result should have been output
    expect(stdout).not.to.contain(uniqueValue)
    expect(stdout).to.contain('(1 row)')

    verify(mockPgClientType.end()).once()
  })

  it('executes a database command with CSV output format', async () => {
    const fakeInputDate = new Date(2026, 9, 22, 15, 13, 19, 845)

    initDefaultRequestMocks()

    await runCommand([
      'borealis-pg:run',
      '--app',
      fakeHerokuAppName,
      '--db-cmd',
      fakeDbCommand,
      '--format',
      'csv',
    ])

    executeSshClientListener()

    const queryCallback = getQueryCallbackFn()

    const expectedRowCount = 3

    const {stdout} = await captureOutput(async () => queryCallback(null, {
      command: 'SELECT',
      fields: [{name: 'id'}, {name: 'value'}],
      oid: 32_304,
      rows: [
        {id: 21, value: 'Ted "Big T" Oz'},
        {id: 0, value: fakeInputDate},
        {id: '33', value: 3},
      ],
      rowCount: expectedRowCount,
    }))

    expect(stdout).to.contain(
      'id,value\n' +
      '21,"Ted ""Big T"" Oz"\n' +
      `0,${fakeInputDate.toISOString()}\n` +
      '33,3\n')
    expect(stdout).not.to.contain(`(${expectedRowCount} rows)`)

    verify(mockPgClientType.end()).once()
  })

  it('executes a database command with JSON output format', async () => {
    const fakeInputDate = new Date(2026, 9, 22, 12, 56, 32, 107)

    initDefaultRequestMocks()

    await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-d', fakeDbCommand, '-f', 'json'])

    executeSshClientListener()

    const queryCallback = getQueryCallbackFn()

    const expectedRowCount = 3

    const {stdout} = await captureOutput(async () => queryCallback(null, {
      command: 'SELECT',
      fields: [{name: 'id'}, {name: 'value'}],
      oid: 32_304,
      rows: [{id: 16, value: 'test1'}, {id: 19, value: 'test2'}, {id: '23', value: fakeInputDate}],
      rowCount: expectedRowCount,
    }))

    expect(stdout).to.contain(
      JSON.stringify(
        [
          {id: 16, value: 'test1'},
          {id: 19, value: 'test2'},
          {id: '23', value: fakeInputDate.toISOString()},
        ],
        undefined,
        2))
    expect(stdout).not.to.contain(`(${expectedRowCount} rows)`)

    verify(mockPgClientType.end()).once()
  })

  it('executes a database command with YAML output format', async () => {
    const fakeInputDate = new Date(2026, 9, 22, 15, 39, 51, 807)

    initDefaultRequestMocks()

    await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-d', fakeDbCommand, '-f', 'yaml'])

    executeSshClientListener()

    const queryCallback = getQueryCallbackFn()

    const expectedRowCount = 3

    const {stdout} = await captureOutput(async () => queryCallback(null, {
      command: 'SELECT',
      fields: [{name: 'id'}, {name: 'value'}],
      oid: 32_304,
      rows: [{id: 1, value: fakeInputDate}, {id: 2, value: 'test1'}, {id: 3, value: 'test2'}],
      rowCount: expectedRowCount,
    }))

    expect(stdout).to.contain(
      '- id: 1\n' +
      `  value: ${fakeInputDate.toISOString()}\n` +
      '- id: 2\n' +
      '  value: test1\n' +
      '- id: 3\n' +
      '  value: test2\n')
    expect(stdout).not.to.contain(`(${expectedRowCount} rows)`)

    verify(mockPgClientType.end()).once()
  })

  it('executes a database command with no result', async () => {
    initDefaultRequestMocks()

    const {stderr: cmdStderr} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-d', fakeDbCommand])

    expect(cmdStderr).to.contain(
      `Configuring read-only user session for add-on ${fakeAddonName}... done`)

    executeSshClientListener()

    const queryCallback = getQueryCallbackFn()

    const {stdout} = await captureOutput(async () => queryCallback(null, {}))

    expect(stdout).to.contain('(0 rows)')

    verify(mockPgClientType.end()).once()
  })

  it('executes a database command from a file', async () => {
    initDefaultRequestMocks()

    const {stderr: cmdStderr} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '--db-cmd-file', exampleFilePath])

    expect(cmdStderr).to.contain(
      `Configuring read-only user session for add-on ${fakeAddonName}... done`)

    executeSshClientListener()

    verify(mockPgClientFactoryType.create(deepEqual({
      host: localPgHostname,
      port: defaultPgPort,
      database: fakePgDbName,
      user: fakePgReadonlyAppUsername,
      password: fakePgReadonlyAppPassword,
      ssl: {rejectUnauthorized: false},
    }))).once()

    verify(mockPgClientType.connect()).once()

    // Check the query callback function
    const queryCallback = getQueryCallbackFn(exampleFileContents)

    const {stdout} = await captureOutput(async () => queryCallback(null, {
      command: 'SELECT',
      fields: [{name: 'id'}, {name: 'foo'}],
      oid: 2761,
      rows: [
        {id: 9, foo: 'val1'},
        {id: 104, foo: 'val2'},
        {id: 23, foo: null},
        {id: 1, foo: 'one'},
      ],
      rowCount: 4,
    }))

    expect(stdout).to.containIgnoreSpaces(
      '| id | foo |')
    expect(stdout).to.containIgnoreSpaces(
      '| 9 | val1 |\n' +
      '| 104 | val2 |\n' +
      '| 23 | |\n' +
      '| 1 | one |\n')
    expect(stdout).to.contain('(4 rows)')

    verify(mockPgClientType.end()).once()
  })

  it('executes a database command from a file with a different output format', async () => {
    initDefaultRequestMocks()

    await runCommand([
      'borealis-pg:run',
      '-a',
      fakeHerokuAppName,
      '-i',
      exampleFilePath,
      '-f',
      'json',
    ])

    executeSshClientListener()

    const queryCallback = getQueryCallbackFn(exampleFileContents)

    const expectedRowCount = 2

    const {stdout} = await captureOutput(async () => queryCallback(null, {
      command: 'SELECT',
      fields: [{name: 'id'}, {name: 'value'}],
      oid: 32_304,
      rows: [{id: 1, value: 'one'}, {id: 2, value: 'two'}],
      rowCount: expectedRowCount,
    }))

    expect(stdout).to.contain(
      JSON.stringify([{id: 1, value: 'one'}, {id: 2, value: 'two'}], undefined, 2))
    expect(stdout).not.to.contain(`(${expectedRowCount} rows)`)

    verify(mockPgClientType.end()).once()
  })

  it('handles an error when the database command file is not found', async () => {
    const {error} = await runCommand([
      'borealis-pg:run',
      '-a',
      fakeHerokuAppName,
      '-i',
      '/c2ee1b3e-fbbd-4915-ad77-f3c26a60714c.sql',
    ])

    expect(error?.message).to.contain('File not found')

    verify(mockSshClientFactoryType.create()).never()
    verify(mockTcpServerFactoryType.create(anyFunction())).never()
  })

  it('handles an error when the database command file is actually a directory', async () => {
    const {error} = await runCommand([
      'borealis-pg:run',
      '--app',
      fakeHerokuAppName,
      '--db-cmd-file',
      __dirname,
    ])

    expect(error?.message).to.contain('is a directory')

    verify(mockSshClientFactoryType.create()).never()
    verify(mockTcpServerFactoryType.create(anyFunction())).never()
  })

  it('handles a database command error', async () => {
    initDefaultRequestMocks()

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-d', fakeDbCommand])

    executeSshClientListener()

    verify(mockPgClientType.query(fakeDbCommand, anyFunction())).once()

    const [_, queryArg2] = capture(mockPgClientType.query).last()
    const queryCallback = (queryArg2 as unknown) as ((err: any, results: any) => void)

    const fakeErrorMessage = 'Bad query!'

    const {stdout, stderr} = await captureOutput(async () =>
      queryCallback(new Error(fakeErrorMessage), null))

    expect(stdout).to.equal('')
    expect(stderr).to.contain(fakeErrorMessage)

    verify(mockNodeProcessType.exit(1)).once()
  })

  it('configures the DB user with write access when requested', async () => {
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, fakeAppConfigVars)

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshPort: defaultSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })

    const {stderr} = await runCommand([
      'borealis-pg:run',
      '--app',
      fakeHerokuAppName,
      '--write-access',
      '--shell-cmd',
      fakeShellCommand,
    ])

    executeSshClientListener()

    expect(stderr).to.contain(
      `Configuring read/write user session for add-on ${fakeAddonName}... done`)

    verify(mockChildProcessFactoryType.spawn(
      fakeShellCommand,
      deepEqual({
        env: {
          ...tunnelServices.nodeProcess.env,
          PGHOST: localPgHostname,
          PGPORT: defaultPgPort.toString(),
          PGDATABASE: fakePgDbName,
          PGUSER: fakePgReadWriteAppUsername,
          PGPASSWORD: fakePgReadWriteAppPassword,
          DATABASE_URL:
              `postgres://${fakePgReadWriteAppUsername}:${fakePgReadWriteAppPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
        },
        shell: true,
        stdio: ['ignore', null, null],
      }))).once()
  })

  it('uses a readonly personal DB user when requested', async () => {
    initPersonalUserRequestMocks(false)

    await runCommand([
      'borealis-pg:run',
      '--personal-user',
      '--app',
      fakeHerokuAppName,
      '--shell-cmd',
      fakeShellCommand,
    ])

    executeSshClientListener()

    verify(mockChildProcessFactoryType.spawn(
      fakeShellCommand,
      deepEqual({
        env: {
          ...tunnelServices.nodeProcess.env,
          PGHOST: localPgHostname,
          PGPORT: defaultPgPort.toString(),
          PGDATABASE: fakePgDbName,
          PGUSER: fakePgPersonalUsername,
          PGPASSWORD: fakePgPersonalPassword,
          DATABASE_URL:
              `postgres://${fakePgPersonalUsername}:${fakePgPersonalPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
        },
        shell: true,
        stdio: ['ignore', null, null],
      }))).once()
  })

  it('uses a read/write personal DB user when requested', async () => {
    initPersonalUserRequestMocks(true)

    await runCommand([
      'borealis-pg:run',
      '-w',
      '-u',
      '-a',
      fakeHerokuAppName,
      '-e',
      fakeShellCommand,
    ])

    executeSshClientListener()

    verify(mockChildProcessFactoryType.spawn(
      fakeShellCommand,
      deepEqual({
        env: {
          ...tunnelServices.nodeProcess.env,
          PGHOST: localPgHostname,
          PGPORT: defaultPgPort.toString(),
          PGDATABASE: fakePgDbName,
          PGUSER: fakePgPersonalUsername,
          PGPASSWORD: fakePgPersonalPassword,
          DATABASE_URL:
              `postgres://${fakePgPersonalUsername}:${fakePgPersonalPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
        },
        shell: true,
        stdio: ['ignore', null, null],
      }))).once()
  })

  it('starts SSH port forwarding', async () => {
    initDefaultRequestMocks()

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    verify(mockSshClientType.forwardOut(
      localPgHostname,
      defaultPgPort,
      fakePgReaderHost,
      customPgPort,
      anyFunction())).once()

    const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
    assert(typeof portForwardListener !== 'undefined')
    portForwardListener(undefined, mockSshStreamInstance)

    verify(mockTcpSocketType.pipe(mockSshStreamInstance)).once()
    verify(mockSshStreamType.pipe(mockTcpSocketInstance)).once()

    verify(mockTcpSocketType.on(anyString(), anyFunction())).twice()
    verify(mockTcpSocketType.on('end', anyFunction())).once()
    verify(mockTcpSocketType.on('error', anyFunction())).once()
  })

  it('executes a command with the obsolete tunnel connection info config var', async () => {
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, fakeObsoleteAppConfigVars)

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshPort: customSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    executeSshClientListener()

    verify(mockChildProcessFactoryType.spawn(
      fakeShellCommand,
      deepEqual({
        env: {
          ...tunnelServices.nodeProcess.env,
          PGHOST: localPgHostname,
          PGPORT: defaultPgPort.toString(),
          PGDATABASE: fakePgDbName,
          PGUSER: fakePgReadonlyAppUsername,
          PGPASSWORD: fakePgReadonlyAppPassword,
          DATABASE_URL:
              `postgres://${fakePgReadonlyAppUsername}:${fakePgReadonlyAppPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
        },
        shell: true,
        stdio: ['ignore', null, null],
      }))).once()
  })

  it('rejects a --port value that is not an integer', async () => {
    const {error} = await runCommand([
      'borealis-pg:run',
      '--app',
      fakeHerokuAppName,
      '--port',
      'port-must-be-an-integer',
      '--shell-cmd',
      fakeShellCommand,
    ])

    expect(error?.message).to.contain('Expected an integer but received: port-must-be-an-integer')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('rejects a --port value that is less than 1', async () => {
    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-p', '-1', '-e', fakeShellCommand])

    expect(error?.message).to.contain(
      'Expected an integer greater than or equal to 1 but received: -1')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('rejects a --port value that is greater than 65535', async () => {
    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-p', '65536', '-e', fakeShellCommand])

    expect(error?.message).to.contain(
      'Expected an integer less than or equal to 65535 but received: 65536')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error if there are no DB command CLI options', async () => {
    const {stdout, error} = await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(
      'Either --db-cmd, --db-cmd-file or --shell-cmd must be specified')
  })

  it(
    'exits with an error if both a shell command and a database command are provided',
    async () => {
      const {stdout, error} = await runCommand(
        ['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand, '-d', fakeDbCommand])

      expect(stdout).to.equal('')
      expect(error?.message).to.contain(
        `--shell-cmd=${fakeShellCommand} cannot also be provided when using --db-cmd`)
    })

  it('exits with an error if the --format option is specified for a shell command', async () => {
    const {stdout, error} = await runCommand([
      'borealis-pg:run',
      '--app',
      fakeHerokuAppName,
      '--shell-cmd',
      fakeShellCommand,
      '--format',
      'json',
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(
      `--shell-cmd=${fakeShellCommand} cannot also be provided when using --format`
    )
  })

  it('exits with an error if an invalid output format is requested', async () => {
    const {stdout, error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-d', fakeDbCommand, '-f', 'unknown'])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Expected --format=unknown to be one of')
  })

  it('throws an unexpected SSH client error when it occurs', async () => {
    when(mockSshClientFactoryType.create()).thenThrow(new Error('An error'))

    initDefaultRequestMocks()

    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    expect(error?.message).to.contain('An error')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
  })

  it('handles a local port conflict', async () => {
    initDefaultRequestMocks()

    await runCommand([
      'borealis-pg:run',
      '-a',
      fakeHerokuAppName,
      '-p',
      customPgPort.toString(),
      '-e',
      fakeShellCommand,
    ])

    const [_, listener] = capture(mockTcpServerType.on).last()
    const errorListener = listener as ((err: unknown) => void)

    const {stderr} = await captureOutput(async () => errorListener({code: 'EADDRINUSE'}))

    expect(stderr).to.contain(`Local port ${customPgPort} is not available`)
    verify(mockNodeProcessType.exit(1)).once()
  })

  it('handles a generic proxy server error', async () => {
    initDefaultRequestMocks()

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    const [_, listener] = capture(mockTcpServerType.on).last()
    const errorListener = listener as ((err: unknown) => void)

    const fakeError = new Error("This isn't a real error")

    const {error} = await captureOutput(async () => errorListener(fakeError))

    expect(error).to.equal(fakeError)
  })

  it('handles an error when starting port forwarding', async () => {
    initDefaultRequestMocks()

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
    tcpConnectionListener(mockTcpSocketInstance)

    const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
    assert(typeof portForwardListener !== 'undefined')

    const fakeError = new Error('Just testing!')

    const {error} = await captureOutput(async () =>
      portForwardListener(fakeError, mockSshStreamInstance))

    expect(error).to.equal(fakeError)

    verify(mockTcpSocketType.pipe(mockSshStreamInstance)).never()
    verify(mockSshStreamType.pipe(mockTcpSocketInstance)).never()
  })

  it('handles an unexpected TCP socket error', async () => {
    initDefaultRequestMocks()

    await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

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
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, fakeAppConfigVars)

    nock(borealisPgApiBaseUrl,)
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(404, {reason: 'Add-on does not exist for a personal SSH user'})

    const {error} = await runCommand(['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error if the add-on is still provisioning', async () => {
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, fakeAppConfigVars)

    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(422, {reason: 'Add-on is not ready for a personal SSH user yet'})

    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    expect(error?.message).to.contain('Add-on is not finished provisioning')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', async () => {
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, fakeAppConfigVars)

    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
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
      .reply(423, {reason: 'Locked'})

    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-u', '-e', fakeShellCommand])

    expect(error?.message).to.contain('Add-on is undergoing a PostgreSQL major version upgrade')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error when there is an API error while creating the SSH user', async () => {
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, fakeAppConfigVars)

    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(503, {reason: 'Server error!'})

    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error when there is an API error getting the app config vars', async () => {
    nock(herokuApiBaseUrl).get(`/apps/${fakeHerokuAppName}/config-vars`).reply(500)

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })

    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it('exits with an error when DB write access is revoked', async () => {
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, fakeAppConfigVars)

    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`, {enableWriteAccess: false})
      .reply(403, {reason: 'DB write access revoked'})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })

    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand, '-u'])

    expect(error?.message).to.contain(
      'Access to the add-on database has been temporarily revoked for personal users')

    verify(mockTcpServerFactoryType.create(anyFunction())).never()
    verify(mockSshClientFactoryType.create()).never()
  })

  it(
    'exits with an error when there is an API error while creating a personal DB user',
    async () => {
      nock(herokuApiBaseUrl)
        .get(`/apps/${fakeHerokuAppName}/config-vars`)
        .reply(200, fakeAppConfigVars)

      nock(borealisPgApiBaseUrl)
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
          })

      const {error} = await runCommand(
        ['borealis-pg:run', '-u', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

      expect(error?.message).to.contain(
        'Add-on service is temporarily unavailable. Try again later.')

      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  it('exits with an error when the app connection config var is invalid', async () => {
    nock(herokuApiBaseUrl)
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, {MY_COOL_DB_SSH_TUNNEL_BPG_CONNECTION_INFO: 'INVALID!'})

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })

    const {error} = await runCommand(
      ['borealis-pg:run', '-a', fakeHerokuAppName, '-e', fakeShellCommand])

    expect(error?.message).to.contain(
      'The MY_COOL_DB_SSH_TUNNEL_BPG_CONNECTION_INFO config variable value for ' +
      `⬢ ${fakeHerokuAppName} is invalid`
    )

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

  function getQueryCallbackFn(expectedDbCommand: string = fakeDbCommand) {
    verify(mockPgClientType.query(anyString(), anyFunction())).once()
    verify(mockPgClientType.query(expectedDbCommand, anyFunction())).once()

    const [_, queryArg2] = capture(mockPgClientType.query).last()

    return (queryArg2 as unknown) as ((err: any, results: any) => void)
  }
})

function initDefaultRequestMocks() {
  nock(herokuApiBaseUrl).get(`/apps/${fakeHerokuAppName}/config-vars`).reply(200, fakeAppConfigVars)

  nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
    .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
    .reply(
      200,
      {
        sshHost: fakeSshHost,
        sshPort: customSshPort,
        sshUsername: fakeSshUsername,
        sshPrivateKey: fakeSshPrivateKey,
        publicSshHostKey: expectedSshHostKeyEntry,
      })
}

function initPersonalUserRequestMocks(enableWriteAccess: boolean) {
  nock(herokuApiBaseUrl).get(`/apps/${fakeHerokuAppName}/config-vars`).reply(200, fakeAppConfigVars)

  nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
    .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
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
        dbHost: fakePgReaderHost,
        dbPort: customPgPort,
        dbName: fakePgDbName,
        dbUsername: fakePgPersonalUsername,
        dbPassword: fakePgPersonalPassword,
      })
}

function readExampleFile(): string {
  return readFileSync(exampleFilePath, {encoding: 'utf-8'})
}
