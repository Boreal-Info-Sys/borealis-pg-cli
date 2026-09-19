import {runCommand} from '@oclif/test'
import {MockSTDIN, stdin} from 'mock-stdin'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

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

describe('extension removal command', () => {
  let mockStdin: MockSTDIN

  beforeEach(() => {
    mockStdin = stdin()

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
      ])
  })

  afterEach(() => {
    mockStdin.reset(true)
    nock.cleanAll()
  })

  it('removes the requested extension', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
      .reply(200, {success: true})

    const {stdout, stderr} = await runCommand([
      'borealis-pg:extensions:remove',
      '--confirm',
      fakeExt1,
      '--app',
      fakeHerokuAppName,
      fakeExt1,
    ])

    expect(stderr).to.endWith(
      `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... done\n`)
    expect(stdout).to.equal('')
    expect(nock.pendingMocks()).to.be.empty
  })

  it(
    'suppresses errors with the --suppress-missing option when an extension is not installed',
    async () => {
      nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
        .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(404, {resourceType: 'extension'})

      const {stdout, stderr} = await runCommand([
        'borealis-pg:extensions:remove',
        '--confirm',
        fakeExt1,
        '--app',
        fakeHerokuAppName,
        '--suppress-missing',
        fakeExt1,
      ])

      expect(stderr).to.contain(
        `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... !`)
      expect(stderr).to.contain(`Extension ${fakeExt1} is not installed`)
      expect(stdout).to.equal('')
      expect(nock.pendingMocks()).to.be.empty
    })

  it('removes the requested extension after a successful confirmation prompt', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
      .reply(200, {success: true})

    setTimeout(() => mockStdin.send(` ${fakeExt1} \n`), 1000)

    const {stderr} = await runCommand(
      ['borealis-pg:extensions:remove', '-a', fakeHerokuAppName, fakeExt1])

    expect(stderr).to.endWith(
      `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... done\n`)
    expect(nock.pendingMocks()).to.be.empty
  })

  it('exits with an error if the confirmation prompt fails', async () => {
    setTimeout(() => mockStdin.send('WRONG!\n'), 1000)

    const {error} = await runCommand(
      ['borealis-pg:extensions:remove', '-a', fakeHerokuAppName, fakeExt2])

    expect(error?.message).to.contain('Invalid confirmation provided')
  })

  it('exits with an error if the --confirm option has the wrong value', async () => {
    const {error} = await runCommand([
      'borealis-pg:extensions:remove',
      '-c',
      'WRONG!',
      '-a',
      fakeHerokuAppName,
      fakeExt2,
    ])

    expect(error?.message).to.contain('Invalid confirmation provided')
  })

  it('exits with an error if the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl)
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
      .reply(404, {reason: 'Add-on does not exist', resourceType: 'addon'})

    const {error} = await runCommand([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])

    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error if the extension has dependents', async () => {
    nock(borealisPgApiBaseUrl)
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
      .reply(400, {reason: 'Extension has dependents'})

    const {error} = await runCommand([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])

    expect(error?.message).to.contain(`Extension ${fakeExt1} has dependent extensions or objects`)
  })

  it('exits with an error if the extension is not installed', async () => {
    nock(borealisPgApiBaseUrl)
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt2}`)
      .reply(404, {reason: 'Extension does not exist', resourceType: 'extension'})

    const {error} = await runCommand([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt2,
      '-a',
      fakeHerokuAppName,
      fakeExt2,
    ])

    expect(error?.message).to.contain(`Extension ${fakeExt2} is not installed`)
  })

  it('exits with an error if the add-on is not fully provisioned', async () => {
    nock(borealisPgApiBaseUrl)
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
      .reply(422, {reason: 'Not ready yet'})

    const {error} = await runCommand([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])

    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error if the add-on is undergoing a PostgreSQL version upgrade', async () => {
    nock(borealisPgApiBaseUrl)
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
      .reply(423, {reason: 'Locked'})

    const {error} = await runCommand([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-a',
      fakeHerokuAppName,
      fakeExt1,
    ])

    expect(error?.message).to.contain('Add-on is undergoing a PostgreSQL major version upgrade')
  })

  it('exits with an error if the Borealis PG API indicates a server error', async () => {
    nock(borealisPgApiBaseUrl)
      .delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt2}`)
      .reply(503, {reason: 'Something went wrong'})

    const {error} = await runCommand([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt2,
      '-a',
      fakeHerokuAppName,
      fakeExt2,
    ])

    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })

  it('exits with an error if there is no Postgres extension argument', async () => {
    const {error} = await runCommand(['borealis-pg:extensions:remove', '-a', fakeHerokuAppName])

    expect(error?.message).to.contain('Missing 1 required arg')
  })
})
