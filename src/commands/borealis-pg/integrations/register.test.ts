import {runCommand} from '@oclif/test'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

const fakeAddonId = 'bde71749-e560-42d7-b9ab-ccb6d91b17b5'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = '8c76b180-afb4-41fe-8f8d-79bfc8d0e3fa'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = 'a9faf548-3d67-4507-8f3a-8384af204ef0'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeIntegrationName = 'integration1'
const fakeSshPublicKeyPieces = [
  'ssh-ed25519',
  'AAAAC3NzaC1lZDI1NTE5AAAAIK5PkBlx+xU/skHZwhR/PPMCKAbQYhgiHlntFkhhC9Q0',
]
const fakeSshPublicKey = fakeSshPublicKeyPieces.join(' ')

const fakeDbHost = 'my-fake-db-host'
const fakeDbPort = 33_333
const fakeDbName = 'my_cool_db'
const fakeDbUsername = 'my_fake_db_user'
const fakeDbPassword = 'my-fake-db-password'
const fakeSshHost = '1.2.4.8'
const fakeSshPort = 22_222
const fakeSshUsername = 'my-imaginary-ssh-user'
const fakePublicSshHostKey =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINiVZAXPnABknX23CvXDyuWN6a7u6OGyWEnU4u/PWVup'

const expectedResponseContent = {
  dbHost: fakeDbHost,
  dbPort: fakeDbPort,
  dbName: fakeDbName,
  dbUsername: fakeDbUsername,
  dbPassword: fakeDbPassword,
  sshHost: fakeSshHost,
  sshPort: fakeSshPort,
  sshUsername: fakeSshUsername,
  publicSshHostKey: fakePublicSshHostKey,
}

describe('data integration registration command', () => {
  beforeEach(() => {
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
          id: '8555365d-0164-4796-ba5a-a1517baee077',
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
    nock.cleanAll()
  })

  it('registers a data integration without write access', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`, {
        integrationName: fakeIntegrationName,
        sshPublicKey: fakeSshPublicKey,
        enableWriteAccess: false,
      })
      .reply(201, expectedResponseContent)

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '--app',
      fakeHerokuAppName,
      '--name',
      fakeIntegrationName,
      fakeSshPublicKey,
    ])

    expect(stdout).to.containIgnoreSpaces(`Database Host: ${fakeDbHost}`)
    expect(stdout).to.containIgnoreSpaces(`Database Port: ${fakeDbPort}`)
    expect(stdout).to.containIgnoreSpaces(`Database Name: ${fakeDbName}`)
    expect(stdout).to.containIgnoreSpaces(`Database Username: ${fakeDbUsername}`)
    expect(stdout).to.containIgnoreSpaces(`Database Password: ${fakeDbPassword}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Host: ${fakeSshHost}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Port: ${fakeSshPort}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Username: ${fakeSshUsername}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Server Public Host Key: ${fakePublicSshHostKey}`)

    expect(error).to.be.undefined

    expect(nock.pendingMocks()).to.be.empty
  })

  it('registers a data integration with write access', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`, {
        integrationName: fakeIntegrationName,
        sshPublicKey: fakeSshPublicKey,
        enableWriteAccess: true,
      })
      .reply(201, expectedResponseContent)

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegrationName,
      '-w',
      fakeSshPublicKey,
    ])

    expect(stdout).to.containIgnoreSpaces(`Database Host: ${fakeDbHost}`)
    expect(stdout).to.containIgnoreSpaces(`Database Port: ${fakeDbPort}`)
    expect(stdout).to.containIgnoreSpaces(`Database Name: ${fakeDbName}`)
    expect(stdout).to.containIgnoreSpaces(`Database Username: ${fakeDbUsername}`)
    expect(stdout).to.containIgnoreSpaces(`Database Password: ${fakeDbPassword}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Host: ${fakeSshHost}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Port: ${fakeSshPort}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Username: ${fakeSshUsername}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Server Public Host Key: ${fakePublicSshHostKey}`)

    expect(error).to.be.undefined

    expect(nock.pendingMocks()).to.be.empty
  })

  it('registers a data integration with an unquoted SSH public key', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`, {
        integrationName: fakeIntegrationName,
        sshPublicKey: fakeSshPublicKey,
        enableWriteAccess: false,
      })
      .reply(201, expectedResponseContent)

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '--app',
      fakeHerokuAppName,
      '--name',
      fakeIntegrationName,
      ...fakeSshPublicKeyPieces, // Note that the SSH public key is split across two separate args
    ])

    expect(stdout).to.containIgnoreSpaces(`Database Host: ${fakeDbHost}`)
    expect(stdout).to.containIgnoreSpaces(`Database Port: ${fakeDbPort}`)
    expect(stdout).to.containIgnoreSpaces(`Database Name: ${fakeDbName}`)
    expect(stdout).to.containIgnoreSpaces(`Database Username: ${fakeDbUsername}`)
    expect(stdout).to.containIgnoreSpaces(`Database Password: ${fakeDbPassword}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Host: ${fakeSshHost}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Port: ${fakeSshPort}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Username: ${fakeSshUsername}`)
    expect(stdout).to.containIgnoreSpaces(`SSH Server Public Host Key: ${fakePublicSshHostKey}`)

    expect(error).to.be.undefined

    expect(nock.pendingMocks()).to.be.empty
  })

  it('exits with an error if the request was invalid', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`)
      .reply(400, {reason: 'Bad integration name'})

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '--write-access',
      '--app',
      fakeHerokuAppName,
      '--name',
      'invalid-integration-name!',
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Bad integration name')
  })

  it('exits with an error if DB write access was revoked', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`)
      .reply(403, {reason: 'DB write access disabled'})

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegrationName,
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on database write access has been revoked')
  })

  it('exits with an error if the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`)
      .reply(404, {reason: 'Add-on does not exist'})

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegrationName,
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error if the data integration is already registered', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`)
      .reply(409, {reason: 'Already registered'})

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '--app',
      fakeHerokuAppName,
      '--name',
      'invalid-integration-name!',
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('A data integration with that name is already registered')
  })

  it('exits with an error if the add-on is not fully provisioned', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`)
      .reply(422, {reason: 'Not ready yet'})

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegrationName,
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`)
      .reply(423, {reason: 'Locked'})

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegrationName,
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is undergoing a PostgreSQL major version upgrade')
  })

  it('exits with an error if the Borealis PG API indicates a server error', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/data-integrations`)
      .reply(500, {reason: 'Something went wrong'})

    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegrationName,
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })

  it('exits with an error if there is no SSH public key argument', async () => {
    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegrationName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Missing 1 required arg')
  })

  it('exits with an error if there is no integration name option', async () => {
    const {stdout, error} = await runCommand([
      'borealis-pg:integrations:register',
      '-a',
      fakeHerokuAppName,
      fakeSshPublicKey,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Missing required flag name')
  })
})
