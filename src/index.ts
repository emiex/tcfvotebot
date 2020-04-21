import {readJSONFile, timeoutString, now, telegramUsername} from './utils';
import Spreadsheet from './sheet';
import Bot, {escapeHTML} from './bot';
import Logger from './logger';

async function main() {
    const config = await readJSONFile('config.json');
    const sheetCredentials = await readJSONFile(config.sheet.credentials || 'credentials.json');
    const pollTimeout = config.pollTimeout || 60 // 1 minute;
    const logger = new Logger();
    let spreadsheet = await Spreadsheet.getInstance(config.sheet.id, config.sheet.title, sheetCredentials);
    let bot = new Bot(config.bot.token, config.bot.cache, config.bot.username, config.bot.chat, config.bot.admin);

    const votestatus:any = {
        "FASTACCEPT": "Accepting",
        "WAIT_ACCEPT": "Accepting",
        "WAIT_DECLINE": "Declining",
    }

    logger.connectBot(bot);

    spreadsheet.onFirstLoad(async (rows) => {
        rows.filter(row => !spreadsheet.isTrue(row.done) && spreadsheet.isTrue(row.votingput))
            .forEach(row => {
                let timestart = parseInt(row.timestart);
                if (isNaN(timestart))
                    return console.error('Row #' + row.rowNumber + ' has NaN timestart!');
        
                let closePollBind = closePoll.bind(null, row.pollid);
                let timeout = pollTimeout - (now() - timestart);
                if (timeout < 0) {
                    logger.log("Server startup: found unfinished poll, that should be closed.");
                    closePollBind();
                } else {
                    logger.log("Server startup: set timeout to finish poll (" + rowLinkHTML(row) + "), " + timeoutString(timeout));
                    setTimeout(closePollBind, (timeout) * 1000);
                }
            });
    });

    
    
    spreadsheet.onEdit(async (row, prevrow) => {
        if (!spreadsheet.isTrue(row.votingput) || spreadsheet.isTrue(row.done))
            return;
        if (row.info === prevrow.info && row.name === prevrow.name && 
            row.invitedby === prevrow.invitedby && row.userinvited === prevrow.userinvited &&
            row.email === prevrow.email)
            return;

        logger.log("Noticed row edit on live poll: " + rowLinkHTML(row));
        bot.editMessage(row.messageid1, makeInfoText(row));
    });

    spreadsheet.onNewProposal(async (row) => {
        if (row.name.length === 0 || row.invitedby.length === 0)
            return logger.err(rowLinkHTML(row) + ' has no name or invitedby values!');
        
        let messages = await bot.makePoll(row.name, makeInfoText(row), 'newMember');
        row.votingput = 'TRUE';
        row.pollid = messages[1].poll!.id;
        row.messageid1 = messages[0].message_id;
        row.messageid2 = messages[1].message_id;
        row.timestart = messages[1].date;
        row.done = 'FALSE';
        
        await spreadsheet.saveRow(row);
        logger.log('Opened new voting for ' + rowLinkHTML(row) + '.');

        setTimeout(
            closePoll.bind(null, row.pollid),
            pollTimeout * 1000
        );
    });

    bot.onPollUpdate(async (poll, total, labels) => {
        if (poll.is_closed)
            return;

        let row = spreadsheet.getProposalByPollId(poll.id);
        if (!row)
            return logger.err("Failed to find proper purpose for this vote ID.");
        if (spreadsheet.isTrue(row.done))
            return logger.err('Received poll update, when proposal is done. (WTF???)');

        let res : any = {};
        for (let option of poll.options) {
            let key = null;
            for (let labelKey in labels) {
                if (labels[labelKey] === option.text) {
                    key = labelKey;
                    break;
                }
            }
            if (key === null) {
                logger.err('Failed to find proper action for poll option label `'+key+'`');
                continue;
            }

            row['vote.' + key] = option.voter_count;
            res[key] = option.voter_count;
        }
        row['vote.total'] = total;
        calcResult(row, false);

        logger.log('Poll updated (' + Object.keys(res).map(key => key + ': ' + res[key]).join(', ') + '): ' + rowLinkHTML(row));

        await spreadsheet.saveRow(row);

        if (row['vote.result'] === 'FASTACCEPT') {
            closePoll(row.pollid, false);
        }
    });

    async function closePoll(pollid: string, calculateResult: boolean = true) {
        // if (typeof pollid === 'string')
        //     pollid = parseInt(pollid);
        let row = spreadsheet.getProposalByPollId(pollid);
        if (row === undefined)
            return logger.err('closePoll(): didn\'t find a row by poll id (' + pollid + ')');

        if (spreadsheet.isTrue(row.done))
            return;

        if (calculateResult) {
            row.done = 'TRUE';
            calcResult(row, true);
            await spreadsheet.saveRow(row);
            row = spreadsheet.getProposalByPollId(pollid);
        }

        let admin = config.bot.admin ? telegramUsername(escapeHTML(config.bot.admin)) : '',
            invitedby = row.invitedby.length > 0 ? telegramUsername(escapeHTML(row.invitedby)) : '';
        if (admin === invitedby)
            invitedby = '';

        let result = row['vote.result'], reason;
        if (result === 'FASTACCEPT') {
            reason = 'Voting is resolved instantly with a positive result, new member is accepted. ' + admin + ' ' + invitedby;
        } else if (result === 'WAIT_ACCEPT') {
            reason = 'After ' + timeoutString(pollTimeout) + ' from the voting, new member is accepted. ' + admin + ' ' + invitedby;
        } else if (result === 'WAIT_DECLINE' || result.length == 0) {
            result = 'WAIT_DECLINE';
            reason = 'After ' + timeoutString(pollTimeout) + ' from the voting, new member is rejected. ' + admin;
        } else {
            console.error('Unknown voting result: ' + result + ' (row #' + row.rowNumber + ')');
            reason = 'Unknown result. (Function in spreadsheet returned unknown value!) ' + admin;
        }

        let debug = '<i>' + rowLinkHTML(row) + ' <b>' + votestatus[result] + '</b></i>';

        await bot.stopPoll(row.messageid2, reason + "\n" + debug);
        logger.log('Stopped poll: ' + rowLinkHTML(row) + '. Result: ' + result);

        if (!calculateResult) {
            row.done = 'TRUE';
            await spreadsheet.saveRow(row);
        }
    }

    function calcResult(row : any, timepassed: boolean) {
        let num = row.rowNumber;
        row['vote.result'] = config.sheet.formula.replace(/№/g, num + '').replace(/timepassed/g, timepassed ? "true" : "false");
    }
 
    function rowLink(row: any) : string | undefined {
        let rowNum = row.rowNumber;
        return config.sheet.link ? config.sheet.link + '&range=' + rowNum + ':' + rowNum : undefined;
    }
    function rowLinkHTML(row: any) : string | undefined {
        return '<a href="'+rowLink(row)+'">Row #' + row.rowNumber + ' ' + (row.name ? '(' + row.name + ')' : '') + '</a>';
    }
    function makeInfoText(row : any) : string {
        let votetitle = '<b>' + escapeHTML(row.name) + '</b>' + (row.userinvited.length > 0 ? "(" + row.userinvited + ")" : "");
        let info = votetitle + "\n" + escapeHTML(row.info);
        return info + '\n\n<i><a href="' + rowLink(row) + '">Link to the spreadsheet</a>' + (row.invitedby.length > 0 ? " (Invited by " + telegramUsername(escapeHTML(row.invitedby)) + ")" : "") + '</i>';
    }


    process.on('unhandledRejection', (error: any) => {
        if (error) {
            try {
                logger.err('[unhandledRejection]', error);
            } catch (e) { throw e; }
        }
    });
}

main();

// a very stupid fix to shutdown server each hour. I will fix that, I swear!
setTimeout(() => process.exit(20), 1000 * 60 * 60);
