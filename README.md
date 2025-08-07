borealis-pg-cli
===============

This [plugin](https://devcenter.heroku.com/articles/using-cli-plugins) for the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) enables various advanced interactions with a [Borealis Isolated Postgres add-on](https://elements.heroku.com/addons/borealis-pg). See our [CLI documentation](https://www.borealis-data.com/pg-addon-cli) for help getting started and for additional examples.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/borealis-pg-cli.svg)](https://npmjs.org/package/borealis-pg-cli)
[![License](https://img.shields.io/npm/l/borealis-pg-cli.svg)](https://github.com/OldSneerJaw/borealis-pg-cli/blob/master/package.json)

<!-- toc -->
* [Installation](#installation)
* [Commands](#commands)
<!-- tocstop -->

# Installation

First, ensure the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) is installed, then execute the following from a terminal:

```sh-session
$ heroku plugins:install borealis-pg-cli
```

# Commands
<!-- commands -->
* [`heroku borealis-pg`](#heroku-borealis-pg)
* [`heroku borealis-pg:extensions`](#heroku-borealis-pgextensions)
* [`heroku borealis-pg:extensions:install PG_EXTENSION`](#heroku-borealis-pgextensionsinstall-pg_extension)
* [`heroku borealis-pg:extensions:remove PG_EXTENSION`](#heroku-borealis-pgextensionsremove-pg_extension)
* [`heroku borealis-pg:info`](#heroku-borealis-pginfo)
* [`heroku borealis-pg:integrations`](#heroku-borealis-pgintegrations)
* [`heroku borealis-pg:integrations:register SSH_PUBLIC_KEY`](#heroku-borealis-pgintegrationsregister-ssh_public_key)
* [`heroku borealis-pg:integrations:remove`](#heroku-borealis-pgintegrationsremove)
* [`heroku borealis-pg:psql`](#heroku-borealis-pgpsql)
* [`heroku borealis-pg:restore:capabilities`](#heroku-borealis-pgrestorecapabilities)
* [`heroku borealis-pg:restore:execute`](#heroku-borealis-pgrestoreexecute)
* [`heroku borealis-pg:run`](#heroku-borealis-pgrun)
* [`heroku borealis-pg:tunnel`](#heroku-borealis-pgtunnel)
* [`heroku borealis-pg:users`](#heroku-borealis-pgusers)
* [`heroku borealis-pg:users:reset`](#heroku-borealis-pgusersreset)

## `heroku borealis-pg`

shows information about a Borealis Isolated Postgres add-on database

```
USAGE
  $ heroku borealis-pg [-o <value>] [-a <value>]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments

DESCRIPTION
  shows information about a Borealis Isolated Postgres add-on database
```

_See code: [src/commands/borealis-pg/index.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/index.ts)_

## `heroku borealis-pg:extensions`

lists installed Postgres extensions for a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:extensions [-o <value>] [-a <value>]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments

DESCRIPTION
  lists installed Postgres extensions for a Borealis Isolated Postgres add-on
```

_See code: [src/commands/borealis-pg/extensions/index.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/extensions/index.ts)_

## `heroku borealis-pg:extensions:install PG_EXTENSION`

installs a Postgres extension on a Borealis Isolated Postgres add-on database

```
USAGE
  $ heroku borealis-pg:extensions:install PG_EXTENSION [-o <value>] [-a <value>] [-r] [-s]

ARGUMENTS
  PG_EXTENSION  name of a Postgres extension

FLAGS
  -a, --app=<value>        app to which the add-on is attached
  -o, --addon=<value>      name or ID of an add-on or one of its attachments
  -r, --recursive          automatically install Postgres extension dependencies recursively
  -s, --suppress-conflict  suppress nonzero exit code when an extension is already installed

DESCRIPTION
  installs a Postgres extension on a Borealis Isolated Postgres add-on database

  Each extension is typically installed with its own dedicated database schema,
  which may be used to store types, functions, tables or other objects that are
  part of the extension.

  If an extension has any unsatisfied dependencies, its dependencies will be
  installed automatically only if the --recursive option is provided.

  Details of all supported extensions can be found here:
  https://www.borealis-data.com/pg-extensions-support.html

EXAMPLES
  $ heroku borealis-pg:extensions:install --recursive --app sushi hstore_plperl

  $ heroku borealis-pg:extensions:install --app sushi --addon BOREALIS_PG_MAROON bloom

  $ heroku borealis-pg:extensions:install --suppress-conflict --addon borealis-pg-hex-12345 pg_trgm
```

_See code: [src/commands/borealis-pg/extensions/install.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/extensions/install.ts)_

## `heroku borealis-pg:extensions:remove PG_EXTENSION`

removes a Postgres extension from a Borealis Isolated Postgres add-on database

```
USAGE
  $ heroku borealis-pg:extensions:remove PG_EXTENSION [-o <value>] [-a <value>] [-c <value>] [-s]

ARGUMENTS
  PG_EXTENSION  name of a Postgres extension

FLAGS
  -a, --app=<value>       app to which the add-on is attached
  -c, --confirm=<value>   bypass the prompt for confirmation by specifying the name of the extension
  -o, --addon=<value>     name or ID of an add-on or one of its attachments
  -s, --suppress-missing  suppress nonzero exit code when an extension is not installed

DESCRIPTION
  removes a Postgres extension from a Borealis Isolated Postgres add-on database

EXAMPLES
  $ heroku borealis-pg:extensions:remove --suppress-missing --app sushi postgis

  $ heroku borealis-pg:extensions:remove --app sushi --addon BOREALIS_PG_MAROON btree_gist

  $ heroku borealis-pg:extensions:remove --confirm uuid-ossp --addon borealis-pg-hex-12345 uuid-ossp
```

_See code: [src/commands/borealis-pg/extensions/remove.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/extensions/remove.ts)_

## `heroku borealis-pg:info`

shows information about a Borealis Isolated Postgres add-on database

```
USAGE
  $ heroku borealis-pg:info [-o <value>] [-a <value>]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments

DESCRIPTION
  shows information about a Borealis Isolated Postgres add-on database
```

_See code: [src/commands/borealis-pg/info.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/info.ts)_

## `heroku borealis-pg:integrations`

lists registered data integrations for a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:integrations [-o <value>] [-a <value>]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments

DESCRIPTION
  lists registered data integrations for a Borealis Isolated Postgres add-on

  A data integration allows a third party service access to an add-on database
  via a secure tunnel using semi-permanent SSH server and database credentials.
```

_See code: [src/commands/borealis-pg/integrations/index.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/integrations/index.ts)_

## `heroku borealis-pg:integrations:register SSH_PUBLIC_KEY`

registers a data integration with a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:integrations:register SSH_PUBLIC_KEY -n <value> [-o <value>] [-a <value>] [-w]

ARGUMENTS
  SSH_PUBLIC_KEY  an SSH public key to authorize for access

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -n, --name=<value>   (required) name of the add-on data integration
  -o, --addon=<value>  name or ID of an add-on or one of its attachments
  -w, --write-access   allow write access to the add-on Postgres database

DESCRIPTION
  registers a data integration with a Borealis Isolated Postgres add-on

  A data integration allows a third party service access to an add-on database
  via a secure tunnel using semi-permanent SSH server and database credentials.
  Typical uses include extract, transform and load (ETL) services and data
  warehouses.

  An SSH public key is required for SSH client authorization. It must be an RSA,
  ECDSA or Ed25519 public key in OpenSSH format. It will typically be provided
  to you by the third party service.

  The --name option is used internally to identify a data integration and to
  generate a unique database username for it; it must must consist only of
  lowercase letters, digits and underscores (_), and have between 1 and 25
  characters.

  Note that, in some cases, the service may require read and write access to an
  add-on database, in which case you can supply the --write-access option.

  The output includes an SSH server public host key value. This can be used to
  validate the identity of the SSH server if the data integration service
  supports it.

EXAMPLES
  $ heroku borealis-pg:integrations:register --app sushi --name my_integration1 ssh-ed25519 SSHPUBLICKEY1===

  $ heroku borealis-pg:integrations:register --write-access --app sushi --name my_integration2 ssh-rsa SSHPUBLICKEY2===
```

_See code: [src/commands/borealis-pg/integrations/register.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/integrations/register.ts)_

## `heroku borealis-pg:integrations:remove`

removes a data integration from a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:integrations:remove -n <value> [-o <value>] [-a <value>] [-c <value>]

FLAGS
  -a, --app=<value>      app to which the add-on is attached
  -c, --confirm=<value>  bypass the confirmation prompt by providing the name of the integration
  -n, --name=<value>     (required) name of the add-on data integration
  -o, --addon=<value>    name or ID of an add-on or one of its attachments

DESCRIPTION
  removes a data integration from a Borealis Isolated Postgres add-on

ALIASES
  $ heroku borealis-pg:integrations:deregister

EXAMPLES
  $ heroku borealis-pg:integrations:remove --app sushi --name my_integration1

  $ heroku borealis-pg:integrations:remove --confirm my_integration2 --app sushi --name my_integration2
```

_See code: [src/commands/borealis-pg/integrations/remove.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/integrations/remove.ts)_

## `heroku borealis-pg:psql`

runs psql with a secure tunnel to a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:psql [-o <value>] [-a <value>] [-b <value>] [-p <value>] [-w]

FLAGS
  -a, --app=<value>          app to which the add-on is attached
  -b, --binary-path=<value>  custom path to a psql binary
  -o, --addon=<value>        name or ID of an add-on or one of its attachments
  -p, --port=<value>         [default: 5432] local port number for the secure tunnel to the add-on Postgres server
  -w, --write-access         allow write access to the add-on Postgres database

DESCRIPTION
  runs psql with a secure tunnel to a Borealis Isolated Postgres add-on

  This operation establishes a temporary secure tunnel to an add-on database to
  provide an interactive psql session. It requires that the psql command is
  installed on the local machine; generally, psql is installed along with
  PostgreSQL (https://www.postgresql.org/download/).

  The psql session will be initiated as a database user role that is
  specifically tied to the current Heroku user account. By default the user role
  allows read-only access to the add-on database; to enable read and write
  access, supply the --write-access option.

  Note that any tables, indexes, views or other objects that are created when
  connected as a personal user role will be owned by that user role rather than
  the application database user role unless ownership is explicitly reassigned
  afterward (for example, by using the REASSIGN OWNED command).

  To override the path to the psql binary, supply the --binary-path option.

  See also the borealis-pg:run command to execute a noninteractive script or the
  borealis-pg:tunnel command to start a secure tunnel session that can be used
  in combination with any PostgreSQL client (e.g. a graphical user interface like
  pgAdmin).

EXAMPLES
  $ heroku borealis-pg:psql --app sushi --binary-path /path/to/psql

  $ heroku borealis-pg:psql --app sushi --addon BOREALIS_PG_MAROON --write-access

  $ heroku borealis-pg:psql --addon borealis-pg-hex-12345
```

_See code: [src/commands/borealis-pg/psql.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/psql.ts)_

## `heroku borealis-pg:restore:capabilities`

shows the restore capabilities of a Borealis Isolated Postgres add-on database

```
USAGE
  $ heroku borealis-pg:restore:capabilities [-o <value>] [-a <value>]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments

DESCRIPTION
  shows the restore capabilities of a Borealis Isolated Postgres add-on database

  Qualifying add-on databases may be restored to an earlier point in time or
  cloned. This operation outputs the earliest and latest points in time to which
  an add-on database may be restored when supported. Note that, when an add-on
  database is cloned, it will produce a physical copy as at the current time,
  regardless of the add-on's reported latest restorable time.

  See the borealis-pg:restore:execute command to perform a restore/clone.

ALIASES
  $ heroku borealis-pg:restore:info
```

_See code: [src/commands/borealis-pg/restore/capabilities.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/restore/capabilities.ts)_

## `heroku borealis-pg:restore:execute`

restores or clones a Borealis Isolated Postgres add-on database

```
USAGE
  $ heroku borealis-pg:restore:execute [-o <value>] [-a <value>] [--as <value>] [-d <value>] [-n <value>] [-t <value>]
  [--wait]

FLAGS
  -a, --app=<value>              app to which the source add-on is attached
  -d, --destination-app=<value>  [default: source add-on app] app to attach the new add-on to
  -n, --new-plan=<value>         [default: source add-on plan] add-on plan to apply to the new add-on
  -o, --addon=<value>            name or ID of the source add-on or one of its attachments
  -t, --restore-to-time=<value>  [default: now] date/time (in ISO 8601 format) to restore to
  --as=<value>                   name to assign to the new add-on attachment
  --wait                         wait until the add-on has finished before exiting

DESCRIPTION
  restores or clones a Borealis Isolated Postgres add-on database

  Qualifying add-on databases may be restored to an earlier point in time or
  cloned. This operation restores/clones the add-on database into a brand new
  add-on database, leaving the original add-on database unaffected. Note that,
  when an add-on database is cloned (that is, the --restore-to-time option is
  omitted), it will produce a physical copy as at the current time, regardless
  of the add-on's reported latest restorable time.

  See the borealis-pg:restore:capabilities command to determine the earliest and
  latest restorable times of an add-on.

EXAMPLES
  $ heroku borealis-pg:restore:execute --app sushi --addon SOURCE_DB --as CLONED_DB

  $ heroku borealis-pg:restore:execute --app sushi --restore-to-time 2023-02-24T18:42:00-08:00

  $ heroku borealis-pg:restore:execute --app sushi --destination-app my-other-app --new-plan x2-s100-p2-r8
```

_See code: [src/commands/borealis-pg/restore/execute.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/restore/execute.ts)_

## `heroku borealis-pg:run`

runs a command with a secure tunnel to a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:run [-o <value>] [-a <value>] [-d <value> | -i <value> | -e <value>] [-f table|csv|json|yaml |
    ] [-u] [-p <value>] [-w]

FLAGS
  -a, --app=<value>          app to which the add-on is attached
  -d, --db-cmd=<value>       database command to execute over the secure tunnel
  -e, --shell-cmd=<value>    shell command to execute when the secure tunnel is established
  -f, --format=<option>      [default: table] output format for database command results
                             <options: table|csv|json|yaml>
  -i, --db-cmd-file=<value>  UTF-8 file containing database command(s) to execute over the secure tunnel
  -o, --addon=<value>        name or ID of an add-on or one of its attachments
  -p, --port=<value>         [default: 5432] local port number for the secure tunnel to the add-on Postgres server
  -u, --personal-user        run as a personal user rather than a user belonging to the Heroku application
  -w, --write-access         allow write access to the add-on Postgres database

DESCRIPTION
  runs a command with a secure tunnel to a Borealis Isolated Postgres add-on

  An add-on Postgres database is, by design, inaccessible from outside of its
  virtual private cloud. As such, this operation establishes an ephemeral secure
  tunnel to an add-on database to execute a provided noninteractive command, then
  immediately closes the tunnel.

  A command can take the form of a database command or a shell command. In either
  case, it is executed using the Heroku application's dedicated database user
  role by default, but it can be made to execute as a database user role that is
  specifically tied to the current Heroku user account via the --personal-user
  option instead. Note that any tables, indexes, views or other objects that are
  created when connected as a personal user role will be owned by that user role
  rather than the Heroku application user role unless ownership is explicitly
  reassigned afterward (for example, by using the REASSIGN OWNED command).

  Regardless of whether running as the Heroku application's database user role
  or as a personal user role, the command will have read-only access to the
  add-on database by default; to enable read and write access, supply the
  --write-access option.

  Database commands are raw statements (e.g. SQL, PL/pgSQL) that are sent over
  the secure tunnel to the add-on Postgres database to be executed verbatim, with
  the results then written to the console on stdout.

  Shell commands are useful for executing an application's database migration
  scripts or other unattended database scripts. They are executed in a shell on
  the local machine with the following environment variables automatically set to
  allow scripts and applications that are launched by the command to connect over
  the secure tunnel to the remote add-on Postgres database:
  - PGHOST
  - PGPORT
  - PGDATABASE
  - PGUSER
  - PGPASSWORD
  - DATABASE_URL

  See also the borealis-pg:psql command to launch an interactive psql session or
  the borealis-pg:tunnel command to start a secure tunnel session that can be
  used in combination with any PostgreSQL client (e.g. a graphical user interface
  like pgAdmin).

EXAMPLES
  $ heroku borealis-pg:run --app sushi --db-cmd 'SELECT * FROM hello_greeting' --format csv

  $ heroku borealis-pg:run --app sushi --addon BOREALIS_PG_MAROON --db-cmd-file ~/scripts/example.sql --personal-user

  $ heroku borealis-pg:run --addon borealis-pg-hex-12345 --shell-cmd './manage.py migrate' --write-access
```

_See code: [src/commands/borealis-pg/run.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/run.ts)_

## `heroku borealis-pg:tunnel`

establishes a secure tunnel to a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:tunnel [-o <value>] [-a <value>] [-p <value>] [-w]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments
  -p, --port=<value>   [default: 5432] local port number for the secure tunnel to the add-on Postgres server
  -w, --write-access   allow write access to the add-on Postgres database

DESCRIPTION
  establishes a secure tunnel to a Borealis Isolated Postgres add-on

  This operation allows for a secure, temporary session connection to an add-on
  Postgres database that is, by design, otherwise inaccessible from outside of
  its virtual private cloud. Once a tunnel is established, use a tool such as
  psql or pgAdmin and the provided user credentials to interact with the add-on
  database.

  The credentials that will be provided belong to a database user role that is
  specifically tied to the current Heroku user account. By default the user role
  allows read-only access to the add-on database; to enable read and write
  access, supply the --write-access option.

  Note that any tables, indexes, views or other objects that are created when
  connected as a personal user role will be owned by that user role rather than
  the application database user role unless ownership is explicitly reassigned
  afterward (for example, by using the REASSIGN OWNED command).

  See also the borealis-pg:run command to execute a noninteractive script or the
  borealis-pg:psql command to launch an interactive psql session directly.

EXAMPLES
  $ heroku borealis-pg:tunnel --app sushi --port 54321

  $ heroku borealis-pg:tunnel --app sushi --addon BOREALIS_PG_MAROON

  $ heroku borealis-pg:tunnel --addon borealis-pg-hex-12345 --write-access
```

_See code: [src/commands/borealis-pg/tunnel.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/tunnel.ts)_

## `heroku borealis-pg:users`

lists database user roles for a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:users [-o <value>] [-a <value>]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments

DESCRIPTION
  lists database user roles for a Borealis Isolated Postgres add-on

  Note that this command's output only includes active add-on database user
  roles. The Heroku application's database user roles are always present.
  Personal read-only and read/write database user roles are automatically
  created or reactivated for any user that has permission to access any app the
  add-on is attached to when that user runs one of the borealis-pg:psql or
  borealis-pg:tunnel commands (or borealis-pg:run with the --personal-user
  option). All personal database user roles are automatically deactivated when
  the add-on's database user credentials are reset (for example, via the
  borealis-pg:users:reset command).
```

_See code: [src/commands/borealis-pg/users/index.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/users/index.ts)_

## `heroku borealis-pg:users:reset`

resets all database credentials for a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:users:reset [-o <value>] [-a <value>]

FLAGS
  -a, --app=<value>    app to which the add-on is attached
  -o, --addon=<value>  name or ID of an add-on or one of its attachments

DESCRIPTION
  resets all database credentials for a Borealis Isolated Postgres add-on

  The Heroku application's database user roles will be assigned new, random
  usernames and passwords and the application's config vars will be updated
  imminently with the new credentials. To ensure there is no application
  downtime, the old application database credentials will continue to remain
  valid for a short time after this operation is completed, after which they
  will be disabled.

  Any active personal database user roles will also be deactivated by this
  operation, which means that anyone that is currently connected to the database
  with a personal user role will be immediately disconnected. Rest assured that
  any tables, indexes, views or other objects that are are owned by a personal
  user role will not be affected (the user roles and the objects they own will
  continue to exist). A personal user role that has been deactivated will be
  automatically reactivated when the affected user runs one of the
  borealis-pg:psql or borealis-pg:tunnel commands (or borealis-pg:run with the
  --personal-user option).

  Add-on data integrations are unaffected by this operation. To revoke database
  credentials assigned to a data integration, use the
  borealis-pg:integrations:revoke command.
```

_See code: [src/commands/borealis-pg/users/reset.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v1.6.6/src/commands/borealis-pg/users/reset.ts)_
<!-- commandsstop -->
