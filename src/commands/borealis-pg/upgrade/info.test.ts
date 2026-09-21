import {runCommand} from '@oclif/test'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeAddonId = 'ff7106fb-a4b5-4bfb-b06b-6dc99c001642'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = '1704772d-6a5e-42dc-8b5d-8899f3f0df53'
const fakeAttachmentName = 'MY_SWEET_DB'

const fakeHerokuAppId = '233da0fd-dc96-46d8-935b-53e48b4542f6'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeOAuthPostRequestBody = {
  description: 'Borealis PG CLI plugin temporary auth token',
  expires_in: 180,
  scope: ['read', 'identity'],
}
const fakeOAuthPostResponseBody = {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}}

describe('PostgreSQL version upgrade info command', () => {
  beforeEach(() => {
    nock(herokuApiBaseUrl,)
      .post('/oauth/authorizations', fakeOAuthPostRequestBody)
      .reply(201, fakeOAuthPostResponseBody)
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

  it('shows info when an upgrade is available', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(
        200,
        {
          currentPgMajorVersion: '16',
          nextPgMajorVersion: '17',
          upgradeStatus: 'available',
        },
      )

    const {stdout, stderr} = await runCommand(
      ['borealis-pg:upgrade:info', '--app', fakeHerokuAppName])

    expect(stderr).to.contain(
      `Fetching PostgreSQL version upgrade info for add-on ${fakeAddonName}... done`)
    expect(stdout).to.containIgnoreSpaces('Current PostgreSQL major version: 16')
    expect(stdout).to.containIgnoreSpaces('Next PostgreSQL major version: 17')
    expect(stdout).to.containIgnoreSpaces('Upgrade Status: available')
  })

  it('shows info when an upgrade is in progress', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(
        200,
        {
          currentPgMajorVersion: '16',
          nextPgMajorVersion: '17',
          upgradeStatus: 'upgrading',
        },
      )

    const {stdout, stderr} = await runCommand(
      ['borealis-pg:upgrade:info', '--app', fakeHerokuAppName])

    expect(stderr).to.contain(
      `Fetching PostgreSQL version upgrade info for add-on ${fakeAddonName}... done`)
    expect(stdout).to.containIgnoreSpaces('Current PostgreSQL major version: 16')
    expect(stdout).to.containIgnoreSpaces('Next PostgreSQL major version: 17')
    expect(stdout).to.containIgnoreSpaces('Upgrade Status: upgrading')
  })

  it('shows info when at the maximum version', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(
        200,
        {
          currentPgMajorVersion: '17',
          nextPgMajorVersion: null,
          upgradeStatus: 'maximum',
        },
      )

    const {stdout, stderr} = await runCommand(['borealis-pg:upgrade:info', '-a', fakeHerokuAppName])

    expect(stderr).to.contain(
      `Fetching PostgreSQL version upgrade info for add-on ${fakeAddonName}... done`)
    expect(stdout).to.containIgnoreSpaces('Current PostgreSQL major version: 17')
    expect(stdout).to.containIgnoreSpaces('Next PostgreSQL major version: N/A')
    expect(stdout).to.containIgnoreSpaces('Upgrade Status: maximum')
  })

  it('exits with an error when the add-on does not exist', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(404, {reason: 'Not found!'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:upgrade:info', '--app', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error when the add-on is not fully provisioned', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(422, {reason: 'Still provisioning!'})

    const {stdout, error} = await runCommand(['borealis-pg:upgrade:info', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error when there is a server-side error', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(500, {reason: 'Unexpected error!'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:upgrade:info', '--app', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
