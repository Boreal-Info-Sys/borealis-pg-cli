import {HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {APIClient} from '@heroku-cli/command'
import {AddOn, AddOnAttachment, OAuthAuthorization} from '@heroku-cli/schema'
import {
  addonOptionName,
  addonServiceName,
  appOptionName,
  formatCliOptionName,
} from './command-components'

/**
 * Options to use when dealing with the Heroku API
 */
export const herokuApiOptions = {
  addonStatePollIntervalMs: 5000, // 5 seconds
}

/**
 * Creates a new, short-lived Heroku OAuth authorization
 *
 * @param herokuApiClient The Heroku API client
 */
export async function createHerokuAuth(herokuApiClient: APIClient): Promise<OAuthAuthorization> {
  const response = await herokuApiClient.post<OAuthAuthorization>('/oauth/authorizations', {
    body: {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 180,
      scope: ['read', 'identity'],
    },
  })

  return response.body
}

/**
 * Removes a Heroku OAuth authorization
 *
 * @param herokuApiClient The Heroku API client
 * @param authId The ID of the Heroku OAuth authorization
 */
export async function removeHerokuAuth(herokuApiClient: APIClient, authId: string) {
  await herokuApiClient.delete<OAuthAuthorization>(`/oauth/authorizations/${authId}`)
}

/**
 * Retrieves add-on attachment info for the specified add-on or attachment.
 *
 * @param herokuApiClient The Heroku API client
 * @param addonOrAttachment The name or ID of an add-on or its attachment
 * @param appName The name of an app to which the add-on is attached
 * @param errorHandler A function to output errors when they occur
 */
export async function fetchAddonAttachmentInfo(
  herokuApiClient: APIClient,
  addonOrAttachment: string | null | undefined,
  appName: string | null | undefined,
  errorHandler: (message: string) => never,
): Promise<AddOnAttachment | never> {
  if (addonOrAttachment) {
    return fetchAttachmentByAddonOrAttachment(
      herokuApiClient,
      addonOrAttachment,
      appName,
      errorHandler,
    )
  } else if (appName) {
    return fetchAttachmentByAppNameOnly(herokuApiClient, appName, errorHandler)
  } else {
    errorHandler(
      'Borealis Isolated Postgres add-on could not be found. ' +
        `Try again with the ${formatCliOptionName(appOptionName)} and/or ` +
        `${formatCliOptionName(addonOptionName)} options.`,
    )
  }
}

async function fetchAttachmentByAddonOrAttachment(
  herokuApiClient: APIClient,
  addonOrAttachment: string,
  appName: string | null | undefined,
  errorHandler: (message: string) => never,
): Promise<AddOnAttachment | never> {
  const baseAttachmentsRequestBody = {addon_attachment: addonOrAttachment}
  const attachmentsRequestBody = appName
    ? {app: appName, ...baseAttachmentsRequestBody}
    : baseAttachmentsRequestBody
  try {
    const attachmentsResponse = await herokuApiClient.post<AddOnAttachment[]>(
      '/actions/addon-attachments/resolve',
      {body: attachmentsRequestBody},
    )
    const attachmentInfo =
      attachmentsResponse.body.find(attachmentInfo => attachmentInfo.app?.name === appName) ??
      attachmentsResponse.body[0]

    const addonResponse = await herokuApiClient.get<AddOn>(`/addons/${attachmentInfo.addon?.id}`)
    const addonInfo = addonResponse.body
    if (addonInfo.addon_service?.name === addonServiceName) {
      return attachmentInfo
    } else {
      errorHandler(
        `Add-on ${color.addon(addonInfo.name ?? addonOrAttachment)} is not a Borealis Isolated ` +
          'Postgres add-on',
      )
    }
  } catch (error: any) {
    const actualError = error.http instanceof HTTPError ? error.http : error
    if (!appName && actualError instanceof HTTPError && actualError.statusCode === 404) {
      errorHandler(
        `Add-on ${color.addon(addonOrAttachment)} was not found. Consider trying again ` +
          `with the ${formatCliOptionName(appOptionName)} option.`,
      )
    } else {
      throw error
    }
  }
}

async function fetchAttachmentByAppNameOnly(
  herokuApiClient: APIClient,
  appName: string,
  errorHandler: (message: string) => never,
): Promise<AddOnAttachment | never> {
  const addonsResponse = await herokuApiClient.get<AddOn[]>(`/apps/${appName}/addons`)
  const addonInfos = addonsResponse.body.filter(
    addonInfo => addonInfo.addon_service?.name === addonServiceName,
  )
  if (addonInfos.length === 0) {
    errorHandler(`App ${color.app(appName)} has no Borealis Isolated Postgres add-on attachments`)
  } else if (addonInfos.length > 1) {
    errorHandler(
      `App ${color.app(appName)} has multiple Borealis Isolated Postgres add-on attachments. ` +
        `Try again with the ${formatCliOptionName(addonOptionName)} option to specify one.`,
    )
  } else {
    const attachmentsResponse = await herokuApiClient.get<AddOnAttachment[]>(
      `/addons/${addonInfos[0].id}/addon-attachments`,
    )

    const attachmentInfoMatch = attachmentsResponse.body.find(
      attachmentInfo => attachmentInfo.app?.name === appName,
    )

    if (attachmentInfoMatch) {
      return attachmentInfoMatch
    } else {
      errorHandler(`App ${color.app(appName)} has no Borealis Isolated Postgres add-on attachments`)
    }
  }
}
