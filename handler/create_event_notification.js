const jsdom = require('jsdom');
const { v4: uuidv4 } = require('uuid');
const log4js = require('log4js');
const logger = log4js.getLogger();

const SPLIT_LINKS = process.env.MASTODON_HANDLER_FEATURE ? 
                        (/split_links/).test(process.env.MASTODON_HANDLER_FEATURE) : false;

/**
 * Extract references from the toot (if available) and
 * generate an Event Notification
 */
async function handle(item) {
    const content = item['status']?.['content'];

    if (! content) {
        logger.error('no content in notification');
        return [];
    }

    const dom = new jsdom.JSDOM(content);
    const jquery = require("jquery")(dom.window);

    const anchors = jquery('a');

    const zreferences = [];
    
    for (let i = 0 ; i < anchors.length ; i++) {
        const href = anchors[i].href;
        const className = anchors[i].className;

        if ( ! (className.match(/mention/g))) {
            zreferences.push(href);            
        }
    }

    if (! zreferences.length) {
        logger.warn('no references in notification');
        return [];
    }

    const profile = await findProfile(item['account']['url']);

    if (! profile) {
        logger.warn(`unable to dereference profile ${item['account']['url']}`);
        return [];
    }

    const links = [];

    for (let i = 0 ; i < zreferences.length ; i++) {
        links.push({
            "type": "Link" ,
            "href": zreferences[i]
        });
    }

    if (SPLIT_LINKS) {
        const results = [];

        for (let i = 0 ; i < links.length ; i++) {
            const resultItem = makeAnnounce(profile,item, [ links[i] ]);
            results.push(resultItem);
        }

        return results;
    }
    else {
        const resultItem = makeAnnounce(profile, item, links);
        return [ resultItem ];
    }
}

function makeAnnounce(profile,item,links) {
    const resultItem = {
        "@context" : "https://www.w3.org/ns/activitystreams" ,
        "id": `urn:uuid:${uuidv4()}`,
        "type": "Announce",
        "published": item['status']['created_at'],
        "actor": {
            "id": item['account']['url'],
            "name": item['account']['display_name'],
            "inbox": profile['inbox'],
            "type": "Person"
        }, 
        "origin": {
            "id": process.env.MASTODON_ORIGIN_ID ,
            "name": process.env.MASTODON_ORIGIN_NAME ,
            "inbox": process.env.MASTODON_ORIGIN_INBOX ,
            "type": process.env.MASTODON_ORIGIN_TYPE
        },
        "object": {
            "id": item['status']['url'],
            "content": item['status']['content'],
            "url": links ,
            "type": "Note"
        },
        "generator": {
            "id": "https://www.npmjs.com/package/mastodon-cli",
            "type": "Application",
            "context": item['status']['url']
        }
    };

    return resultItem;
}

async function findProfile(url) {
    logger.debug(`dereferencing ${url}`);
    const response = await fetch(url, {
        headers: {
            'accept': 'application/activity+json'
        }
    });

    if (response.ok) {
        return await response.json();
    }
    else {
        logger.error(`got ${response.status} - ${response.statusText} when dereferencing ${url}`);
        return undefined;
    }
}

module.exports = { handle };