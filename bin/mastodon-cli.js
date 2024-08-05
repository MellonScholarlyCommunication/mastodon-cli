#!/usr/bin/env node

const { program } = require('commander');
const megalodon = require('megalodon');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE_URL = process.env.MASTODON_URL;
const ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;
const INBOX_PATH = process.env.MASTODON_INBOX_PATH ?? './inbox';
const EXCLUDE_TYPES = process.env.MASTODON_EXCLUDE_TYPES ?? '';
const LIMIT_NUM = process.env.MASTODON_LIMIT_NUM ?? 10;
const HISTORY_FILE = process.env.MASTODON_HISTORY_FILE;
const SERIALIZE_TYPE = process.env.MASTODON_SERIALIZE_TYPE ?? 'native';
const HANDLER = process.env.MASTODON_HANDLER;

const log4js = require('log4js');
const logger = log4js.getLogger();

log4js.configure({
    appenders: {
      stderr: { type: 'stderr' }
    },
    categories: {
      default: { appenders: ['stderr'], level: process.env.LOG4JS ?? 'INFO' }
    }
});

program
  .name('mastodon-cli')
  .option('--url <url>','Mastodon host',BASE_URL)
  .option('--token <access_token>','Mastodon access token', ACCESS_TOKEN)
  .option('--inbox <path>', 'Inbox to store notifications', INBOX_PATH)
  .option('--exclude <types>', 'Exclude notification types', EXCLUDE_TYPES)
  .option('--limit <num>', 'Limit number of notifications fetched', LIMIT_NUM)
  .option('--history <file>', 'Keep and use last since id from history file',HISTORY_FILE)
  .option('--id <id>', 'Get one notification by id')
  .option('--since <id>', 'Return results more recent than id')
  .option('--type <output>', 'Serialize what?', SERIALIZE_TYPE)
  .option('--handler <handler>', 'Notification handler',HANDLER)
  .action( async (options) => {
        const url = options.url;
        const token = options.token;
        const exclude = options.exclude.split(",");
        const inbox = options.inbox;
        const limit = options.limit;
        const by_id = options.id;
        const serialize_type = options.type;
        const handler = options.handler;

        let since;

        if (options.history && fs.existsSync(options.history)) {
            since = fs.readFileSync(options.history, { encoding: 'utf-8' });
            logger.info(`${options.history} -> since ${since}`);
        }

        if (options.since) {
            since = options.since;
        }

        const items = await fetchNotifications(url, {
            token: token ,
            limit: limit ,
            exclude: exclude ,
            since: since ,
            by_id: by_id
        });

        if (items && items.length) {
            for (let i = 0 ; i < items.length ; i += 1) {
                processItem(items[i], {
                    inbox: inbox ,
                    serialize_type: serialize_type ,
                    handler: handler
                });
            }

            if (options.history) {
                // Searching for the most recent id
                const last_id = items.sort( (a,b) => {
                    return b['created_at'].localeCompare(a['created_at']);  
                })[0].id;
                logger.info(`${options.history} <- since ${last_id}`);
                fs.writeFileSync(options.history,last_id);
            }
        }
  });

program.parse();

async function fetchNotifications(url,opts) {
    return new Promise( (resolve) => {
        const generator = megalodon.default;
        const client = generator('mastodon', url, opts.token);

        logger.debug(opts);

        if (opts.by_id) {
            client.getNotification(opts.by_id).then( (res) => {
                logger.debug(JSON.stringify(res.data,null,2));
                resolve([res.data]);
            });
        }
        else {
            client.getNotifications({
                    limit: opts.limit ,
                    exclude_types: opts.exclude,
                    since_id: opts.since
                })
                .then((res) => {
                    logger.debug(res);
                    resolve(res.data);
                });
        }
    });
}

async function processItem(item, opts) {
    const type = item.type;

    const id = item.id;
    const url  = item.status?.url;
    const date = item.created_at;
    const account = item.account?.acct;

    logger.info(`${id} ${date} ${type} ${account} ${url}`);

    if (opts.serialize_type === 'as2') {
        if (url) {
            try {
                logger.debug(`fetching ${url}`);

                const response = await fetch(url, {
                    headers: {
                        'accept': 'application/activity+json'
                    }
                });

                if (response.ok) {
                    const body = await response.json();

                    await writeOutput(id, body, { inbox: opts.inbox , handler: opts.handler });
                }
                else {
                    logger.error(`failed to fetch ${url}`);
                }
            }
            catch (e) {
                logger.error(e);
            }
        }
        else {
            logger.warn(`no url for ${id} (${type})`);
        }
    }
    else if (opts.serialize_type === 'native') {
        await writeOutput(id, item, { inbox: opts.inbox , handler: opts.handler });
    }
    else {
        logger.error(`unknown serializer type: ${opts.serialize_type} : use 'as2' or 'native'`);
    }
}

async function writeOutput(id,item,opts) {
    const processed_item = await dynamic_handler(opts.handler, default_handler)(item);

    for (let i = 0 ; i < processed_item.length ; i++) {
        const file = `${opts.inbox}/${id}-${i+1}.jsonld`;

        if (opts.inbox === 'stdout') {
            console.log(JSON.stringify(processed_item[i],null,2));
        }
        else {
            logger.debug(`writing ${file}`);
            fs.writeFileSync(file, JSON.stringify(processed_item[i],null,2)); 
        }

        const meta_file = `${opts.inbox}/${id}-${i+1}.jsonld.meta`;

        if (opts.inbox === 'stdout') {
            // Do nothing
        }
        else {
            logger.debug(`writing ${meta_file}`);
            fs.writeFileSync(meta_file, JSON.stringify({
                'Content-Type': 'application/ld+json',
                'Access-Control-Allow-Origin': '*'
            },null,2));
        }
    }
}

function default_handler(item) {
    return [ item ];
}

function dynamic_handler(handler,fallback) {
    if (handler) {
        if (typeof handler === 'function') {
            logger.debug(`handler is explicit`);
            return handler;
        }
        else {
            const abs_handler = path.resolve(handler);
            logger.debug(`trying dynamic load of ${handler} -> ${abs_handler}`);
            delete require.cache[abs_handler];
            const func = require(abs_handler).handle;
            return func;
        }
    }
    else {
        logger.debug(`using fallback handler`);
        return fallback;
    }
}