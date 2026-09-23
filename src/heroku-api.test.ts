import {HTTP, HTTPError} from '@heroku/http-call'
import color from '@heroku-cli/color'
import {APIClient} from '@heroku-cli/command'
import {HerokuAPIError} from '@heroku-cli/command/lib/api-client'
import {AddOn, AddOnAttachment, OAuthAuthorization} from '@heroku-cli/schema'
import {anyString, anything, deepEqual, instance, mock, verify, when} from 'ts-mockito'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from './heroku-api'
import {expect} from './test-utils'

const cliOptionColour = color.bold.italic

describe('createHerokuAuth', () => {
  const fakeAuthorization = {id: 'my-authorization', access_token: {token: 'my-auth-token'}}
  let fakeResponse: HTTP<OAuthAuthorization>

  let mockHerokuApiClientType: APIClient
  let mockHerokuApiClientInstance: APIClient

  beforeEach(() => {
    fakeResponse = new HTTP<OAuthAuthorization>('https://api.heroku.com/foobar')
    fakeResponse.body = fakeAuthorization

    mockHerokuApiClientType = mock()
    when(mockHerokuApiClientType.post<OAuthAuthorization>(anyString(), anything()))
      .thenResolve(fakeResponse)
    mockHerokuApiClientInstance = instance(mockHerokuApiClientType)
  })

  it('requests a Heroku authorization', async () => {
    const result = await createHerokuAuth(mockHerokuApiClientInstance)

    expect(result).to.equal(fakeAuthorization)

    verify(mockHerokuApiClientType.post<OAuthAuthorization>(
      '/oauth/authorizations',
      deepEqual({
        body: {
          description: 'Borealis PG CLI plugin temporary auth token',
          expires_in: 180,
          scope: ['read', 'identity'],
        },
      }))).once()
  })
})

