# Mastodon client

A Mastodon client to store and process Toots

## INSTALL

```
yarn install
```

## USAGE

```
./bin/mastodon-cli.js
```

## OPTIONS

- `--url <url>` : Mastodon host (e.g. https://openbiblio.social)
- `--token <access_token>` : Mastodon access token generated for his application (see. your Mastoson profile, configuration, development)
- `--inbox <path|stdout>` : When to store the notifications
- `--exclude <types>` : A selection of notification types to ignore
- `--history <file>` : Keep a history file containing the last seen since id
- `--limit <num>` : The maximum number of notifications to retrieve
- `--id <id>` : Retrieve one notification by id
- `--since <id>` : Retrieve notifications created since some id
- `--serialize <ouput>` : What to serialize? 'as2': ActivityStreams2 (fetched from remote) , 'native': Megalodon processed JSON
- `--handler <handler>` : Hander JS file that can preprocess the generated output

## ENVIRONMENT

See `.env-example` for possible environmment variables that can be set. 
Rename to `.env` to set a default environment.