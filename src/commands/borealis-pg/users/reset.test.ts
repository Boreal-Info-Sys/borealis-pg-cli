import {runCommand} from '@oclif/test'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

const fakeAddonId = 'd04a3bfc-88d9-4787-92ef-8c8be5e3f0e0'
const fakeAddonName = 'my-super-neat-fake-addon'

const fakeAttachmentId = 'fdc2648b-6e3d-40b9-8884-bc32c8610b83'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'

const fakeHerokuAppId = '47bb295d-65b9-43cd-9528-ad52aa22034e'
const fakeHerokuAppName = 'my-super-neat-fake-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

describe('database credentials reset command', () => {
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
          id: 'a7594c09-34ba-4e82-96ce-3531e516c452',
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

  it('resets all DB credentials for an add-on', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
      .reply(200, {})

    const {stdout, stderr} = await runCommand(
      ['borealis-pg:users:reset', '--app', fakeHerokuAppName])

    expect(stderr).to.contain(
      `Resetting all database credentials for add-on ${fakeAddonName}... done`)
    expect(stdout).to.equal('')
    expect(nock.pendingMocks()).to.be.empty
  })

  it('exits with an error when the add-on is undergoing maintenance', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
      .reply(400, {reason: 'Maintenance'})

    const {stdout, error} = await runCommand(['borealis-pg:users:reset', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is currently undergoing maintenance')
  })

  it('exits with an error when the add-on is undergoing maintenance', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
      .reply(403, {reason: 'DB write access revoked'})

    const {stdout, error} = await runCommand(['borealis-pg:users:reset', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(
      'Write access to the add-on database has been temporarily revoked')
  })

  it('exits with an error when the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
      .reply(404, {reason: 'Not found'})

    const {stdout, error} = await runCommand(['borealis-pg:users:reset', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error when the add-on is not finished provisioning', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
      .reply(422, {reason: 'Not done yet'})

    const {stdout, error} = await runCommand(['borealis-pg:users:reset', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
      .reply(423, {reason: 'Locked'})

    const {stdout, error} = await runCommand(['borealis-pg:users:reset', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is undergoing a PostgreSQL major version upgrade')
  })

  it('exits with an error when there is an API server error', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
      .reply(500, {reason: 'Server error'})

    const {stdout, error} = await runCommand(['borealis-pg:users:reset', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
