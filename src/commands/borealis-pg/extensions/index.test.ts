import {runCommand} from '@oclif/test'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

const fakeAddonId = '0818035e-0103-4f85-880d-c3b4a712cf8d'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = 'eaa7f0f9-9562-4ba3-b8dc-3c488ad73666'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = '2ee2aea8-9a2f-48b2-8f86-b4aa504b35f7'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt1Schema = 'my-first-fake-db-schema'
const fakeExt1Version = '16.8.5'

const fakeExt2 = 'my-second-fake-pg-extension'
const fakeExt2Schema = 'my-second-fake-db-schema'
const fakeExt2Version = '0.7.15'

describe('extension list command', () => {
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
      ])
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('outputs the list of installed extensions', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(200, {
        extensions: [
          {name: fakeExt1, schema: fakeExt1Schema, version: fakeExt1Version},
          {name: fakeExt2, schema: fakeExt2Schema, version: fakeExt2Version},
        ],
      })

    const {stdout, error} = await runCommand(['borealis-pg:extensions', '--app', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces('| Name | Version | Schema |\n')
    expect(stdout).to.containIgnoreSpaces(
      `| ${fakeExt1} | ${fakeExt1Version} | ${fakeExt1Schema} |\n` +
        `| ${fakeExt2} | ${fakeExt2Version} | ${fakeExt2Schema} |\n`,
    )

    expect(error).to.be.undefined
  })

  it('outputs a warning if there are no extensions', async () => {
    nock(borealisPgApiBaseUrl)
      .get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(200, {extensions: []})

    const {stdout, stderr, error} = await runCommand([
      'borealis-pg:extensions',
      '-a',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(stderr.trim()).to.endWith('Warning: No extensions found')
    expect(error).to.be.undefined
  })

  it('exits with an error if the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl)
      .get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(404, {reason: 'Does not exist'})

    const {stdout, error} = await runCommand(['borealis-pg:extensions', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error if the add-on is not done provisioning', async () => {
    nock(borealisPgApiBaseUrl)
      .get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(422, {reason: 'Not ready yet'})

    const {stdout, error} = await runCommand(['borealis-pg:extensions', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error if the Borealis PG API indicates a server error', async () => {
    nock(borealisPgApiBaseUrl)
      .get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
      .reply(500, {reason: 'Something went wrong'})

    const {stdout, error} = await runCommand(['borealis-pg:extensions', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
