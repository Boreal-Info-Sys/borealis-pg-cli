import {runCommand} from '@oclif/test'
import {DateTime} from 'luxon'
import nock from 'nock'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl} from '../../test-utils'

const fakeAddonId = '330ab3c7-faf5-4da7-98ed-d1eac0983372'
const fakeAddonName = 'my-super-neat-fake-addon'

const fakeAttachmentId = '1fb51235-686d-4ded-80f1-fb8b3d4839d0'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'

const fakeHerokuAppId = 'fdedc223-6782-40c1-8431-0a65348732f5'
const fakeHerokuAppName = 'my-super-neat-fake-app'

const fakeAppDbName = 'my-super-neat-fake-app-db'
const fakeCreatedAt = '2022-06-30T23:52:14.019Z'
const fakePlanName = 'my-super-neat-fake-plan'
const fakePostgresVersion = '14.4'
const fakeStorageComplianceDeadline = '2022-07-08T18:40:38.193-07:00'

const fakeRestoreSourceAddonName = 'my-pretty-okay-source-addon'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

describe('add-on info command', () => {
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
          id: '046a3ad2-61bd-41e4-aa46-b9b9c88a7c18',
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

  it('displays details of a single tenant add-on', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: fakeAppDbName,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 21_474_836_480,
          dbStorageUsageBytes: 4_582_038_115,
          dbTenancyType: 'isolated',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'us-east-1',
          replicaQuantity: 2,
          status: 'available',
          restoreSourceAddonName: null,
          storageComplianceDeadline: null,
          storageComplianceStatus: 'ok',
        })

    const {stdout, error} = await runCommand(['borealis-pg:info', '--app', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: Available')
    expect(stdout).to.containIgnoreSpaces('Region: N. Virginia (United States)')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: Single Tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 4.3 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 2')
    expect(stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces('Restored/Cloned From Add-on: N/A')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: OK')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')

    expect(error).to.be.undefined
  })

  it('displays details of a multi-tenant add-on', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: fakeAppDbName,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 268_435_456,
          dbStorageUsageBytes: 251_274_003,
          dbTenancyType: 'shared',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'eu-west-1',
          replicaQuantity: 0,
          status: 'requested',
          restoreSourceAddonName: null,
          storageComplianceDeadline: null,
          storageComplianceStatus: 'proximity-warning',
        })

    const {stdout, error} = await runCommand(['borealis-pg:info', '-a', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: Requested')
    expect(stdout).to.containIgnoreSpaces('Region: Ireland (Europe)')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: Multi-tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 0.25 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 0.234 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
    expect(stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces('Restored/Cloned From Add-on: N/A')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: Proximity Warning')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')

    expect(error).to.be.undefined
  })

  it('displays details when called using the borealis-pg (index) alias', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: fakeAppDbName,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 21_474_836_480,
          dbStorageUsageBytes: 4_582_038_115,
          dbTenancyType: 'isolated',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'ap-southeast-2',
          replicaQuantity: 0,
          status: 'maintenance-plan-change',
          restoreSourceAddonName: null,
          storageComplianceDeadline: null,
          storageComplianceStatus: 'ok',
        })

    const {stdout, error} = await runCommand(['borealis-pg', '-a', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: Changing add-on plan')
    expect(stdout).to.containIgnoreSpaces('Region: Sydney')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: Single Tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 4.3 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
    expect(stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces('Restored/Cloned From Add-on: N/A')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: OK')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')

    expect(error).to.be.undefined
  })

  it('displays details when the add-on has been restored/cloned from another add-on', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: fakeAppDbName,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 644_245_094,
          dbStorageUsageBytes: 139_586_437,
          dbTenancyType: 'isolated',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'us-west-2',
          replicaQuantity: 1,
          status: 'provisioning',
          restoreSourceAddonName: fakeRestoreSourceAddonName,
          storageComplianceDeadline: null,
          storageComplianceStatus: 'ok',
        })

    const {stdout, error} = await runCommand(['borealis-pg:info', '-a', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: Provisioning')
    expect(stdout).to.containIgnoreSpaces('Region: Oregon')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: Single Tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 0.60 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 0.130 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 1')
    expect(stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces(
      `Restored/Cloned From Add-on: ${fakeRestoreSourceAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: OK')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')

    expect(error).to.be.undefined
  })

  it('displays raw values for custom values in the response', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: fakeAppDbName,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 536_870_912_000,
          dbStorageUsageBytes: 92_234_422_682,
          dbTenancyType: 'hyper-tenant',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'mars-orbit-1',
          replicaQuantity: 1,
          status: 'under-the-weather',
          restoreSourceAddonName: null,
          storageComplianceDeadline: null,
          storageComplianceStatus: 'super-duper',
        })

    const {stdout, error} = await runCommand(['borealis-pg:info', '-a', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: under-the-weather')
    expect(stdout).to.containIgnoreSpaces('Region: mars-orbit-1')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: hyper-tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 500 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 85.9 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 1')
    expect(stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces('Restored/Cloned From Add-on: N/A')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: super-duper')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')

    expect(error).to.be.undefined
  })

  it('displays details when the add-on is not finished provisioning', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: null,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 21_474_836_480,
          dbStorageUsageBytes: 0,
          dbTenancyType: 'isolated',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'us-east-1',
          replicaQuantity: 2,
          status: 'awaiting',
          restoreSourceAddonName: null,
          storageComplianceDeadline: null,
          storageComplianceStatus: 'ok',
        })

    const {stdout, error} = await runCommand(['borealis-pg:info', '-a', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: Provisioning')
    expect(stdout).to.containIgnoreSpaces('Region: N. Virginia (United States)')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: Single Tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 0.000 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 2')
    expect(stdout).to.containIgnoreSpaces('App DB Name: (pending)')
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces('Restored/Cloned From Add-on: N/A')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: OK')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')

    expect(error).to.be.undefined
  })

  it('displays details for an add-on with a storage compliance violation', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: fakeAppDbName,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 21_474_836_480,
          dbStorageUsageBytes: 4_582_038_115,
          dbTenancyType: 'isolated',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'ap-northeast-1',
          replicaQuantity: 0,
          status: 'maintenance',
          restoreSourceAddonName: null,
          storageComplianceDeadline: fakeStorageComplianceDeadline,
          storageComplianceStatus: 'violating',
        })

    const {stdout, error} = await runCommand(['borealis-pg:info', '-a', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: Undergoing maintenance')
    expect(stdout).to.containIgnoreSpaces('Region: Tokyo')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: Single Tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 4.3 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
    expect(stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces('Restored/Cloned From Add-on: N/A')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: Violating')
    expect(stdout).to.containIgnoreSpaces(
      `Storage Compliance Deadline: ${DateTime.fromISO(fakeStorageComplianceDeadline).toISO()}`)

    expect(error).to.be.undefined
  })

  it('displays details for an add-on with a storage compliance status of restricted', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(
        200,
        {
          addonName: fakeAddonName,
          appDbName: fakeAppDbName,
          createdAt: fakeCreatedAt,
          dbStorageMaxBytes: 644_245_094,
          dbStorageUsageBytes: 139_586_437,
          dbTenancyType: 'isolated',
          planName: fakePlanName,
          postgresVersion: fakePostgresVersion,
          region: 'eu-central-1',
          replicaQuantity: 0,
          status: 'maintenance-revoke-db-write-access',
          restoreSourceAddonName: null,
          storageComplianceDeadline: null,
          storageComplianceStatus: 'restricted',
        })

    const {stdout, error} = await runCommand(['borealis-pg:info', '-a', fakeHerokuAppName])

    expect(stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
    expect(stdout).to.containIgnoreSpaces('Status: Revoking DB write access')
    expect(stdout).to.containIgnoreSpaces('Region: Frankfurt')
    expect(stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
    expect(stdout).to.containIgnoreSpaces('Environment: Single Tenant')
    expect(stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
    expect(stdout).to.containIgnoreSpaces('Maximum Storage: 0.60 GiB')
    expect(stdout).to.containIgnoreSpaces('Storage Used: 0.130 GiB')
    expect(stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
    expect(stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
    expect(stdout).to.containIgnoreSpaces(
      `Created At: ${DateTime.fromISO(fakeCreatedAt).toISO()}`)
    expect(stdout).to.containIgnoreSpaces('Restored/Cloned From Add-on: N/A')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Status: Restricted')
    expect(stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')

    expect(error).to.be.undefined
  })

  it('exits with an error when the add-on was not found', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(404, {reason: 'Not found'})

    const {stdout, error} = await runCommand(['borealis-pg:info', '--app', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on is not a Borealis Isolated Postgres add-on')
  })

  it('exits with an error when there is an API server error', async () => {
    nock(borealisPgApiBaseUrl, {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}})
      .get(`/heroku/resources/${fakeAddonName}`)
      .reply(500, {reason: 'Server error'})

    const {stdout, error} = await runCommand(['borealis-pg:info', '-a', fakeHerokuAppName])

    expect(stdout).to.equal('')
    expect(error?.message).to.contain('Add-on service is temporarily unavailable. Try again later.')
  })
})
