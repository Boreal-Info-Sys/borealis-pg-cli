import {runCommand} from '@oclif/test'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

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
const fakeOAuthPostResponseBody = {
  id: fakeHerokuAuthId,
  access_token: {token: fakeHerokuAuthToken},
}

describe('PostgreSQL version upgrade cancellation command', () => {
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

  it('cancels an upgrade', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
      .reply(200, {})

    const {stderr, error} = await runCommand([
      'borealis-pg:upgrade:cancel',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stderr.trim()).to.endWith(
      'It may be several minutes before the add-on is ready to try another upgrade.',
    )
    expect(error).to.be.undefined
    expect(nock.pendingMocks()).to.be.empty
  })

  it('exits with an error when there is a bad request', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
      .reply(400, {reason: 'Bad state!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:cancel',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain(
      'There is no PostgreSQL version upgrade in progress for add-on',
    )
  })

  it('exits with an error when the add-on does not exist', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
      .reply(404, {reason: 'Not found!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:cancel',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error when the add-on is not fully provisioned', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
      .reply(422, {reason: 'Still provisioning!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:cancel',
      '--app',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error when there is a server-side error', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .delete(`/heroku/resources/${fakeAddonName}/pg-version-upgrades/current`)
      .reply(500, {reason: 'Unexpected error!'})

    const {stdout, error} = await runCommand([
      'borealis-pg:upgrade:cancel',
      '-a',
      fakeHerokuAppName,
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
