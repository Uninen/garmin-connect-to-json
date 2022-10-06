# Garmin Connect To JSON

Save data from your Garmin Connect account into a JSON file. Can be run programatically (for example with GitHub or GitLab CI) to automatically back up your data into a JSON archive.

**Note**: as Garmin doesn't offer a public API to normal users this script scrapes the data from Garmin Connect using your credentials. Your logins are rate limited so triggering this script too often will result in a temporary block for your IP.

## Usage

First add your Garmin Connect username and password to `GARMIN_CONNECT_USERNAME` and `GARMIN_CONNECT_PASSWORD` environment variables (or into `.env` file in the root of your project).

When you run `garmin-connect-to-json` first time, `garminData.json` file is created in the same directory and your most recent data is saved into it. Subsequent invocations will check the file, and add any new items that aren't already in it. The items are saved in reverse chronological order.

```
Usage: garmin-connect-to-json [options]

Options:
  -o, --output-file <filepath>  specify where to output the data (default: "./garminData.json")
  -m, --month <YYYY-MM>         the month to fetch in YYYY-MM format (default: current month)
  --fail-when-zero              return exit status 1 if no new items are found
  -V, --version                 output the version number
  -h, --help                    display this help message
```

### Running in CI and Debugging

- When running this from CI, you might find `--fail-when-zero` flag handy as it returns error code 1 when no items were found (exposing possible errors in the pipeline).
- Setting `PLAYWRIGHT_BROWSERS_PATH=0` environment variable forces the installation of the required browser inside `node_modules` which allows the binary to be cached as well. (See my [notes about running PlayWright in GitLab CI](https://til.unessa.net/gitlab/playwright-gitlab-ci/) for more.)
- Browser session is saved by default in `./sessionStorage.json` but this can be overridden by setting `SESSION_STORAGE_PATH`
- Set `GARMIN_CONNECT_DEBUG` to enable debug mode.

## About Data Formats

This script collects a specific format of your activity data (described in [`src/types.ts`](./src/types.ts)) which is provided to the calendar view on Garmin Connect. Most activities have more data available and those can be queried individually from other API endpoints. PRs are welcome for adding these.

## Contributing

All contributions are welcome! Please follow the [code of conduct](./CODE_OF_CONDUCT.md) when interacting with others.

[Follow @Uninen](https://twitter.com/uninen) on Twitter.
