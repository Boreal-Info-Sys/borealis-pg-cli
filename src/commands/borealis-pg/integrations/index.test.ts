import {DateTime} from 'luxon'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonId = '0818035e-0103-4f85-880d-c3b4a712cf8d'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = 'eaa7f0f9-9562-4ba3-b8dc-3c488ad73666'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = '2ee2aea8-9a2f-48b2-8f86-b4aa504b35f7'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeIntegration1Name = 'my-first-fake-integration'
const fakeIntegration1DbUsername = 'my-first-fake-integration-db-user'
const fakeIntegration1SshUsername = 'my-first-fake-integration-ssh-user'
const fakeIntegration1WriteAccess = true
const fakeIntegration1CreatedAt = '2023-01-23T09:44:27.023Z'

const fakeIntegration2Name = 'my-second-fake-integration'
const fakeIntegration2DbUsername = 'my-second-fake-integration-db-user'
const fakeIntegration2SshUsername = 'my-second-fake-integration-ssh-user'
const fakeIntegration2WriteAccess = false
const fakeIntegration2CreatedAt = '2023-02-15T13:05:59.817Z'

const defaultTestContext = test.stdout()
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
        id: '362885fa-b06b-434d-b3eb-a0ac53e3f840',
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

describe('data integration list command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/data-integrations`)
        .reply(200, {
          integrations: [
            {
              name: fakeIntegration1Name,
              dbUsername: fakeIntegration1DbUsername,
              sshUsername: fakeIntegration1SshUsername,
              writeAccess: fakeIntegration1WriteAccess,
              createdAt: fakeIntegration1CreatedAt,
            },
            {
              name: fakeIntegration2Name,
              dbUsername: fakeIntegration2DbUsername,
              sshUsername: fakeIntegration2SshUsername,
              writeAccess: fakeIntegration2WriteAccess,
              createdAt: fakeIntegration2CreatedAt,
            },
          ],
        }))
    .command(['borealis-pg:integrations', '--app', fakeHerokuAppName])
    .it('outputs the list of registered data integrations', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching data integration list for add-on ${fakeAddonName}... done\n`)

      expect(ctx.stdout).to.containIgnoreSpaces(
        '| Data Integration | DB Username | SSH Username | Write Access | Created At |')
      expect(ctx.stdout).to.containIgnoreSpaces(
        `| ${fakeIntegration1Name} | ${fakeIntegration1DbUsername} | ${fakeIntegration1SshUsername} | ${fakeIntegration1WriteAccess} | ${DateTime.fromISO(fakeIntegration1CreatedAt).toISO()} |\n` +
        `| ${fakeIntegration2Name} | ${fakeIntegration2DbUsername} | ${fakeIntegration2SshUsername} | ${fakeIntegration2WriteAccess} | ${DateTime.fromISO(fakeIntegration2CreatedAt).toISO()} |`)
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/data-integrations`)
        .reply(200, {integrations: []}))
    .command(['borealis-pg:integrations', '-a', fakeHerokuAppName])
    .it('outputs a warning if there are no data integrations', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching data integration list for add-on ${fakeAddonName}... done\n` +
        ' ›   Warning: No data integrations found\n')
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/data-integrations`)
        .reply(404, {reason: 'Does not exist'}))
    .command(['borealis-pg:integrations', '-a', fakeHerokuAppName])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/data-integrations`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:integrations', '-a', fakeHerokuAppName])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error if the add-on is not done provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/data-integrations`)
        .reply(500, {reason: 'Something went wrong'}))
    .command(['borealis-pg:integrations', '-a', fakeHerokuAppName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if the Borealis PG API indicates a server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
