const puppeteer = require('puppeteer');

let sharedBrowser = null;

const getSharedBrowser = async () => {
    if (!sharedBrowser) {
        sharedBrowser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    return sharedBrowser;
};

module.exports = { getSharedBrowser };
