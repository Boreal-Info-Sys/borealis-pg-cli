import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonId = 'd5e50676-9b3d-4e46-bf7f-653169a1154b'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = '449cd296-020c-4339-a63c-932407d3b9a7'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = 'e80bd645-c817-4a8f-889c-2040fc4c424f'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeIntegration1 = 'my-first-fake-data-integration'
const fakeIntegration2 = 'my-second-fake-data-integration'

const defaultTestContext = test.stdout()
  .stderr()
  .nock(
    herokuApiBaseUrl,
    api => api
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
          id: 'c9c5f62e-8849-4ac4-bda1-3a3f3f17c3ac',
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

describe('data integration removal command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration1}`)
        .reply(200, {success: true}))
    .command([
      'borealis-pg:integrations:remove',
      '--confirm',
      fakeIntegration1,
      '--app',
      fakeHerokuAppName,
      '--name',
      fakeIntegration1,
    ])
    .it('removes the requested data integration', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing data integration from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration1}`)
        .reply(200, {success: true}))
    .command([
      'borealis-pg:integrations:deregister',
      '-c',
      fakeIntegration1,
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegration1,
    ])
    .it('removes the requested data integration via the command alias', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing data integration from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration1}`)
        .reply(200, {success: true}))
    .stdin(` ${fakeIntegration1} `, 1200) // Fakes keyboard input for the confirmation prompt
    .command(['borealis-pg:integrations:remove', '-a', fakeHerokuAppName, '-n', fakeIntegration1])
    .it('removes the requested data integration after a successful confirmation prompt', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing data integration from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .stdin('WRONG!', 1200) // Fakes keyboard input for the confirmation prompt
    .command(['borealis-pg:integrations:remove', '-a', fakeHerokuAppName, '-n', fakeIntegration2])
    .catch(/^Invalid confirmation provided/)
    .it('exits with an error if the confirmation prompt fails', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command([
      'borealis-pg:integrations:remove',
      '-c',
      'WRONG!',
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegration2,
    ])
    .catch(/^Invalid confirmation provided/)
    .it('exits with an error if the --confirm option has the wrong value', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration2}`)
        .reply(403, {reason: 'DB write access revoked!'}))
    .command([
      'borealis-pg:integrations:remove',
      '-c',
      fakeIntegration2,
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegration2,
    ])
    .catch('Add-on database write access has been revoked')
    .it('exits with an error if add-on DB write access has been revoked', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration2}`)
        .reply(404, {reason: 'That data integration could not be found'}))
    .command([
      'borealis-pg:integrations:remove',
      '-c',
      fakeIntegration2,
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegration2,
    ])
    .catch('Data integration does not exist')
    .it('exits with an error if the data integration is not register', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration1}`)
        .reply(422, {reason: 'Not ready yet'}))
    .command([
      'borealis-pg:integrations:remove',
      '-c',
      fakeIntegration1,
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegration1,
    ])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error if the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration1}`)
        .reply(423, {reason: 'Locked'}))
    .command([
      'borealis-pg:integrations:remove',
      '-c',
      fakeIntegration1,
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegration1,
    ])
    .catch('Add-on is undergoing a PostgreSQL major version upgrade')
    .it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/data-integrations/${fakeIntegration2}`)
        .reply(503, {reason: 'Something went wrong'}))
    .command([
      'borealis-pg:integrations:remove',
      '-c',
      fakeIntegration2,
      '-a',
      fakeHerokuAppName,
      '-n',
      fakeIntegration2,
    ])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if the Borealis PG API indicates a server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:integrations:remove', '-a', fakeHerokuAppName])
    .catch(/.*Missing required flag name.*/)
    .it('exits with an error if the data integration option is missing', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
