const log4js = require('log4js');
const logger = log4js.getLogger();
const megalodon = require('megalodon');

async function sendNotification(url,toot,opts) {
    return new Promise( (resolve) => {
        const generator = megalodon.default;
        const client = generator('mastodon', url, opts.token);

        logger.debug(opts);

        client.postStatus(toot).then( (res) => {
            resolve(res.data);
        });
    });
}

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

async function getProfile(account) {
    logger.debug(`fetching ${account}`);

    try {
        const response = await fetch(account , {
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

module.exports = {
    sendNotification ,
    fetchNotifications ,
    getProfile ,
    getAttachment
};