import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {DateTime} from 'luxon'
import {applyActionSpinner} from '../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {
  addonOptionName,
  cliOptions,
  appOptionName,
  processAddonAttachmentInfo,
  consoleColours,
} from '../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../heroku-api'

const keyColour = consoleColours.dataFieldName
const valueColour = consoleColours.dataFieldValue

const bytesPerGib = 1024 * 1024 * 1024

const supportedRegions: {[key: string]: string} = {
  'us-east-1': 'N. Virginia (United States)',
  'eu-west-1': 'Ireland (Europe)',
  'eu-central-1': 'Frankfurt',
  'ap-northeast-1': 'Tokyo',
  'ap-southeast-2': 'Sydney',
  'us-west-2': 'Oregon',
}

const dbTenancyTypes: {[key: string]: string} = {
  isolated: 'Single Tenant',
  shared: 'Multi-tenant',
}

const addonStatuses: {[key: string]: string} = {
  available: 'Available',
  awaiting: 'Provisioning',
  configuring: 'Provisioning',
  maintenance: 'Undergoing maintenance',
  'maintenance-db-credentials-full-reset': 'Resetting DB credentials',
  'maintenance-postgresql-major-version-upgrade': 'Upgrading PostgreSQL major version',
  'maintenance-plan-change': 'Changing add-on plan',
  'maintenance-restore-db-write-access': 'Restoring DB write access',
  'maintenance-revoke-db-write-access': 'Revoking DB write access',
  provisioning: 'Provisioning',
  requested: 'Requested',
}

const storageComplianceStatuses: {[key: string]: string} = {
  ok: 'OK',
  'proximity-warning': 'Proximity Warning',
  restricted: 'Restricted',
  violating: 'Violating',
}

export default class AddonInfoCommand extends Command {
  static description = 'shows information about a Borealis Isolated Postgres add-on database'

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = await this.parse(AddonInfoCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      const response = await applyActionSpinner<HTTP<AddonInfo>>(
        `Fetching information about add-on ${color.addon(addonName)}`,
        HTTP.get(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )

      this.printAddonInfo(response.body)
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async printAddonInfo(addonInfo: AddonInfo) {
    const region = supportedRegions[addonInfo.region] ?? addonInfo.region
    const dbTenancyType = dbTenancyTypes[addonInfo.dbTenancyType] ?? addonInfo.dbTenancyType

    const addonStatus = addonStatuses[addonInfo.status] ?? addonInfo.status
    const storageComplianceStatus = storageComplianceStatuses[addonInfo.storageComplianceStatus] ??
      addonInfo.storageComplianceStatus
    const storageComplianceDeadline = addonInfo.storageComplianceDeadline ?
      DateTime.fromISO(addonInfo.storageComplianceDeadline).toISO() as string :
      'N/A'

    const dbStorageMaxGib = addonInfo.dbStorageMaxBytes / bytesPerGib
    const dbStorageMaxFractionDigits = (dbStorageMaxGib < 1) ? 2 : 0
    const dbStorageMaxDisplay = dbStorageMaxGib.toFixed(dbStorageMaxFractionDigits) + ' GiB'

    const dbStorageUsageGib = addonInfo.dbStorageUsageBytes / bytesPerGib
    const dbStorageUsageFractionDigits = (dbStorageUsageGib < 1) ? 3 : 1
    const dbStorageUsageDisplay = dbStorageUsageGib.toFixed(dbStorageUsageFractionDigits) + ' GiB'

    const appDbName = addonInfo.appDbName ?? '(pending)'

    const createdAt = DateTime.fromISO(addonInfo.createdAt).toISO() as string

    const restoreSourceAddonName = addonInfo.restoreSourceAddonName ?? 'N/A'

    this.log()
    this.log(`                 ${keyColour('Add-on Name')}: ${valueColour(addonInfo.addonName)}`)
    this.log(`                      ${keyColour('Status')}: ${valueColour(addonStatus)}`)
    this.log(`                      ${keyColour('Region')}: ${valueColour(region)}`)
    this.log(`                   ${keyColour('Plan Name')}: ${valueColour(addonInfo.planName)}`)
    this.log(`                 ${keyColour('Environment')}: ${valueColour(dbTenancyType)}`)
    this.log(`          ${keyColour('PostgreSQL Version')}: ${valueColour(addonInfo.postgresVersion)}`)
    this.log(`             ${keyColour('Maximum Storage')}: ${valueColour(dbStorageMaxDisplay)}`)
    this.log(`                ${keyColour('Storage Used')}: ${valueColour(dbStorageUsageDisplay)}`)
    this.log(`          ${keyColour('Read-only Replicas')}: ${valueColour(addonInfo.replicaQuantity.toString())}`)
    this.log(`                 ${keyColour('App DB Name')}: ${valueColour(appDbName)}`)
    this.log(`                  ${keyColour('Created At')}: ${valueColour(createdAt)}`)
    this.log(` ${keyColour('Restored/Cloned From Add-on')}: ${valueColour(restoreSourceAddonName)}`)
    this.log(`   ${keyColour('Storage Compliance Status')}: ${valueColour(storageComplianceStatus)}`)
    this.log(` ${keyColour('Storage Compliance Deadline')}: ${valueColour(storageComplianceDeadline)}`)
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 404) {
        this.error('Add-on is not a Borealis Isolated Postgres add-on')
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}

interface AddonInfo {
  addonName: string;
  appDbName: string | null;
  createdAt: string;
  dbStorageMaxBytes: number;
  dbStorageUsageBytes: number;
  dbTenancyType: string;
  planName: string;
  postgresVersion: string;
  region: string;
  replicaQuantity: number;
  restoreSourceAddonName: string | null;
  status: string;
  storageComplianceDeadline: string | null;
  storageComplianceStatus: string;
}
