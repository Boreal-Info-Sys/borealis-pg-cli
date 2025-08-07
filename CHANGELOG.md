# Change Log
This project adheres to [Semantic Versioning](http://semver.org/). All notable changes will be documented in this file.

## [1.6.6](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.6.5...v1.6.6)
- Fixed: Fall back to 127.0.0.1 when pg-tunnel.borealis-data.com cannot be resolved

## [1.6.5](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.6.4...v1.6.5)
- Fixed: Missing files when building and publishing

## [1.6.4](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.6.3...v1.6.4)
- Fixed: Typing errors during build

## [1.6.3](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.6.2...v1.6.3)
- Fixed: HTTP request timeouts when adding/removing data integrations

## [1.6.2](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.6.1...v1.6.2)
- Various upgrades to dependency package versions

## [1.6.1](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.6.0...v1.6.1)
- Client-side mitigation for SSH Terrapin vulnerability (CVE-2023-48795)

## [1.6.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.5.0...v1.6.0)
- Report database clone and restore capabilities separately in `borealis-pg:restore:capabilities` output

## [1.5.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.4.0...v1.5.0)
- Outputs all times in the user's local time zone
- Shows whether nightly backups are enabled in `borealis-pg:restore:capabilities` command output

## [1.4.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.3.0...v1.4.0)
- Adds the `borealis-pg:restore:capabilities` command to retrieve an add-on's database restore capabilities
- Adds the `borealis-pg:restore:execute` command to perform an add-on database restore/clone
- Include the name of the source add-on for an add-on that was restored/cloned in `borealis-pg:info` output

## [1.3.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.2.0...v1.3.0)
- Adds the `borealis-pg:integrations` command to retrieve a list of data integrations for an add-on
- Adds the `borealis-pg:integrations:register` command to register a new data integration with an add-on
- Adds the `borealis-pg:integrations:remove` command to remove/deregister a data integration

## [1.2.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.1.0...v1.2.0)
- Support the new secure tunnel connection info config var (`DATABASE_TUNNEL_BPG_CONN_INFO`)
- Require SSL/TLS for DB connections when using the `borealis-pg:run` command

## [1.1.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.0.1...v1.1.0)
- Adds an add-on status field to the `borealis-pg:info` (alias: `borealis-pg`) command

## [1.0.1](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v1.0.0...v1.0.1)
- Fixed: Missing dotenv in runtime dependencies

## [1.0.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.9.0...v1.0.0)
- Adds the `borealis-pg:info` (alias: `borealis-pg`) command to retrieve details about an add-on DB
- Adds the `borealis-pg:users` command to retrieve a list of active DB users for an add-on
- The `--addon` option is no longer required when there is only one Borealis Isolated Postgres add-on attached to an app

## [0.9.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.8.0...v0.9.0)
- Additional extension info (version and DB schema name) in `borealis-pg:extensions` and `borealis-pg:extensions:install` command output

## [0.8.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.7.0...v0.8.0)
- Adds the `borealis-pg:psql` command to launch an interactive psql session through a secure tunnel directly from the CLI

## [0.7.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.6.1...v0.7.0)
- Print to console to denote the start of DB or shell command execution by `borealis-pg:run`
- Console output explaining that node-gyp/cpu-features errors during installation may be safely disregarded

## [0.6.1](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.6.0...v0.6.1)
- Improve error message when deleting a PostgreSQL extension with dependent objects

## [0.6.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.5.0...v0.6.0)
- Handle cases where DB write access is disabled due to persistent storage limit violations

## [0.5.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.4.0...v0.5.0)
- Require "identity" scope for Heroku authorizations

## [0.4.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.3.1...v0.4.0)
- Clarified in the `borealis-pg:tunnel` command's output that it does not accept keyboard input
- Handle port conflicts for secure tunnels on Windows

## [0.3.1](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.3.0...v0.3.1)
- Updated dependencies to address a [vulnerability](https://nvd.nist.gov/vuln/detail/CVE-2021-3807) in the ansi-regex package

## [0.3.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.2.2...v0.3.0)
- `borealis-pg:run` and `borealis-pg:tunnel` now indicate in their output whether the user is read-only or read/write
- `borealis-pg:run` and `borealis-pg:tunnel` now use pg-tunnel.borealis-data.com for client connections (DNS entry points to 127.0.0.1)

## [0.2.2](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.2.1...v0.2.2)
- Changed URL to Postgres extension support page

## [0.2.1](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.2.0...v0.2.1)
- Re-release of v0.2.0 to fix a build problem

## [0.2.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/v0.1.0...v0.2.0)
- Added the `borealis-pg:run` command to execute a noninteractive SQL or shell command for an add-on database
- The `borealis-pg:extensions:install` command now includes the option to suppress the error when a Postgres extension is already installed
- The `borealis-pg:extensions:remove` command now includes the option to suppress the error when a Postgres extension is not installed

## [0.1.0](https://github.com/Boreal-Info-Sys/borealis-pg-cli/compare/477321d...v0.1.0)
First public pre-release version
