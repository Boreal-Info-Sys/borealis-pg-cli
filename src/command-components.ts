import color from '@heroku-cli/color'
import {flags} from '@heroku-cli/command'
import {AddOnAttachment} from '@heroku-cli/schema'
import {Args} from '@oclif/core'
import dotenv from 'dotenv'
import dns from 'node:dns/promises'
import notifier from 'node-notifier'
import path from 'path'

dotenv.config({path: path.join(__dirname, '..', '.env'), quiet: true})

const loopbackAddress = '127.0.0.1'

// The corresponding DNS A record points to 127.0.0.1, just like localhost, so the result is
// functionally identical (the client connects to the remote server through the local port
// forwarding tunnel) but using this domain name should result in a less odd-looking connection
// hostname and URL from a user's perspective than using "localhost" would
const defaultLocalPgHostname = 'pg-tunnel.borealis-data.com'

/* istanbul ignore next */
export const addonServiceName = process.env.BOREALIS_PG_ADDON_SERVICE_NAME || 'borealis-pg'

/* istanbul ignore next */
export const borealisPgApiBaseUrl =
  process.env.BOREALIS_PG_API_BASE_URL || 'https://pg-heroku-addon-api.borealis-data.com'

export const consoleColours = {
  cliCmdName: color.italic,
  cliOption: color.bold.italic,
  dataFieldName: color.bold,
  dataFieldValue: color.grey,
  pgExtension: color.green,
}

export const defaultPorts = {
  pg: 5432,
  ssh: 22,
}

export const cliArgs = {
  pgExtension: Args.string({description: 'name of a Postgres extension', required: true}),
}

export const pgExtensionArgName = 'PG_EXTENSION'

export const cliOptions = {
  addon: flags.string({
    char: 'o',
    description: 'name or ID of an add-on or one of its attachments',
  }),
  app: flags.app({
    description: 'app to which the add-on is attached',
  }),
  port: flags.integer({
    char: 'p',
    default: defaultPorts.pg,
    description: 'local port number for the secure tunnel to the add-on Postgres server',
    min: 1,
    max: 65_535,
  }),
  writeAccess: flags.boolean({
    char: 'w',
    default: false,
    description: 'allow write access to the add-on Postgres database',
  }),
}

export const addonOptionName = 'addon'
export const appOptionName = 'app'
export const portOptionName = 'port'
export const writeAccessOptionName = 'write-access'

/**
 * Services to be used by commands.
 *
 * Since oclif doesn't support dependency injection for commands, this is the next best thing.
 */
export const componentServices = {
  notifier: {notify: notifier.notify},
}

/**
 * Formats the given CLI option name for use in console output
 *
 * @param name The option name
 *
 * @returns The formatted option name
 */
export function formatCliOptionName(name: string): string {
  return consoleColours.cliOption(`--${name}`)
}

/**
 * Retrieves vital add-on info from the given attachment info
 *
 * @param attachmentInfo A list of attachment information
 * @param errorHandler A function to output errors when they occur
 *
 * @returns Info about the corresponding add-on
 */
export function processAddonAttachmentInfo(
  attachmentInfo: AddOnAttachment,
  errorHandler: (message: string) => never): {
    addonName: string;
    appName: string;
    attachmentName: string;
  } | never {
  const addonName = attachmentInfo.addon?.name
  const appName = attachmentInfo.app?.name
  const attachmentName = attachmentInfo.name
  if (addonName && appName && attachmentName) {
    return {addonName, appName, attachmentName}
  } else {
    errorHandler('Add-on service is temporarily unavailable. Try again later.')
  }
}

/**
 * Retrieves the hostname or IP address to use for local port forwarding
 */
export async function getLocalPgHost() {
  /* istanbul ignore else */
  if (process.env.NODE_ENV === 'test') {
    return defaultLocalPgHostname
  } else {
    // Check that the DNS record for pg-tunnel.borealis-data.com can be resolved; otherwise, fall
    // back to the raw loopback address
    let dnsRecords: string[]
    try {
      dnsRecords = await dns.resolve(defaultLocalPgHostname, 'A')
    } catch {
      dnsRecords = []
    }

    return dnsRecords.includes(loopbackAddress) ? defaultLocalPgHostname : loopbackAddress
  }
}
