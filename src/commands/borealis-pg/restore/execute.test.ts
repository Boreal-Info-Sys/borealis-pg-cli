import {runCommand} from '@oclif/test'
import nock from 'nock'
import {anything, capture, instance, mock, verify} from 'ts-mockito'
import {componentServices} from '../../../command-components'
import {borealisApiOptions} from '../../../borealis-api'
import {herokuApiOptions} from '../../../heroku-api'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../../test-utils'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeSourceAddonId = 'bde71749-e560-42d7-b9ab-ccb6d91b17b5'
const fakeSourceAddonName = 'borealis-pg-my-fake-source-addon'

const fakeSourceAttachmentId = '8c76b180-afb4-41fe-8f8d-79bfc8d0e3fa'
const fakeSourceAttachmentName = 'MY_RADICAL_DB'

const fakeSourceHerokuAppId = '8fd84217-35ed-4e44-96dd-bfb8c4471721'
const fakeSourceHerokuAppName = 'my-fake-source-heroku-app'

const fakeSourcePlanId = '6380f9af-3952-407c-9bdf-f087bf134ccf'
const fakeSourcePlanName = 'my-fake-source-plan'

const fakeDbRestoreToken = 'my-cool-db-restore-token'
const fakeRestoreToTime = '2023-02-28T07:24:35.819-08:00'

const fakeDestinationHerokuAppId = '990c9431-0ac2-4e7b-a43e-a9fc45582f9a'
const fakeDestinationHerokuAppName = 'my-fake-destination-heroku-app'

const fakeNewPlanId = 'ca328398-c2f1-4dc1-bc59-93956e0c1811'
const fakeNewPlanName = 'my-fake-new-plan'

const fakeNewAddonName = 'my-nifty-new-addon'
const fakeNewAttachmentName = 'MY_RESTORED_DB'

const fakeOAuthPostRequestBody = {
  description: 'Borealis PG CLI plugin temporary auth token',
  expires_in: 180,
  scope: ['read', 'identity'],
}
const fakeOAuthPostResponseBody = {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}}

