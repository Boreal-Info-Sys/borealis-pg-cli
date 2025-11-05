import {consoleColours} from '../../../command-components'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonId = 'd5e50676-9b3d-4e46-bf7f-653169a1154b'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = '449cd296-020c-4339-a63c-932407d3b9a7'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = 'e80bd645-c817-4a8f-889c-2040fc4c424f'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt2 = 'my-second-fake-pg-extension'

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

describe('extension removal command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(200, {success: true}))
    .command([
      'borealis-pg:extensions:remove',
      '--confirm',
      fakeExt1,
      '--app',
      fakeHerokuAppName,
      fakeExt1,
    ])
    .it('removes the requested extension', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(404, {resourceType: 'extension'}))
    .command([
      'borealis-pg:extensions:remove',
      '--confirm',
      fakeExt1,
      '--app',
      fakeHerokuAppName,
      '--suppress-missing',
      fakeExt1,
    ])
    .it(
      'suppresses errors with the --suppress-missing option when an extension is not installed',
      ctx => {
        expect(ctx.stderr).to.contain(
          `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... !`)
        expect(ctx.stderr).to.contain(`Extension ${fakeExt1} is not installed`)
        expect(ctx.stdout).to.equal('')
      })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(200, {success: true}))
    .stdin(` ${fakeExt1} `, 1200) // Fakes keyboard input for the confirmation prompt
    .command(['borealis-pg:extensions:remove', '-a', fakeHerokuAppName, fakeExt1])
    .it('removes the requested extension after a successful confirmation prompt', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .stdin('WRONG!', 1200) // Fakes keyboard input for the confirmation prompt
    .command(['borealis-pg:extensions:remove', '-a', fakeHerokuAppName, fakeExt2])
    .catch(/^Invalid confirmation provided/)
    .it('exits with an error if the confirmation prompt fails', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      'WRONG!',
      '-a',
      fakeHerokuAppName,
      fakeExt2,
    ])
    .catch(/^Invalid confirmation provided/)
    .it('exits with an error if the --confirm option has the wrong value', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(404, {reason: 'Add-on does not exist', resourceType: 'addon'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(400, {reason: 'Extension has dependents'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])
    .catch(new RegExp(`^Extension .*${fakeExt1}.* has dependent extensions or objects`))
    .it('exits with an error if the extension has dependents', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt2}`)
        .reply(404, {reason: 'Extension does not exist', resourceType: 'extension'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt2,
      '-a',
      fakeHerokuAppName,
      fakeExt2,
    ])
    .catch(`Extension ${consoleColours.pgExtension(fakeExt2)} is not installed`)
    .it('exits with an error if the extension is not installed', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(422, {reason: 'Not ready yet'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error if the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(423, {reason: 'Locked'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])
    .catch('Add-on is undergoing a PostgreSQL major version upgrade')
    .it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt2}`)
        .reply(503, {reason: 'Something went wrong'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt2,
      '-a',
      fakeHerokuAppName,
      fakeExt2,
    ])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if the Borealis PG API indicates a server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:remove', '-a', fakeHerokuAppName])
    .catch(/^Missing 1 required arg:/)
    .it('exits with an error if there is no Postgres extension argument', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
