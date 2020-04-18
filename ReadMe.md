## Telegram TCF Voting Bot

A Telegram Bot to automate voting and make it more clear.

Using a Google Spreadsheets as a database for votings data, bot finds new proposals and manages polls in Telegram chat.

### Setup

```bash
git clone https://github.com/emiex/tonbot
cd tonbot
npm install
# create config.json
npm start
```

Example of `config.json`:
```
{
    "sheet": {
        "credentials": /* path to credentials of google service account */,
        "id": /* id of document */,
        "title": /* title of sheet */,
        "link": /* link to the document with #gid=? at the end */,
        "formula": /* formula for `vote.result` field */
    },
    "bot": {
        "token": /* token of telegram bot */,
        "cache": /* path to cache file */,
        "username": /* username of bot */,
        "chat": /* id of chat */,
        "admin": /* username of admin */
    }
}
```