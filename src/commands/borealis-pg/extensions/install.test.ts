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

const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt1Schema = 'my-first-fake-pg-ext-schema'
const fakeExt1Version = '1.11.111'

const fakeExt2 = 'my-second-fake-pg-extension'
const fakeExt2Schema = 'my-second-fake-pg-ext-schema'
const fakeExt2Version = '22.2.0'

const fakeExt3 = 'my-third-fake-pg-extension'
const fakeExt3Schema = 'my-third-fake-pg-ext-schema'
const fakeExt3Version = '3.3'

describe('extension installation command', () => {
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

  it('installs the requested extension', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt1})
      .reply(201, {pgExtensionSchema: fakeExt1Schema, pgExtensionVersion: fakeExt1Version})

    const {stdout, stderr} = await runCommand(
      ['borealis-pg:extensions:install', '--app', fakeHerokuAppName, fakeExt1])

    expect(stderr).to.endWith(
      `Installing Postgres extension ${fakeExt1} for add-on ${fakeAddonName}... done\n`)
    expect(stdout).to.equal(
      `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n`)
    expect(nock.pendingMocks()).to.be.empty
  })

  it(
    'suppresses errors with the --suppress-conflict option when an extension is already installed',
    async () => {
      nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(409, {reason: 'Already installed!'})

      const {stdout, stderr} = await runCommand([
        'borealis-pg:extensions:install',
        '--app',
        fakeHerokuAppName,
        '--suppress-conflict',
        fakeExt1,
      ])

      expect(stderr).to.contain(
        `Installing Postgres extension ${fakeExt1} for add-on ${fakeAddonName}... !`)
      expect(stderr).to.contain(`Extension ${fakeExt1} is already installed`)
      expect(stdout).to.equal('')
      expect(nock.pendingMocks()).to.be.empty
    })

  it('recursively installs the extension and its dependencies', async () => {
    nock(borealisPgApiBaseUrl)
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt1})
      .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2]})
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt2})
      .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt3]})
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt3})
      .reply(201, {pgExtensionSchema: fakeExt3Schema, pgExtensionVersion: fakeExt3Version})
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt2})
      .reply(201, {pgExtensionSchema: fakeExt2Schema, pgExtensionVersion: fakeExt2Version})
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt1})
      .reply(201, {pgExtensionSchema: fakeExt1Schema, pgExtensionVersion: fakeExt1Version})

    const {stdout} = await runCommand(
      ['borealis-pg:extensions:install', '-r', '-a', fakeHerokuAppName, fakeExt1])

    expect(stdout).to.equal(
      `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n` +
      `- ${fakeExt2} (version: ${fakeExt2Version}, schema: ${fakeExt2Schema})\n` +
      `- ${fakeExt3} (version: ${fakeExt3Version}, schema: ${fakeExt3Schema})\n`)
    expect(nock.pendingMocks()).to.be.empty
  })

  it(
    'recursively installs the extension and its dependencies when one is already installed',
    async () => {
      nock(borealisPgApiBaseUrl)
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2, fakeExt3]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(409, {reason: 'Already installed'})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(201, {pgExtensionSchema: fakeExt3Schema, pgExtensionVersion: fakeExt3Version})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt1Schema, pgExtensionVersion: fakeExt1Version})

      const {stdout} = await runCommand([
        'borealis-pg:extensions:install',
        '--recursive',
        '--app',
        fakeHerokuAppName,
        fakeExt1,
      ])

      expect(stdout).to.equal(
        `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n` +
        `- ${fakeExt3} (version: ${fakeExt3Version}, schema: ${fakeExt3Schema})\n`)
      expect(nock.pendingMocks()).to.be.empty
    })

  it(
    'does not get stuck in infinite recursion if retrying after missing dependencies',
    async () => {
      nock(borealisPgApiBaseUrl)
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt1]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt3Schema})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt1]})

      const {stdout} = await runCommand(
        ['borealis-pg:extensions:install', '-r', '-a', fakeHerokuAppName, fakeExt2])

      expect(stdout).to.equal('')
      expect(nock.pendingMocks()).to.be.empty
    })

  it('exits with an error if the extension has missing dependencies', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2, fakeExt3]})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName, fakeExt1])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(
      `Extension ${fakeExt1} has one or more unsatisfied dependencies. ` +
      `All of its dependencies (${fakeExt2}, ${fakeExt3}) must be installed.`)
  })

  it('exits with an error if installation of a dependency fails', async () => {
    nock(borealisPgApiBaseUrl)
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt1})
      .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt3]})
      .post(
        `/heroku/resources/${fakeAddonName}/pg-extensions`,
        {pgExtensionName: fakeExt3})
      .reply(500, {reason: 'Internal server error'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-r', '-a', fakeHerokuAppName, fakeExt1])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })

  it('exits with an error if the extension is not supported', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(400, {reason: 'Bad extension name'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName, fakeExt1])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(`${fakeExt1} is not a supported Postgres extension`)
  })

  it('exits with an error if the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(404, {reason: 'Add-on does not exist'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName, fakeExt2])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error if the extension is already installed', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(409, {reason: 'Already installed'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName, fakeExt1])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(`Extension ${fakeExt1} is already installed`)
  })

  it('exits with an error if the add-on is not fully provisioned', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(422, {reason: 'Not ready yet'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName, fakeExt2]
    )

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(423, {reason: 'Locked'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName, fakeExt1])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is undergoing a PostgreSQL major version upgrade')
  })

  it('exits with an error if the Borealis PG API indicates a server error', async () => {
    nock(borealisPgApiBaseUrl)
      .post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(500, {reason: 'Something went wrong'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName, fakeExt1])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })

  it('exits with an error if there is no Postgres extension argument', async () => {
    const {stdout, error} = await runCommand(
      ['borealis-pg:extensions:install', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Missing 1 required arg')
  })
})
