# Garmin Connect To JSON

Save data from your Garmin Connect account into a JSON file. You can run it programatically (for example with GitLab or GitHub CI) to automatically back up your data into a JSON archive.

Note: Garmin doesn't offer a public API to normal users so this script scrapes the data from the Web page using your username and password. Your logins are rate limited so triggering this script too often will result in a temporary block for your IP.

## Configuration

1. Add your Garmin Connect username and password to `GARMIN_CONNECT_USERNAME` and `GARMIN_CONNECT_PASSWORD` environment variables (or into `.env` file in the root of your project).

## Usage

When you run `garmin-connect-to-json` first time, a `garminData.json` file (can be overrided) is created in the same directory and your most recent data is saved into it. Subsequent invocations will check the file, and add any new items that aren't already in it. The items are saved in order, latest first.

If you run this from CI, you might find `--fail-when-zero` flag handy as it returns error code 1 when there are no items.

```
Usage: garmin-connect-to-json [options]

Options:
  -o, --output-file <filepath>  specify where to output the tweets (default: "./garminData.json")
  -m, --month <YYYY-MM>         the month to fetch in YYYY-MM format (default: current month)
  --fail-when-zero              return exit status 1 if no new items are found
  -d, --debug                   debug (verbose) mode
  -V, --version                 output the version number
  -h, --help                    display help for command
```

## Contributing

All contributions are welcome! Please follow the [code of conduct](https://www.contributor-covenant.org/version/2/0/code_of_conduct/) when interacting with others.

[This project lives on GitLab](https://gitlab.com/uninen/garmin-connect-to-json) and is mirrored on GitHub.

[Follow @Uninen](https://twitter.com/uninen) on Twitter.
