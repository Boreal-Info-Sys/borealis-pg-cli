import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

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
const fakeOAuthPostResponseBody = {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}}

const fakeCurrentVersion = '16'
const fakeTargetVersion = '17'

const baseTestContext = test.stdout()
  .stderr()
  .nock(
    herokuApiBaseUrl,
    api => api
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
      ]))

describe('PostgreSQL version upgrade execution command', () => {
  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
        .reply(
          202,
          {
            currentPgMajorVersion: fakeCurrentVersion,
            targetPgMajorVersion: fakeTargetVersion,
          }))
    .command(['borealis-pg:upgrade:execute', '--app', fakeHerokuAppName])
    .it('starts an upgrade', ctx => {
      expect(ctx.stderr).to.contain(
        `Starting PostgreSQL major version upgrade for add-on ${fakeAddonName}... done`)
      expect(ctx.stderr).to.match(new RegExp(
        `.*${fakeAddonName} is being upgraded from PostgreSQL version ${fakeCurrentVersion} to version ${fakeTargetVersion} in the background.*`))
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
        .reply(400, {reason: 'Bad state!'}))
    .command(['borealis-pg:upgrade:execute', '--app', fakeHerokuAppName])
    .catch('The add-on is in a state that prevents upgrades:\nBad state!')
    .it('exits with an error when there is a bad request', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
        .reply(403, {reason: 'No write access'}))
    .command(['borealis-pg:upgrade:execute', '--app', fakeHerokuAppName])
    .catch('Add-on database write access has been revoked')
    .it('exits with an error when write access has been revoked', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
        .reply(404, {reason: 'Not found!'}))
    .command(['borealis-pg:upgrade:execute', '--app', fakeHerokuAppName])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error when the add-on does not exist', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
        .reply(409, {reason: 'Under maintenance'}))
    .command(['borealis-pg:upgrade:execute', '--app', fakeHerokuAppName])
    .catch('Add-on database is currently undergoing maintenance. Please try again later.')
    .it('exits with an error when the add-on is already under maintenance', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
        .reply(422, {reason: 'Still provisioning!'}))
    .command(['borealis-pg:upgrade:execute', '--app', fakeHerokuAppName])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error when the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-version-upgrades`)
        .reply(500, {reason: 'Unexpected error!'}))
    .command(['borealis-pg:upgrade:execute', '--app', fakeHerokuAppName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is a server-side error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
