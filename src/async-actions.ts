import color from '@heroku-cli/color'
import {ux} from '@oclif/core'

/**
 * Used to display a spinner while a given asynchronous action is executed
 *
 * @param message The message to display with the spinner
 * @param action The asynchronous action to execute
 *
 * @returns A promise that resolves to the result of the action
 */
export async function applyActionSpinner<T>(message: string, action: Promise<T>): Promise<T> {
  try {
    ux.action.start(message)
    const result = await action
    ux.action.stop()

    return result
  } catch (error) {
    ux.action.stop(color.bold.redBright('!'))

    throw error
  }
}
