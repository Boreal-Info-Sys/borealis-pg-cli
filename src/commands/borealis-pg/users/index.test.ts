import {runCommand} from '@oclif/test'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

const fakeAddonId = 'c47cc174-9509-463e-aa75-f0794c5ee595'
const fakeAddonName = 'my-super-neat-fake-addon'

const fakeAttachmentId = 'a1ea0d31-801c-4594-bdd7-b1dc0b6414fd'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'

const fakeHerokuAppId = '33886793-1aa1-4cb5-988e-1614a4efc384'
const fakeHerokuAppName = 'my-super-neat-fake-app'

const fakeAppReadOnlyUsername = 'app_ro_12345'
const fakeAppReadWriteUsername = 'app_rw_67890'

const fakePersonalUser1 = 'user1@example.com'
const fakePersonalReadOnlyUsername1 = 'p_ro_abcdef'
const fakePersonalReadWriteUsername1 = 'p_rw_abcdef'

const fakePersonalUser2 = 'second-user@example.com'
const fakePersonalReadOnlyUsername2 = 'p_ro_ghijkl'
const fakePersonalReadWriteUsername2 = 'p_rw_ghijkl'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

describe('database users command', () => {
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
          id: '44b5b636-963e-4149-8478-0d8277aa7a41',
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

  it('displays DB users for an add-on', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/db-users`)
      .reply(
        200,
        {
          users: [
            {
              displayName: null,
              readOnlyUsername: fakeAppReadOnlyUsername,
              readWriteUsername: fakeAppReadWriteUsername,
              userType: 'app',
            },
            {
              displayName: fakePersonalUser1,
              readOnlyUsername: fakePersonalReadOnlyUsername1,
              readWriteUsername: fakePersonalReadWriteUsername1,
              userType: 'personal',
            },
            {
              displayName: fakePersonalUser2,
              readOnlyUsername: fakePersonalReadOnlyUsername2,
              readWriteUsername: fakePersonalReadWriteUsername2,
              userType: 'personal',
            },
          ],
        })

    const {stdout, stderr} = await runCommand(['borealis-pg:users', '--app', fakeHerokuAppName])

    expect(stderr).to.contain(`Fetching user list for add-on ${fakeAddonName}... done`)

    expect(stdout).to.containIgnoreSpaces(
      '| Add-on User | DB Read-only Username | DB Read/Write Username |')
    expect(stdout).to.containIgnoreSpaces(
      `| Heroku App User | ${fakeAppReadOnlyUsername} | ${fakeAppReadWriteUsername} |\n` +
      `| ${fakePersonalUser1} | ${fakePersonalReadOnlyUsername1} | ${fakePersonalReadWriteUsername1} |\n` +
      `| ${fakePersonalUser2} | ${fakePersonalReadOnlyUsername2} | ${fakePersonalReadWriteUsername2} |\n`)
  })

  it('displays a warning when there are no DB users', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/db-users`)
      .reply(200, {users: []})

    const {stdout, stderr} = await runCommand(['borealis-pg:users', '-a', fakeHerokuAppName])

    expect(stderr).to.contain(`Fetching user list for add-on ${fakeAddonName}... done`)
    expect(stderr).to.contain('No users found')
    expect(stdout).to.equal('')
  })

  it('exits with an error when the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/db-users`)
      .reply(404, {reason: 'Not found'})

    const {stdout, error} = await runCommand(['borealis-pg:users', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error when the add-on is not finished provisioning', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/db-users`)
      .reply(422, {reason: 'Not done yet'})

    const {stdout, error} = await runCommand(['borealis-pg:users', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error when there is an API server error', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/db-users`)
      .reply(500, {reason: 'Server error'})

    const {stdout, error} = await runCommand(['borealis-pg:users', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
