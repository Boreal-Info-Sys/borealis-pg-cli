import {runCommand} from '@oclif/test'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeAddonId = '283272dc-ccf9-4faf-9d4e-93463f5b069a'
const fakeAddonName = 'borealis-pg-my-fake-source-addon'

const fakeAttachmentId = 'd3155b15-d8cc-4a19-ae41-4257bb58b49d'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = '3eb06fa8-6111-4f60-b0b9-7dd55c387c70'
const fakeHerokuAppName = 'my-fake-source-heroku-app'

const fakeOAuthPostRequestBody = {
  description: 'Borealis PG CLI plugin temporary auth token',
  expires_in: 180,
  scope: ['read', 'identity'],
}
const fakeOAuthPostResponseBody = {
  id: fakeHerokuAuthId,
  access_token: {token: fakeHerokuAuthToken},
}

const fakeCurrentVersion = '16'
const fakeTargetVersion = '17'

describe('PostgreSQL version upgrade execution command', () => {
  beforeEach(() => {
    nock(herokuApiBaseUrl)
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

  it('starts an upgrade', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(202, {
        currentPgMajorVersion: fakeCurrentVersion,
        targetPgMajorVersion: fakeTargetVersion,
      })

    const {stderr, error} = await runCommand([
      'borealis-pg:upgrade:execute',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stderr.trim()).to.endWith(
      'The system will send an email when the upgrade process is complete.',
    )
    expect(error).to.be.undefined
    expect(nock.pendingMocks()).to.be.empty
  })

  it('exits with an error when there is a bad request', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(400, {reason: 'Bad state!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:execute',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(
      'The add-on is in a state that prevents upgrades:\nBad state!',
    )
  })

  it('exits with an error when write access has been revoked', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(403, {reason: 'No write access'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:execute',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on database write access has been revoked')
  })

  it('exits with an error when the add-on does not exist', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(404, {reason: 'Not found!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:execute',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error when the add-on is already under maintenance', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(409, {reason: 'Under maintenance'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:execute',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(
      'Add-on database is currently undergoing maintenance. Please try again later.',
    )
  })

  it('exits with an error when the add-on is not fully provisioned', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(422, {reason: 'Still provisioning!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:execute',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error when there is a server-side error', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
      .reply(500, {reason: 'Unexpected error!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:execute',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
