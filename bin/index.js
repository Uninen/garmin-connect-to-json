"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const dayjs_1 = __importDefault(require("dayjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const playwright_chromium_1 = require("playwright-chromium");
const rambda_1 = __importDefault(require("rambda"));
const package_json_1 = __importDefault(require("../package.json"));
dotenv_1.default.config({ path: path_1.default.resolve('../.env') });
const GARMIN_APP_VERSION = '4.55.3.1';
let data = [];
let items = [];
let itemsOriginally = 0;
let DEBUG = false;
let LOGIN_DELAY = 1100;
let [searchYear, searchMonth] = (0, dayjs_1.default)().format('YYYY-M').split('-');
let browserStoragePath = 'sessionStorage.json';
if (process.env.SESSION_STORAGE_PATH) {
    browserStoragePath = process.env.SESSION_STORAGE_PATH;
}
const program = new commander_1.Command();
program
    .option('-o, --output-file <filepath>', 'specify where to output the tweets', './garminData.json')
    .option('-m, --month <YYYY-MM>', 'the month to fetch in YYYY-MM format (default: current month)')
    .option('--fail-when-zero', 'return exit status 1 if no new items are found')
    .option('-d, --debug', 'debug (verbose) mode')
    .option('-a, --authenticate', 'forces authentication')
    .version(package_json_1.default.version)
    .parse(process.argv);
let forceAuth = !!program.authenticate;
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function fetchData(year, month) {
    return new Promise(async (resolve, reject) => {
        month = `${parseInt(month) - 1}`;
        let context = null;
        const browser = await playwright_chromium_1.chromium.launch({
            args: ['--disable-dev-shm-usage'],
            headless: true,
        });
        if (!forceAuth) {
            try {
                const storageData = await promises_1.default.readFile(browserStoragePath, {
                    encoding: 'utf8',
                });
                const storageState = JSON.parse(storageData);
                if (DEBUG) {
                    console.log('session storage found: ', storageState);
                }
                context = await browser.newContext({
                    storageState,
                });
                console.log(`✓ Using existing browser session.`);
            }
            catch (err) {
                console.log(`✓ Existing browser session not found.`);
                forceAuth = true;
            }
        }
        if (forceAuth || !context) {
            context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 1024 },
            });
        }
        const page = await context.newPage();
        page.setExtraHTTPHeaders({
            'X-app-ver': GARMIN_APP_VERSION,
            'NK': 'NT',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        });
        const url = `https://connect.garmin.com/modern/proxy/calendar-service/year/${year}/month/${month}`;
        if (DEBUG) {
            console.log('fetchData URL: ', url);
        }
        if (forceAuth) {
            try {
                await page.goto('https://connect.garmin.com/signin');
                await page.waitForSelector('iframe');
                await sleep(LOGIN_DELAY);
                try {
                    await page.waitForSelector('#truste-consent-button');
                    await page.click('#truste-consent-button');
                    console.log('#truste-consent-button clicked');
                }
                catch {
                    console.log('#truste-consent-button never came');
                }
                if (DEBUG) {
                    await sleep(LOGIN_DELAY);
                    await page.screenshot({
                        path: `debug-00-unfilled-login.png`,
                        fullPage: true,
                    });
                }
                await page.frames()[1].check('#login-remember-checkbox');
                await page.frames()[1].fill('input[name="username"]', process.env.GARMIN_CONNECT_USERNAME);
                await page.frames()[1].fill('input[name="password"]', process.env.GARMIN_CONNECT_PASSWORD);
                if (DEBUG) {
                    await sleep(LOGIN_DELAY);
                    await page.screenshot({
                        path: `debug-01-filled-login.png`,
                        fullPage: true,
                    });
                }
                await page.frames()[1].click('#login-btn-signin');
                await page.waitForSelector('.user-profile');
                await sleep(LOGIN_DELAY * 2);
                if (DEBUG) {
                    await page.screenshot({
                        path: `debug-02-after-login.png`,
                        fullPage: true,
                    });
                }
                await page.goto('https://connect.garmin.com/modern/calendar');
                const storage = await context.storageState();
                const storageJson = JSON.stringify(storage, null, 2);
                if (DEBUG) {
                    console.log('session storage: ', storageJson);
                }
                await promises_1.default.writeFile(browserStoragePath, storageJson);
                console.log(`✓ Browser session created and saved to ${browserStoragePath}`);
            }
            catch (err) {
                if (DEBUG) {
                    console.log(err);
                }
                return reject(err);
            }
        }
        await page.goto('https://connect.garmin.com/modern/calendar');
        await sleep(LOGIN_DELAY * 2);
        if (DEBUG) {
            await page.screenshot({
                path: `debug-03-calendar-home.png`,
                fullPage: true,
            });
        }
        page
            .goto(url)
            .then(async (response) => {
            if (!response) {
                return reject(new Error('Error: no response from Garmin Connect'));
            }
            const body = await response.body();
            const bodyString = body.toString();
            if (DEBUG) {
                console.log('Raw data: ', bodyString);
            }
            const content = await JSON.parse(bodyString);
            await browser.close();
            process.stdout.write(` Done.\n`);
            return resolve(content.calendarItems);
        })
            .catch((error) => {
            console.log('Error fetching data: ', error);
            return reject(error);
        });
    });
}
;
(async () => {
    if (!process.env.GARMIN_CONNECT_USERNAME) {
        console.error('Error: GARMIN_CONNECT_USERNAME environment variable not set.');
        process.exit(1);
    }
    if (!process.env.GARMIN_CONNECT_PASSWORD) {
        console.error('Error: GARMIN_CONNECT_PASSWORD environment variable not set.');
        process.exit(1);
    }
    DEBUG = !!program.debug;
    if (program.month) {
        ;
        [searchYear, searchMonth] = program.month.split('-');
    }
    try {
        const contents = await promises_1.default.readFile(program.outputFile, { encoding: 'utf8' });
        data = JSON.parse(contents);
        itemsOriginally = data.length;
        console.log(`✓ Found existing file with ${itemsOriginally} items.`);
    }
    catch (err) {
        console.log('No existing file found.');
    }
    process.stdout.write(`Querying ${searchYear}-${searchMonth}.. `);
    try {
        items = await fetchData(searchYear, searchMonth);
    }
    catch (err) {
        console.log('Data fetching failed.');
        process.exit(1);
    }
    if (items && items.length > 0) {
        if (DEBUG) {
            console.log(`found ${items.length} items`);
        }
        for (const obj of items) {
            const timestamp = (0, dayjs_1.default)(obj.startTimestampLocal).unix();
            if (timestamp) {
                data.push({ ...obj, timestamp: timestamp });
            }
            else {
                if (DEBUG) {
                    console.log('obj.id: ', obj.id);
                    console.log('obj.date: ', obj.date);
                }
            }
        }
        const uniqFn = (x, y) => x.id === y.id;
        const sortFn = (x) => x.timestamp;
        data = rambda_1.default.reverse(rambda_1.default.sortBy(sortFn, rambda_1.default.uniqWith(uniqFn, data)));
    }
    else {
        if (DEBUG) {
            console.log(`No items found for ${searchYear}-${searchMonth}.`);
        }
        if (program.failWhenZero) {
            process.exit(1);
        }
    }
    if (data.length > itemsOriginally) {
        await promises_1.default.writeFile(program.outputFile, JSON.stringify(data, null, 2));
        console.log(`Saved ${data.length} items.`);
        process.exit(0);
    }
    else {
        console.log(`No new items found.`);
        if (program.failWhenZero) {
            process.exit(1);
        }
        else {
            process.exit(0);
        }
    }
})();
