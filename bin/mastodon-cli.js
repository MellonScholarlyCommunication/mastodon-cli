#!/usr/bin/env node

const { program } = require('commander');
const { sendNotification , fetchNotifications , getProfile , getAttachment } = require('../lib');
const fetch = require('node-fetch');
const fs = require('fs');
const fsPath = require('path');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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

program
  .command('account')
  .option('--url <url>','Mastodon host',BASE_URL)
  .option('-t,--timeout <seconds>','Timeout',1)
  .argument('<username>','Mastodon username')
  .action( async(username, opts) => {
    try {
        let host = opts.url;
        
        const res = await fetchWithTimeout(`${host}/api/v1/accounts/lookup?acct=${username}`,{
            timeout: opts.timeout * 1000
        });
        
        if (res.ok) {
            const data = await res.json();
            console.log(JSON.stringify(data,null,2));
        }
        else {
            console.error(res.statusText);
            process.exitCode = 2;
        }
    }
    catch(e) {
        console.error(`failed: ${e.message}`);
    }
  });


program
  .command('fetch')
  .option('--account <account>','Mastodon account')
  .option('--url <url>','Mastodon host',BASE_URL)
  .option('--token <access_token>','Mastodon access token', ACCESS_TOKEN)
  .option('--inbox <path>', 'Inbox to store notifications', INBOX_PATH)
  .option('--exclude <types>', 'Exclude notification types', EXCLUDE_TYPES)
  .option('--limit <num>', 'Limit number of notifications fetched', LIMIT_NUM)
  .option('--history <file>', 'Keep and use last since id from history file',HISTORY_FILE)
  .option('--id <id>', 'Get one notification by id')
  .option('--streaming')
  .option('--since <id>', 'Return results more recent than id')
  .option('--older <id>', 'Return results order than id')
  .option('--type <output>', 'Serialize what?', SERIALIZE_TYPE)
  .option('--handler <handler>', 'Notification handler',HANDLER)
  .action( async (options) => {
        const account = options.account;
        const url = options.url;
        const token = options.token;
        const exclude = options.exclude.split(",");
        const inbox = options.inbox;
        const limit = options.limit;
        const by_id = options.id;
        const by_streaming = options.streaming;
        const serialize_type = options.type;
        const handler = options.handler;
        const max_id = options.older;

        let since;

        if (options.history && fs.existsSync(options.history)) {
            since = fs.readFileSync(options.history, { encoding: 'utf-8' });
            logger.debug(`${options.history} -> since ${since}`);
        }

        if (options.since) {
            since = options.since;
        }

        try {
            const items = await fetchNotifications(url, {
                account: account ,
                token: token ,
                limit: limit ,
                exclude: exclude ,
                since: since ,
                max_id: max_id ,
                by_id: by_id ,
                by_streaming: by_streaming
            }, (item) => {
                processItem(item, {
                    inbox: inbox ,
                    serialize_type: serialize_type ,
                    handler: handler
                }); 

                if (options.history) {
                    const last_id = item.id;
                    logger.debug(`${options.history} <- since ${last_id}`);
                    fs.writeFileSync(options.history,last_id);
                }
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
                    logger.debug(`${options.history} <- since ${last_id}`);
                    fs.writeFileSync(options.history,last_id);
                }
            }
        }
        catch (e) {
            logger.error(`failed: ${e.message}`);
            logger.debug(e);
        }
  });

program
  .command('generate')
  .option('--account-id <url>','Account Id','http://localhost/profile/card#me')
  .option('--account-inbox <url>','Account Inbox','http://localhost/inbox/')
  .option('--account-name <name>','Account Name','Test Account')
  .option('--handler <handler>', 'Notification handler',HANDLER)
  .option('--inbox <path>', 'Inbox to store notifications', INBOX_PATH)
  .argument('<toot>','A toot message')
  .action( async (toot,options) => {
        const generator = (await dynamic_handler(options.handler, null)).makeAnnounce;
        const profile = {
            inbox: options.accountInbox
        };
        const item = {
            created_at: (new Date()).toISOString(),
            account: {
                url: options.accountId,
                display_name: options.accountName
            },
            status: {
                url: `urn:uuid:${uuidv4()}`,
                content: toot
            }
        };
        const links = [];

        const result = toot.match(/(http:\S+)/g);

        for (let i = 0 ; i < result.length ; i++) {
            links.push({
                type: 'Link',
                href: result[i]
            });
        }

        for (let i = 0; i < links.length ; i++) {
            const part = links[i];
            const json = generator(profile,item,[part]);
            const file = `${options.inbox}/${json.id.replaceAll(/urn:uuid:/g,'')}-${i+1}.jsonld}`;
            const meta_file = `${file}.meta`;
            if (options.inbox === 'stdout') {
                console.log(JSON.stringify(json,null,2));
            }
            else {
                fs.writeFileSync(file, JSON.stringify(json,null,2)); 
                fs.writeFileSync(meta_file, JSON.stringify({
                    'Content-Type': 'application/ld+json',
                    'Access-Control-Allow-Origin': '*'
                },null,2));
            }
        }
  });

program 
  .command('post')
  .option('--url <url>','Mastodon host',BASE_URL)
  .option('--token <access_token>','Mastodon access token', ACCESS_TOKEN)
  .option('--visibility <visibility>','Status visibility public|private|unlisted|direct','public')
  .argument('<toot>','toot to send')
  .action( async(toot,options) => {
    try {
        const response = await sendNotification(options.url,toot,options);
        logger.info(response.url);
        process.exit(0);
    }
    catch (e) {
        logger.error(`whoops: ${e.message}`);
        process.exit(2);
    }
  });

program
  .command('profile') 
  .option('-a,--attachment <regex>','attachment field regex')
  .argument('<url>','account link') 
  .action( async(url,options) => {
    if (options.attachment) {
        const re = new RegExp(options.attachment,"i");
        const profile = await getAttachment(url,re);
        console.log(profile);
    }
    else {
        const profile = await getProfile(url);
        console.log(profile);
    }
  });

program.parse();

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
    const processed_item = (await dynamic_handler(opts.handler, null)).handle(item);

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

function dynamic_handler(handler,fallback) {
    if (handler) {
        if (typeof handler === 'function') {
            logger.debug(`handler is explicit`);
            return handler;
        }
        else {
            handler = handler.replaceAll(/@handler/g,fsPath.resolve(__dirname,'..','handler'));
            const abs_handler = path.resolve(handler);
            logger.debug(`trying dynamic load of ${handler} -> ${abs_handler}`);
            delete require.cache[abs_handler];
            const pkg = require(abs_handler);
            return pkg;
        }
    }
    else {
        logger.debug(`using fallback handler`);
        return fallback;
    }
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
  
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    clearTimeout(id);
  
    return response;
}