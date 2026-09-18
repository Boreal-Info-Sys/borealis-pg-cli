import {captureOutput} from '@oclif/test'
import {applyActionSpinner} from './async-actions'
import {expect} from './test-utils'

describe('applyActionSpinner', () => {
  it('resolves the given promise', async () => {
    const expectedResult = 'my-cool-result'
    const promise = Promise.resolve(expectedResult)

    const {result} = await captureOutput(() => applyActionSpinner('', promise))

    expect(result).to.equal(expectedResult)
  })

  it('rejects a promise that throws an error', async () => {
    const expectedError = new Error('my-bad-error')
    const promise = Promise.reject(expectedError)

    const {error} = await captureOutput(() => applyActionSpinner('', promise))

    expect(error).to.equal(expectedError)
  })

  it('outputs the specified message for a successful execution', async () => {
    const fakeMessage = 'my-excellent-message'

    const {stderr} = await captureOutput(() =>
      applyActionSpinner(fakeMessage, Promise.resolve('my-excellent-result')))

    expect(stderr).to.contain(fakeMessage)
  })

  it('outputs the specified message for a failed execution', async () => {
    const expectedError = new Error('error')
    const fakeMessage = 'my-terrible-message'

    const {stderr, error} = await captureOutput(() =>
      applyActionSpinner(fakeMessage, Promise.reject(expectedError)))

    expect(error).to.equal(expectedError)
    expect(stderr).to.contain(fakeMessage)
  })
})