describe('fetchAddonAttachmentInfo', () => {
  const fakeAppId = '615c0300-fedb-445c-983a-d0d17c8cd588'
  const fakeAppName = 'my-cool-app'

  const fakeAddonId = '8e35dbfe-cb03-4a5d-b883-c286d228e7ab'
  const fakeAddonName = 'my-good-addon'
  const fakeAddonInfo = {
    addon_service: {name: 'borealis-pg'},
    app: {id: fakeAppId, name: fakeAppName},
    id: fakeAddonId,
    name: fakeAddonName,
  } as AddOn

  const fakeAddonAttachmentId = '09bb17cd-958d-443c-bb39-fcb51f693eba'
  const fakeAddonAttachmentName = 'MY_GREAT_DB'
  const fakeAddonAttachment: AddOnAttachment = {
    addon: {app: {}, id: fakeAddonId, name: fakeAddonName},
    app: {id: fakeAppId, name: fakeAppName},
    id: fakeAddonAttachmentId,
    name: fakeAddonAttachmentName,
  }

  let errorHandlerMockType: {func: ((message: string) => never)}
  let errorHandlerMockInstance: typeof errorHandlerMockType

  let fakeAttachmentsResolveSuccessResponse: HTTP<AddOnAttachment[]>
  let fakeAttachmentsListSuccessResponse: HTTP<AddOnAttachment[]>
  let fakeAddonInfoSuccessResponse: HTTP<AddOn>
  let fakeAddonListSuccessResponse: HTTP<AddOn[]>

  let mockHerokuApiClientType: APIClient
  let mockHerokuApiClientInstance: APIClient

  beforeEach(() => {
    errorHandlerMockType = mock()
    when(errorHandlerMockType.func(anything())).thenThrow(new Error('Invalid'))
    errorHandlerMockInstance = instance(errorHandlerMockType)

    fakeAttachmentsResolveSuccessResponse =
      new HTTP<AddOnAttachment[]>('https://borealis-data.example.com/attachments-resolve')
    fakeAttachmentsListSuccessResponse =
      new HTTP<AddOnAttachment[]>('https://borealis-data.example.com/attachments-list')
    fakeAddonInfoSuccessResponse = new HTTP<AddOn>('https://borealis-data.example.com/addon')
    fakeAddonListSuccessResponse = new HTTP<AddOn[]>('https://borealis-data.example.com/addons')

    mockHerokuApiClientType = mock()
    when(
      mockHerokuApiClientType.post<AddOnAttachment[]>(
        '/actions/addon-attachments/resolve',
        anything()))
      .thenResolve(fakeAttachmentsResolveSuccessResponse)
    when(mockHerokuApiClientType.get<AddOnAttachment[]>(`/addons/${fakeAddonId}/addon-attachments`))
      .thenResolve(fakeAttachmentsListSuccessResponse)
    when(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`))
      .thenResolve(fakeAddonInfoSuccessResponse)
    when(mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`))
      .thenResolve(fakeAddonListSuccessResponse)

    mockHerokuApiClientInstance = instance(mockHerokuApiClientType)
  })

  it('returns the attachment when there are both add-on and app name params', async () => {
    fakeAttachmentsResolveSuccessResponse.body = [
      {
        addon: {app: {}, id: 'b5e7b525-b3bb-421e-8770-68c2da8b46c4', name: 'another-addon'},
        app: {name: 'another-app'},
        id: '66fb5336-eaf6-4e0c-8d81-0eeaf2c6ddd2',
        name: 'ANOTHER_ATTACHMENT',
      },
      fakeAddonAttachment,
    ]
    fakeAddonInfoSuccessResponse.body = fakeAddonInfo

    const results = await fetchAddonAttachmentInfo(
      mockHerokuApiClientInstance,
      fakeAddonAttachmentName,
      fakeAppName,
      errorHandlerMockInstance.func)

    expect(results).to.deep.equal(fakeAddonAttachment)

    verify(errorHandlerMockType.func(anything())).never()

    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonAttachmentName, app: fakeAppName}})))
      .once()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(mockHerokuApiClientType.get<AddOn[]>(`/addons/${fakeAppId}/addons`)).never()
  })

  it('returns the first attachment when there is no app name param', async () => {
    fakeAttachmentsResolveSuccessResponse.body = [
      fakeAddonAttachment,
      {
        addon: {app: {}, id: 'ec95a73e-f166-4763-b094-723a43a9b474', name: 'some-other-addon'},
        app: {name: 'some-other-app'},
        id: '6d380ce7-3e78-4b9d-8aac-7f1ca7293b82',
        name: 'SOME_OTHER_ATTACHMENT',
      },
      {
        addon: {app: {}, id: '43181831-c9aa-4e53-ae63-01f7603867cb', name: 'wrong-addon'},
        id: 'e14c1a14-673d-4cd7-a9cb-a1f110d5fd86',
        name: 'WRONG_ATTACHMENT',
      },
    ]
    fakeAddonInfoSuccessResponse.body = fakeAddonInfo

    const results = await fetchAddonAttachmentInfo(
      mockHerokuApiClientInstance,
      fakeAddonName,
      null,
      errorHandlerMockInstance.func)

    expect(results).to.deep.equal(fakeAddonAttachment)

    verify(errorHandlerMockType.func(anything())).never()

    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .once()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(mockHerokuApiClientType.get<AddOn[]>(`/addons/${fakeAppId}/addons`)).never()
  })

  it('returns the attachment when there is no add-on/attachment param', async () => {
    fakeAddonListSuccessResponse.body = [
      {
        addon_service: {name: 'different-addon-type'},
        id: '80749abd-722d-4b08-ad96-5aec268397f6',
        name: 'different-addon',
      } as AddOn,
      {
        app: {id: '88fc7097-0a97-4088-87c3-43d73bbd78f9', name: 'incorrect-app'},
        id: '16a60c67-afae-448c-9cb7-54b9bdcaf9c5',
        name: 'incorrect-addon',
      } as AddOn,
      fakeAddonInfo,
    ]
    fakeAttachmentsListSuccessResponse.body = [
      {
        addon: {app: {}, id: '80749abd-722d-4b08-ad96-5aec268397f6', name: 'different-addon'},
        app: {id: 'b792c760-e5dc-4fa5-aed5-d6f1f9103b23', name: 'different-app'},
        id: '5111807e-7bad-4af7-ae2a-393319348c01',
        name: 'DIFFERENT_ATTACHMENT',
      },
      {
        addon: {app: {}, id: '80749abd-722d-4b08-ad96-5aec268397f6', name: 'yet-another-addon'},
        id: '76e47b61-da59-4621-a994-e907f91f290f',
        name: 'YET_ANOTHER_ATTACHMENT',
      },
      fakeAddonAttachment,
    ]

    const results = await fetchAddonAttachmentInfo(
      mockHerokuApiClientInstance,
      null,
      fakeAppName,
      errorHandlerMockInstance.func)

    expect(results).to.deep.equal(fakeAddonAttachment)

    verify(errorHandlerMockType.func(anything())).never()

    verify(mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .once()
    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .never()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
  })

  it('throws an error when neither add-on nor app name params are provided', async () => {
    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        null,
        null,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(
      errorHandlerMockType.func(
        'Borealis Isolated Postgres add-on could not be found. ' +
            `Try again with the ${cliOptionColour('--app')} and/or ` +
            `${cliOptionColour('--addon')} options.`,
      ))
      .once()

    verify(mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`)).never()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .never()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
  })

  it('throws an error when the add-on is from the wrong add-on service', async () => {
    fakeAttachmentsResolveSuccessResponse.body = [fakeAddonAttachment]
    fakeAddonInfoSuccessResponse.body = {
      addon_service: {name: 'something-something'},
      app: {id: fakeAppId, name: fakeAppName},
      id: fakeAddonId,
      name: fakeAddonName,
    } as AddOn

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        fakeAddonAttachmentName,
        fakeAppName,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(errorHandlerMockType.func(
      `Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)).once()

    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonAttachmentName, app: fakeAppName}})))
      .once()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(mockHerokuApiClientType.get<AddOn[]>(`/addons/${fakeAppId}/addons`)).never()
  })

  it('throws an error when there are no compatible add-ons attached to an app', async () => {
    fakeAddonListSuccessResponse.body = [
      {
        addon_service: {name: 'other-addon-type'},
        id: '16d7c3b4-1815-4fa9-80a9-cc9f193fec5b',
        name: 'other-addon',
      } as AddOn,
      {
        addon_service: {name: 'incompatible-addon-type'},
        id: '74b79cd5-3a6d-451c-ad6d-ccd4762832d6',
        name: 'incompatible-addon',
      } as AddOn,
    ]

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        null,
        fakeAppName,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(
      errorHandlerMockType.func(
        `App ${color.app(fakeAppName)} has no Borealis Isolated Postgres add-on attachments`))
      .once()

    verify(mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .never()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
  })

  it('throws an error when the add-on is detached from the app mid-execution', async () => {
    fakeAddonListSuccessResponse.body = [fakeAddonInfo]
    fakeAttachmentsListSuccessResponse.body = [
      {
        addon: {app: {}, id: fakeAddonId, name: fakeAddonName},
        app: {id: '98e8d8b6-dfe6-4bf4-bc1d-c3cb1a96776a', name: 'different-app'},
        id: 'f3b74fa1-662b-409b-8f4d-3363dd9e485b',
        name: 'DIFFERENT_ATTACHMENT',
      },
    ]

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        null,
        fakeAppName,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(
      errorHandlerMockType.func(
        `App ${color.app(fakeAppName)} has no Borealis Isolated Postgres add-on attachments`))
      .once()

    verify(mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .once()
    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .never()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
  })

  it('throws an error when there are multiple compatible add-ons attached to an app', async () => {
    fakeAddonListSuccessResponse.body = [
      fakeAddonInfo,
      {
        addon_service: {name: 'something-else-addon-type'},
        id: 'b85e5a0b-00e4-42cd-9d26-137a165beca0',
        name: 'something-else-addon',
      } as AddOn,
      {
        addon_service: {name: 'borealis-pg'},
        id: 'a41d2243-2212-4d2c-b692-3bf0c7dbfa6f',
        name: 'other-borealis-addon',
      } as AddOn,
    ]

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        null,
        fakeAppName,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(
      errorHandlerMockType.func(
        `App ${color.app(fakeAppName)} has multiple Borealis Isolated Postgres add-on ` +
          `attachments. Try again with the ${cliOptionColour('--addon')} option to specify one.`))
      .once()

    verify(mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .never()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
  })

  it('throws an error when the attachment does not exist on the specified app', async () => {
    const fakeHttp404Response: any = {body: {message: 'Not found'}, statusCode: 404}
    when(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        anything()))
      .thenReject(new HerokuAPIError(new HTTPError(fakeHttp404Response)))

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        fakeAddonAttachmentName,
        fakeAppName,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonAttachmentName, app: fakeAppName}})))
      .once()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(mockHerokuApiClientType.get<AddOn[]>(`/addons/${fakeAppId}/addons`)).never()
  })

  it('throws an error when the add-on is deleted mid-execution', async () => {
    const fakeHttp404Response: any = {body: {message: 'Not found'}, statusCode: 404}
    when(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`))
      .thenResolve(fakeHttp404Response)

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        fakeAddonAttachmentName,
        fakeAppName,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonAttachmentName, app: fakeAppName}})))
      .once()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(mockHerokuApiClientType.get<AddOn[]>(`/addons/${fakeAppId}/addons`)).never()
  })

  it('throws an error when the add-on does not exist on an unspecified app', async () => {
    const fakeHttp404Response: any = {body: {message: 'Not found'}, statusCode: 404}
    when(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        anything()))
      .thenReject(new HerokuAPIError(new HTTPError(fakeHttp404Response)))

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        fakeAddonName,
        null,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(errorHandlerMockType.func(
      `Add-on ${color.addon(fakeAddonName)} was not found. Consider trying again ` +
      `with the ${cliOptionColour('--app')} option.`)).once()

    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .once()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(mockHerokuApiClientType.get<AddOn[]>(`/addons/${fakeAppId}/addons`)).never()
  })

  it('throws an error when the app does not exist', async () => {
    const fakeHttp404Response: any = {body: {message: 'Not found'}, statusCode: 404}
    when(
      mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`))
      .thenReject(new HerokuAPIError(new HTTPError(fakeHttp404Response)))

    await expect(
      fetchAddonAttachmentInfo(
        mockHerokuApiClientInstance,
        null,
        fakeAppName,
        errorHandlerMockInstance.func)).to.be.rejected

    verify(mockHerokuApiClientType.get<AddOn[]>(`/apps/${fakeAppName}/addons`)).once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonName}})))
      .never()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${fakeAddonId}`)).never()
  })

  it('throws an error when the returned add-on and attachment info are invalid', async () => {
    const invalidAttachmentInfo: AddOnAttachment = {
      id: fakeAddonAttachmentId,
      name: fakeAddonAttachmentName,
    }
    fakeAttachmentsResolveSuccessResponse.body = [invalidAttachmentInfo]
    fakeAddonInfoSuccessResponse.body =
      {app: {id: fakeAppId, name: fakeAppName}, id: fakeAddonId} as AddOn

    when(mockHerokuApiClientType.get<AddOn>(`/addons/${invalidAttachmentInfo.addon?.id}`))
      .thenResolve(fakeAddonInfoSuccessResponse)

    await expect(fetchAddonAttachmentInfo(
      mockHerokuApiClientInstance,
      fakeAddonAttachmentName,
      fakeAppName,
      errorHandlerMockInstance.func)).to.be.rejected

    verify(
      errorHandlerMockType.func(
        `Add-on ${color.addon(fakeAddonAttachmentName)} is not a Borealis Isolated Postgres ` +
            'add-on'))
      .once()

    verify(
      mockHerokuApiClientType.post<AddOnAttachment>(
        '/actions/addon-attachments/resolve',
        deepEqual({body: {addon_attachment: fakeAddonAttachmentName, app: fakeAppName}})))
      .once()
    verify(mockHerokuApiClientType.get<AddOn>(`/addons/${invalidAttachmentInfo.addon?.id}`))
      .once()
    verify(
      mockHerokuApiClientType.get<AddOnAttachment[]>(
        `/addons/${fakeAddonId}/addon-attachments`))
      .never()
    verify(mockHerokuApiClientType.get<AddOn[]>(`/addons/${fakeAppId}/addons`)).never()
  })
})

describe('removeHerokuAuth', () => {
  it('removes an authorization via the Heroku API', async () => {
    const fakeAuthorizationId = 'my-authorization'
    const fakeResponse = new HTTP<OAuthAuthorization>('https://api.heroku.com/barfoo')

    const mockHerokuApiClientType: APIClient = mock()
    when(mockHerokuApiClientType.delete<OAuthAuthorization>(anyString()))
      .thenResolve(fakeResponse)
    const mockHerokuApiClient = instance(mockHerokuApiClientType)

    await removeHerokuAuth(mockHerokuApiClient, fakeAuthorizationId)

    verify(
      mockHerokuApiClientType
        .delete<OAuthAuthorization>(`/oauth/authorizations/${fakeAuthorizationId}`))
      .once()
  })
})
