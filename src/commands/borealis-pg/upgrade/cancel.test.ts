import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeAddonId = '005e8192-5ff3-4581-8576-73240d54c94c'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = 'd8e51aaf-ebd9-4c5d-9599-39be6ca26a05'
const fakeAttachmentName = 'MY_SWEET_DB'

const fakeHerokuAppId = '3a0b2d79-0e9d-4a44-9729-757fde8156ba'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeOAuthPostRequestBody = {
  description: 'Borealis PG CLI plugin temporary auth token',
  expires_in: 180,
  scope: ['read', 'identity'],
}
const fakeOAuthPostResponseBody = {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}}

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

describe('PostgreSQL version upgrade cancellation command', () => {
  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
        .reply(200, {}))
    .command(['borealis-pg:upgrade:cancel', '--app', fakeHerokuAppName])
    .it('cancels an upgrade', ctx => {
      expect(ctx.stderr).to.contain(
        `Cancelling PostgreSQL major version upgrade for add-on ${fakeAddonName}... done`)
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
        .reply(400, {reason: 'Bad state!'}))
    .command(['borealis-pg:upgrade:cancel', '--app', fakeHerokuAppName])
    .catch('There is no PostgreSQL version upgrade in progress for add-on')
    .it('exits with an error when there is a bad request', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
        .reply(404, {reason: 'Not found!'}))
    .command(['borealis-pg:upgrade:cancel', '--app', fakeHerokuAppName])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error when the add-on does not exist', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
        .reply(422, {reason: 'Still provisioning!'}))
    .command(['borealis-pg:upgrade:cancel', '--app', fakeHerokuAppName])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error when the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
        .reply(500, {reason: 'Unexpected error!'}))
    .command(['borealis-pg:upgrade:cancel', '--app', fakeHerokuAppName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is a server-side error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
