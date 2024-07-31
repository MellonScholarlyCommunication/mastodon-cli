const jsdom = require('jsdom');

/**
 * Extract references from the toot (if available)
 */
function handle(item) {
    const content = item.content;

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

    if (zreferences.length) {
        item['references'] = zreferences;
        return [ item ];
    }
    else {
        return [];
    }
}

module.exports = { handle };