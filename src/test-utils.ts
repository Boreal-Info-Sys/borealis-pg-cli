import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import path from 'path'
import {globSync} from 'tinyglobby'
import {test as oclifTest} from '@oclif/test'

process.env.BOREALIS_PG_ADDON_SERVICE_NAME = 'borealis-pg'
process.env.BOREALIS_PG_API_BASE_URL = 'https://pg-heroku-addon-api.borealis-data.com'

const customizedChai = chai.use(chaiString).use(chaiAsPromised)
export const expect = customizedChai.expect

export const test = oclifTest

export const herokuApiBaseUrl = 'https://api.heroku.com'
export const borealisPgApiBaseUrl = 'https://pg-heroku-addon-api.borealis-data.com'

// The following is a workaround for broken line number reporting in oclif commands (see
// https://github.com/oclif/test/issues/50 and https://github.com/oclif/oclif/issues/314)
function fixBrokenLineNumbers() {
  const commandsDirPath = path.join(__dirname, 'commands')
  const allTsFileNames = globSync('**/*.ts', {cwd: commandsDirPath})
  const testFileNames = globSync('**/*.test.ts', {cwd: commandsDirPath})

  for (const filename of allTsFileNames) {
    if (!testFileNames.includes(filename)) {
      const commandPath = path.join(commandsDirPath, filename)

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(commandPath)
    }
  }
}

fixBrokenLineNumbers()
