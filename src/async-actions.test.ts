import {captureOutput} from '@oclif/test'
import {applyActionSpinner} from './async-actions'
import {expect} from './test-utils'

describe('applyActionSpinner', () => {
  it('resolves the given promise', async () => {
    const expectedResult = 'my-cool-result'
    const promise = Promise.resolve(expectedResult)

    const {result, error} = await captureOutput(() => applyActionSpinner('foo', promise))

    expect(result).to.equal(expectedResult)
    expect(error).to.be.undefined
  })

  it('rejects a promise that throws an error', async () => {
    const expectedError = new Error('my-bad-error')
    const promise = Promise.reject(expectedError)

    const {result, error} = await captureOutput(() => applyActionSpinner('bar', promise))

    expect(result).to.be.undefined
    expect(error).to.equal(expectedError)
  })
})
