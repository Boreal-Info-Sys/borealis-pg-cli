import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {OAuthAuthorization} from '@heroku-cli/schema'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliOptions,
  consoleColours,
  formatCliOptionName,
  processAddonAttachmentInfo,
  writeAccessOptionName,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'
import {Args} from '@oclif/core'

const keyColour = consoleColours.dataFieldName
const valueColour = consoleColours.dataFieldValue

const dataIntegrationOptionName = 'name'

export default class RegisterDataIntegrationsCommand extends Command {
  static description =
    `Register a data integration for a Borealis Isolated Postgres add-on

A data integration allows a third party service access to an add-on database
via a secure tunnel using semi-permanent SSH server and database credentials.
Typical uses include extract, transform and load (ETL) services and data
warehouses.

An SSH public key is required for SSH client authorization. It must be an RSA,
ECDSA or Ed25519 public key in OpenSSH format. It will typically be provided
to you by the third party service.

The ${formatCliOptionName(dataIntegrationOptionName)} option is used internally to identify a data integration and to
generate a unique database username for it; it must must consist only of
lowercase letters, digits and underscores (_), and have between 1 and 25
characters.

Note that, in some cases, the service may require read and write access to an
add-on database, in which case you can supply the ${formatCliOptionName(writeAccessOptionName)} option.

The output includes an SSH server public host key value. This can be used to
validate the identity of the SSH server if the data integration service
supports it.`

  static examples = [
    `$ heroku borealis-pg:integrations:register --${appOptionName} sushi --${dataIntegrationOptionName} my_integration1 ssh-ed25519 SSHPUBLICKEY1===`,
    `$ heroku borealis-pg:integrations:register --${writeAccessOptionName} --${appOptionName} sushi --${dataIntegrationOptionName} my_integration2 ssh-rsa SSHPUBLICKEY2===`,
  ]

  static strict = false // Receive command argument(s) as an argv array

  static args = {
    SSH_PUBLIC_KEY: Args.string({
      description: 'an SSH public key to authorize for access',
      required: true,
    }),
  }

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [dataIntegrationOptionName]: flags.string({
      char: 'n',
      description: 'name of the add-on data integration',
      required: true,
    }),
    [writeAccessOptionName]: cliOptions.writeAccess,
  }

  async run() {
    const {argv, flags} = await this.parse(RegisterDataIntegrationsCommand)

    const sshPublicKey = argv.join(' ')

    const integrationName = flags[dataIntegrationOptionName]
    const enableWriteAccess = flags[writeAccessOptionName]

    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfo =
      await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app, this.error)
    const {addonName} = processAddonAttachmentInfo(attachmentInfo, this.error)

    try {
      const dataIntegrationInfo = await applyActionSpinner(
        `Registering data integration with add-on ${color.addon(addonName)}`,
        this.registerIntegration(
          addonName,
          {integrationName, sshPublicKey, enableWriteAccess},
          authorization,
        ),
      )

      this.printResult(dataIntegrationInfo)
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async registerIntegration(
    addonName: string,
    registrationInfo: RegistrationInfo,
    authorization: OAuthAuthorization): Promise<DataIntegrationInfo> {
    const response: HTTP<DataIntegrationInfo> = await HTTP.post(
      getBorealisPgApiUrl(`/heroku/resources/${addonName}/data-integrations`),
      {headers: {Authorization: getBorealisPgAuthHeader(authorization)}, body: registrationInfo})

    return response.body
  }

  private printResult(dataIntegrationInfo: DataIntegrationInfo) {
    this.log()
    this.log(`              ${keyColour('Database Host')}: ${valueColour(dataIntegrationInfo.dbHost)}`)
    this.log(`              ${keyColour('Database Port')}: ${valueColour(dataIntegrationInfo.dbPort.toString())}`)
    this.log(`              ${keyColour('Database Name')}: ${valueColour(dataIntegrationInfo.dbName)}`)
    this.log(`          ${keyColour('Database Username')}: ${valueColour(dataIntegrationInfo.dbUsername)}`)
    this.log(`          ${keyColour('Database Password')}: ${valueColour(dataIntegrationInfo.dbPassword)}`)
    this.log(`                   ${keyColour('SSH Host')}: ${valueColour(dataIntegrationInfo.sshHost)}`)
    this.log(`                   ${keyColour('SSH Port')}: ${valueColour(dataIntegrationInfo.sshPort.toString())}`)
    this.log(`               ${keyColour('SSH Username')}: ${valueColour(dataIntegrationInfo.sshUsername)}`)
    this.log(` ${keyColour('SSH Server Public Host Key')}: ${valueColour(dataIntegrationInfo.publicSshHostKey)}`)
  }

  async catch(err: any) {
    /* istanbul ignore else */
    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        // Typically this happens because the maximum number of integrations was reached or the args
        // or options are invalid
        this.error(err.body.reason.toString())
      } else if (err.statusCode === 403) {
        this.error('Add-on database write access has been revoked')
      } else if (err.statusCode === 404) {
        this.error('Add-on is not a Borealis Isolated Postgres add-on')
      } else if (err.statusCode === 409) {
        this.error('A data integration with that name is already registered')
      } else if (err.statusCode === 422) {
        this.error('Add-on is not finished provisioning')
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}

interface RegistrationInfo {
  enableWriteAccess: boolean;
  integrationName: string;
  sshPublicKey: string;
}

interface DataIntegrationInfo {
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  publicSshHostKey: string;
}
