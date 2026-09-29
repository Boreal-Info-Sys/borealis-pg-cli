import color from '@heroku-cli/color'
import {AddOnAttachment} from '@heroku-cli/schema'
import {anyString, anything, instance, mock, verify, when} from 'ts-mockito'
import {
  formatCliOptionName,
  formatJsonResults,
  generateItemSummary,
  getLocalPgHost,
  processAddonAttachmentInfo,
} from './command-components'
import {expect} from './test-utils'

describe('generateEntitySummary', () => {
  it('produces a summary table', () => {
    const result = generateItemSummary({
      data: [
        {fieldName: 'First', fieldValue: '#1'},
        {fieldName: 'Second', fieldValue: '#2!!'},
        {fieldName: '3rd', fieldValue: '3.1415926535897932385'},
      ],
    })

    expect(result).to.equal(
      `${color.bold('  First')}: #1\n` +
        `${color.bold(' Second')}: #2!!\n` +
        `${color.bold('    3rd')}: 3.1415926535897932385`,
    )
  })
})

describe('formatJsonResults', () => {
  it('serializes an object', () => {
    const fakeDate = new Date(2026, 9, 25, 16, 23, 40, 107)

    const result = formatJsonResults({w: undefined, x: 1, y: 'b', z: fakeDate})

    expect(result).to.containIgnoreSpaces(JSON.stringify({x: 1, y: 'b', z: fakeDate.toISOString()}))
  })

  it('serializes an array', () => {
    const fakeDate = new Date(2026, 9, 25, 13, 49, 27, 344)

    const result = formatJsonResults([1, 2.2, {three: '3'}, true, {something: fakeDate}, null])

    expect(result).to.containIgnoreSpaces(
      JSON.stringify([1, 2.2, {three: '3'}, true, {something: fakeDate.toISOString()}, null]),
    )
  })
})

describe('formatCliOptionName', () => {
  it('returns a formatted CLI option name', () => {
    const cliOptionName = 'my-fine-cli-option'

    const result = formatCliOptionName(cliOptionName)

    expect(result).to.equal(color.bold.italic(`--${cliOptionName}`))
  })
})

describe('processAddonAttachmentInfo', () => {
  const fakeAppName = 'my-neat-app'
  const fakeAddonName = 'my-neat-addon'
  const fakeAddonAttachmentName = 'MY_NEAT_DB'

  let errorHandlerMockType: {func: (message: string) => never}
  let errorHandlerMockInstance: typeof errorHandlerMockType

  beforeEach(() => {
    errorHandlerMockType = mock()
    when(errorHandlerMockType.func(anything())).thenThrow(new Error('Invalid'))
    errorHandlerMockInstance = instance(errorHandlerMockType)
  })

  it('returns expected info when attachment is valid', () => {
    const fakeAttachment: AddOnAttachment = {
      addon: {app: {}, id: '6d0a1752-bfc5-4344-b998-155f90f0d550', name: fakeAddonName},
      app: {id: '4e7b43ba-b9b7-494d-9fda-f055e3ec7fcf', name: fakeAppName},
      id: '029d3d56-1c0d-4a7d-a76e-53d40b5ac649',
      name: fakeAddonAttachmentName,
    }

    const result = processAddonAttachmentInfo(fakeAttachment, errorHandlerMockInstance.func)

    expect(result).to.deep.equal({
      addonName: fakeAddonName,
      appName: fakeAppName,
      attachmentName: fakeAddonAttachmentName,
    })

    verify(errorHandlerMockType.func(anyString())).never()
  })

  it('indicates an error when the attachment does not have an attachment name field', () => {
    const fakeAttachments: AddOnAttachment = {
      addon: {app: {}, id: 'ad7f474c-4b7d-4f12-abc8-ad7ce918da7b', name: fakeAddonName},
      app: {id: 'f0815480-3a36-4a00-a821-958951bca22f', name: fakeAppName},
      id: '6ef02958-4017-433c-8745-7b80fcd44578',
    }
    const expectedMessage = 'Add-on service is temporarily unavailable. Try again later.'

    expect(() =>
      processAddonAttachmentInfo(fakeAttachments, errorHandlerMockInstance.func),
    ).to.throw()

    verify(errorHandlerMockType.func(expectedMessage)).once()
  })

  it('indicates an error when the attachment does not have an addon field', () => {
    const fakeAttachments: AddOnAttachment = {
      app: {id: '924d8a7e-fa07-4011-b1fa-81174a57e32a', name: fakeAppName},
      id: '4d66b508-dda8-4055-97b3-bc96569e564c',
      name: fakeAddonAttachmentName,
    }
    const expectedMessage = 'Add-on service is temporarily unavailable. Try again later.'

    expect(() =>
      processAddonAttachmentInfo(fakeAttachments, errorHandlerMockInstance.func),
    ).to.throw()

    verify(errorHandlerMockType.func(expectedMessage)).once()
  })

  it('indicates an error when the attachment does not have an app field', () => {
    const fakeAttachments: AddOnAttachment = {
      addon: {app: {}, id: '03ae7f18-a7d8-442e-ac4b-ed6578f54d0f', name: fakeAddonName},
      id: 'a593fea2-6a9e-4c28-9b70-78654dee8349',
      name: fakeAddonAttachmentName,
    }
    const expectedMessage = 'Add-on service is temporarily unavailable. Try again later.'

    expect(() =>
      processAddonAttachmentInfo(fakeAttachments, errorHandlerMockInstance.func),
    ).to.throw()

    verify(errorHandlerMockType.func(expectedMessage)).once()
  })

  it('indicates an error when the attachment does not have an app name field', () => {
    const fakeAttachments: AddOnAttachment = {
      addon: {app: {}, id: 'fdf7f80d-cb9e-4719-95fb-d9bda9aabc9c', name: fakeAddonName},
      app: {id: 'e9539aad-e026-4925-8eb8-ce88d31e477a'},
      id: '601d07fd-02ff-484a-acb2-fcd0e4bc3d56',
      name: fakeAddonAttachmentName,
    }
    const expectedMessage = 'Add-on service is temporarily unavailable. Try again later.'

    expect(() =>
      processAddonAttachmentInfo(fakeAttachments, errorHandlerMockInstance.func),
    ).to.throw()

    verify(errorHandlerMockType.func(expectedMessage)).once()
  })
})

describe('getLocalPgHost', () => {
  it('always returns the default PG tunnel hostname in test mode', async () => {
    const result = await getLocalPgHost()

    expect(result).to.equal('pg-tunnel.borealis-data.com')
  })
})
