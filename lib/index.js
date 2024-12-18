const log4js = require('log4js');
const logger = log4js.getLogger();
const { backOff } = require('exponential-backoff');
const megalodon = require('megalodon');

async function sendNotification(url,toot,opts) {
    return new Promise( (resolve,reject) => {
        const generator = megalodon.default;
        const client = generator('mastodon', url, opts.token);

        logger.debug(opts);

        client.postStatus(toot,opts).then( (res) => {
            resolve(res.data);
        }).catch( (error) => {
            reject(error);
        });
    });
}

async function fetchNotifications(url,opts,callback) {
    return new Promise( (resolve,reject) => {
        const generator = megalodon.default;
        const client = generator('mastodon', url, opts.token);

        logger.debug(opts);

        if (opts.by_id) {
            client.getNotification(opts.by_id)
                .then( (res) => {
                    logger.debug(JSON.stringify(res.data,null,2));
                    resolve([res.data]);
                })
                .catch(err => reject(err));
        }
        else if (opts.account) {
            client.getAccountStatuses(opts.account, {
                exclude_reblogs: opts.exclude.includes('reblog'),
                exclude_replies: opts.exclude.includes('reply'),
                only_public: true ,
                limit: opts.limit ,
                since_id: opts.since ,
                max_id: opts.max_id
            })
            .then((res) => {
                logger.debug(res);
                resolve(res.data.map( (item) => { 
                    const id = item['id'];
                    const account = item['account'];
                    const created_at = item['created_at'];
                    delete item['id'];
                    delete item['account'];
                    delete item['created_at'];
                    const newItem = {
                        id: id ,
                        type: 'status' ,
                        account: account ,
                        created_at: created_at ,
                        status: item
                    };
                    return newItem
                }));
            })
            .catch(err => reject(err));
        }
        else if (opts.by_streaming) {
            client.userStreaming()
                .then(stream => {
                    stream.on('connect', () => { logger.info(`connecting to ${url}`) });
                    stream.on('notification', (notification) => {
                        const type = notification['type'];

                        if (type) {
                            if (opts.exclude.includes(type)) {
                                // do nothing
                            }
                            else {
                                callback(notification)
                            }
                        }
                    });
                    stream.on('error', (err) => {
                        logger.error(err);
                    });
                    stream.on('parser-error', (err) => {
                        logger.error(err);
                    });
                    stream.on('close', () => {
                        logger.info(`connection closed`);
                        resolve([]);
                    })
                })
                .catch(err => reject(err));
        }
        else {
            client.getNotifications({
                    limit: opts.limit ,
                    exclude_types: opts.exclude ,
                    since_id: opts.since ,
                    max_id: opts.max_id ,
                })
                .then((res) => {
                    logger.debug(res);
                    resolve(res.data);
                })
                .catch(err => reject(err));
        }
    });
}

async function getProfile(account) {
    logger.debug(`fetching ${account}`);

    try {
        const response = await backOff_fetch(account , {
            method: 'GET',
            headers: {
                'Accept': 'application/activity+json'
            }
        });

        if (response.ok) {
            return await response.json();
        }
        else {
            logger.error(`failed (${response.status}) : ${response.statusText}`)
            return null;
        }
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function getAttachment(account,regex) {
    const profile = await getProfile(account);

    if (!profile) {
        return null;
    }

    if (! profile['attachment']) {
        return null;
    }

    const hits = profile['attachment'].filter( (item) => {
        if (item['name'].match(regex)) {
            return true;
        }
        else {
            return false;
        }
    }).map( (item) => {
        return item['value'].replaceAll(/<[^>]+>/g,'')
    });

    if (hits) {
        return hits[0];
    }
    else {
        return null;
    }
}

async function backOff_fetch(url,options) {
    return await backOff( () => fetch(url,options) , {
        numOfAttempts: process.env.MASTODON_RETRY ?? 10,
        retry: (e,attempt) => {
            logger.warn(`attempt ${attempt} on ${url}`);
            return true;
        }
    });
}

module.exports = {
    sendNotification ,
    fetchNotifications ,
    getProfile ,
    getAttachment
};