describe('database restore execution command', () => {
  let originalBorealisPollInterval: number
  let originalHerokuPollInterval: number
  let originalNotifier: typeof componentServices.notifier

  let mockNotifierType: typeof componentServices.notifier

  beforeEach(() => {
    originalBorealisPollInterval = borealisApiOptions.addonStatePollIntervalMs
    originalHerokuPollInterval = herokuApiOptions.addonStatePollIntervalMs
    originalNotifier = componentServices.notifier

    // Prevents long delays during tests that wait
    borealisApiOptions.addonStatePollIntervalMs = 10
    herokuApiOptions.addonStatePollIntervalMs = 10

    mockNotifierType = mock()
    componentServices.notifier = instance(mockNotifierType)

    nock(herokuApiBaseUrl)
      .post('/oauth/authorizations', fakeOAuthPostRequestBody)
      .reply(201, fakeOAuthPostResponseBody)
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200)
      .get(`/apps/${fakeSourceHerokuAppName}/addons`)
      .reply(200, [
        {
          addon_service: {name: 'other-addon-service'},
          id: '8555365d-0164-4796-ba5a-a1517baee077',
          name: 'other-addon',
        },
        {addon_service: {name: 'borealis-pg'}, id: fakeSourceAddonId, name: fakeSourceAddonName},
      ])
      .get(`/addons/${fakeSourceAddonId}/addon-attachments`)
      .reply(200, [
        {
          addon: {id: fakeSourceAddonId, name: fakeSourceAddonName},
          app: {id: fakeSourceHerokuAppId, name: fakeSourceHerokuAppName},
          id: fakeSourceAttachmentId,
          name: fakeSourceAttachmentName,
        },
      ])
      .get(`/addons/${fakeSourceAddonName}`)
      .reply(
        200,
        {
          app: {id: fakeSourceHerokuAppId, name: fakeSourceHerokuAppName},
          plan: {id: fakeSourcePlanId, name: fakeSourcePlanName},
        })
  })

  afterEach(() => {
    borealisApiOptions.addonStatePollIntervalMs = originalBorealisPollInterval
    herokuApiOptions.addonStatePollIntervalMs = originalHerokuPollInterval
    componentServices.notifier = originalNotifier

    nock.cleanAll()
  })

  it('clones the add-on database with all default options', async () => {
    nock(herokuApiBaseUrl)
      .post(
        `/apps/${fakeSourceHerokuAppName}/addons`,
        {
          config: {'restore-token': fakeDbRestoreToken},
          plan: `borealis-pg:${fakeSourcePlanName}`,
        })
      .reply(201, {name: fakeNewAddonName})

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(201, {restoreToken: fakeDbRestoreToken})

    const {stdout, stderr} = await runCommand(
      ['borealis-pg:restore:execute', '--app', fakeSourceHerokuAppName])

    expect(stderr).to.contain(`Starting clone of add-on ${fakeSourceAddonName}... done`)
    expect(stderr).to.contain(
      `${fakeNewAddonName} is being created on ⬢ ${fakeSourceHerokuAppName} in the background`)

    expect(stdout).to.equal('')

    verify(mockNotifierType.notify(anything())).never()

    expect(nock.pendingMocks()).to.be.empty
  })

  it('restores the add-on database with all custom options', async () => {
    nock(herokuApiBaseUrl)
      .post(
        `/apps/${fakeDestinationHerokuAppName}/addons`,
        {
          attachment: {name: fakeNewAttachmentName},
          config: {'restore-to-time': fakeRestoreToTime, 'restore-token': fakeDbRestoreToken},
          plan: `borealis-pg:${fakeNewPlanName}`,
        })
      .reply(201, {name: fakeNewAddonName})
      .get(`/addons/${fakeNewAddonName}`).times(4)
      .reply( // Responses while waiting for provisioning
        200,
        {
          app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
          plan: {id: fakeNewPlanId, name: fakeNewPlanName},
          state: 'provisioning',
        })
      .get(`/addons/${fakeNewAddonName}`)
      .reply( // Response when provisioning is finished
        200,
        {
          app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
          plan: {id: fakeNewPlanId, name: fakeNewPlanName},
          state: 'provisioned',
        })
      .post('/oauth/authorizations', fakeOAuthPostRequestBody)
      .reply(201, fakeOAuthPostResponseBody)
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200)

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(201, {restoreToken: fakeDbRestoreToken})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(200, {status: 'available'})

    const {stdout, stderr} = await runCommand([
      'borealis-pg:restore:execute',
      '--app',
      fakeSourceHerokuAppName,
      '--as',
      fakeNewAttachmentName,
      '--destination-app',
      fakeDestinationHerokuAppName,
      '--new-plan',
      fakeNewPlanName,
      '--restore-to-time',
      fakeRestoreToTime,
      '--wait',
    ])

    expect(stderr).to.contain(`Starting restore of add-on ${fakeSourceAddonName}... done`)
    expect(stderr).to.contain(
      `Creating add-on ${fakeNewAddonName} on ⬢ ${fakeDestinationHerokuAppName}... done`)

    expect(stdout).to.equal('')

    verify(mockNotifierType.notify(anything())).once()
    const [notification] = capture(mockNotifierType.notify).last()
    expect(notification).to.deep.equal({
      message: `Add-on ${fakeNewAddonName} is available`,
      sound: true,
      title: 'borealis-pg-cli',
      timeout: false,
    })

    expect(nock.pendingMocks()).to.be.empty
  })

  it('restores the add-on database when provisioning runs into overtime', async () => {
    nock(herokuApiBaseUrl)
      .post(
        `/apps/${fakeDestinationHerokuAppName}/addons`,
        {
          config: {'restore-to-time': fakeRestoreToTime, 'restore-token': fakeDbRestoreToken},
          plan: `borealis-pg:${fakeNewPlanName}`,
        })
      .reply(201, {name: fakeNewAddonName})
      .get(`/addons/${fakeNewAddonName}`)
      .reply( // Responses while waiting for Heroku provisioning
        200,
        {
          app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
          plan: {id: fakeNewPlanId, name: fakeNewPlanName},
          state: 'provisioning',
        })
      .get(`/addons/${fakeNewAddonName}`)
      .reply( // Response when Heroku provisioning is finished
        200,
        {
          app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
          plan: {id: fakeNewPlanId, name: fakeNewPlanName},
          state: 'provisioned',
        })
      .post('/oauth/authorizations', fakeOAuthPostRequestBody).times(6)
      .reply(201, fakeOAuthPostResponseBody)
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`).times(6)
      .reply(200)

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(201, {restoreToken: fakeDbRestoreToken})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(200, {status: 'requested'})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(200, {status: 'provisioning'})
      .get(`/heroku/resources/${fakeNewAddonName}`).times(2)
      .reply(200, {status: 'awaiting'})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(200, {status: 'configuring'})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(200, {status: 'available'})

    const {stdout, stderr} = await runCommand([
      'borealis-pg:restore:execute',
      '-a',
      fakeSourceHerokuAppName,
      '-d',
      fakeDestinationHerokuAppName,
      '-n',
      fakeNewPlanName,
      '-t',
      fakeRestoreToTime,
      '--wait',
    ])

    expect(stdout).to.equal('')

    expect(stderr).to.contain(`Starting restore of add-on ${fakeSourceAddonName}... done`)
    expect(stderr).to.contain(
      `Creating add-on ${fakeNewAddonName} on ⬢ ${fakeDestinationHerokuAppName}... done`)

    verify(mockNotifierType.notify(anything())).once()
    const [notification] = capture(mockNotifierType.notify).last()
    expect(notification).to.deep.equal({
      message: `Add-on ${fakeNewAddonName} is available`,
      sound: true,
      title: 'borealis-pg-cli',
      timeout: false,
    })

    expect(nock.pendingMocks()).to.be.empty
  })

  it('accepts a fully qualified plan name option', async () => {
    nock(herokuApiBaseUrl)
      .post(
        `/apps/${fakeSourceHerokuAppName}/addons`,
        {
          config: {'restore-token': fakeDbRestoreToken},
          plan: `borealis-pg:${fakeNewPlanName}`,
        })
      .reply(201, {name: fakeNewAddonName})

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(201, {restoreToken: fakeDbRestoreToken})

    const {stdout, stderr} = await runCommand([
      'borealis-pg:restore:execute',
      '-a',
      fakeSourceHerokuAppName,
      '-n',
      `borealis-pg:${fakeNewPlanName}`,
    ])

    expect(stdout).to.equal('')

    expect(stderr).to.contain(`Starting clone of add-on ${fakeSourceAddonName}... done`)
    expect(stderr).to.match(new RegExp(
      `.*${fakeNewAddonName} is being created on (⬢ )?${fakeSourceHerokuAppName} in the background.*`))

    verify(mockNotifierType.notify(anything())).never()

    expect(nock.pendingMocks()).to.be.empty
  })

  it('exits with an error when the add-on is deprovisioned while waiting for it', async () => {
    nock(herokuApiBaseUrl)
      .post(
        `/apps/${fakeDestinationHerokuAppName}/addons`,
        {
          config: {'restore-to-time': fakeRestoreToTime, 'restore-token': fakeDbRestoreToken},
          plan: `borealis-pg:${fakeNewPlanName}`,
        })
      .reply(201, {name: fakeNewAddonName})
      .get(`/addons/${fakeNewAddonName}`)
      .reply( // Response when Heroku provisioning is finished
        200,
        {
          app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
          plan: {id: fakeNewPlanId, name: fakeNewPlanName},
          state: 'provisioned',
        })
      .post('/oauth/authorizations', fakeOAuthPostRequestBody).times(2)
      .reply(201, fakeOAuthPostResponseBody)
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`).times(2)
      .reply(200)

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(201, {restoreToken: fakeDbRestoreToken})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(200, {status: 'awaiting'})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(404, {reason: 'Not found!'})

    const {stdout, stderr, error} = await runCommand([
      'borealis-pg:restore:execute',
      '-a',
      fakeSourceHerokuAppName,
      '-d',
      fakeDestinationHerokuAppName,
      '-n',
      fakeNewPlanName,
      '-t',
      fakeRestoreToTime,
      '--wait',
    ])

    expect(stdout).to.equal('')

    expect(stderr).to.contain(`Starting restore of add-on ${fakeSourceAddonName}... done`)
    expect(stderr).to.match(new RegExp(
      `.*Creating add-on ${fakeNewAddonName} on (⬢ )?${fakeDestinationHerokuAppName}... !.*`))

    expect(error?.message).to.contain('Provisioning cancelled. The new add-on was deprovisioned.')

    verify(mockNotifierType.notify(anything())).once()
    const [notification] = capture(mockNotifierType.notify).last()
    expect(notification).to.deep.equal({
      message: `Add-on ${fakeNewAddonName} was cancelled`,
      sound: true,
      title: 'borealis-pg-cli',
      timeout: false,
    })

    expect(nock.pendingMocks()).to.be.empty
  })

  it('exits with an error when there is a Borealis API error checking add-on status', async () => {
    nock(herokuApiBaseUrl)
      .post(
        `/apps/${fakeDestinationHerokuAppName}/addons`,
        {
          config: {'restore-to-time': fakeRestoreToTime, 'restore-token': fakeDbRestoreToken},
          plan: `borealis-pg:${fakeNewPlanName}`,
        })
      .reply(201, {name: fakeNewAddonName})
      .get(`/addons/${fakeNewAddonName}`)
      .reply( // Response when Heroku provisioning is finished
        200,
        {
          app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
          plan: {id: fakeNewPlanId, name: fakeNewPlanName},
          state: 'provisioned',
        })
      .post('/oauth/authorizations', fakeOAuthPostRequestBody)
      .reply(201, fakeOAuthPostResponseBody)
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200)

    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(201, {restoreToken: fakeDbRestoreToken})
      .get(`/heroku/resources/${fakeNewAddonName}`)
      .reply(500, {reason: 'Internal error!'})

    const {stdout, stderr, error} = await runCommand([
      'borealis-pg:restore:execute',
      '-a',
      fakeSourceHerokuAppName,
      '-d',
      fakeDestinationHerokuAppName,
      '-n',
      fakeNewPlanName,
      '-t',
      fakeRestoreToTime,
      '--wait',
    ])

    expect(stdout).to.equal('')

    expect(stderr).to.contain(`Starting restore of add-on ${fakeSourceAddonName}... done`)
    expect(stderr).to.match(new RegExp(
      `.*Creating add-on ${fakeNewAddonName} on (⬢ )?${fakeDestinationHerokuAppName}... !.*`))

    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')

    verify(mockNotifierType.notify(anything())).never()

    expect(nock.pendingMocks()).to.be.empty
  })

  it('rejects a restore to time that is not an ISO 8601 date/time string', async () => {
    const {stdout, error} = await runCommand([
      'borealis-pg:restore:execute',
      '-a',
      fakeSourceHerokuAppName,
      '-t',
      'January 15, 2023 12:07:41pm',
    ])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Expected an ISO 8601 date/time string')

    verify(mockNotifierType.notify(anything())).never()
  })

  it('exits with an error when the add-on has a multi-tenant plan', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(400, {reason: 'Multi-tenant plans are not supported!'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Multi-tenant plans are not supported!')
  })

  it('exits with an error when the add-on does not exist', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(404, {reason: 'Not found!'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error when the add-on is not fully provisioned', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(422, {reason: 'Still provisioning!'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not finished provisioning')
  })

  it('exits with an error when there is a server-side error', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(500, {reason: 'Internal server error!'})

    const {stdout, error} = await runCommand(
      ['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
