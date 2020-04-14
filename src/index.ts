import {readJSONFile} from './utils';
import Spreadsheet from './sheet';
import Bot from './bot';

async function main() {
    const config = await readJSONFile('config.json');
    const sheetCredentials = await readJSONFile(config.sheet.credentials || 'credentials.json');
    
    let spreadsheet = await Spreadsheet.getInstance(config.sheet.id, config.sheet.title, sheetCredentials);
    let bot = new Bot(config.bot.token, config.bot.cache, config.bot.username, config.bot.chat, config.bot.admin);

    spreadsheet.onNewProposal(async (data) => {
        let pollMessage = await bot.makePoll(data.name, data.info, 'newMember');
        data.votingput = 'TRUE';
        data.pollid = pollMessage.poll!.id;
        data.timestart = pollMessage.date;
        spreadsheet.saveRow(data);
    });

    bot.onPollUpdate(async (poll, total, labels) => {
        let row = spreadsheet.getProposalByPollId(poll.id);
        if (!row) {
            console.error("Failed to find proper purpose for this vote ID.");
            return;
        }
        
        for (let option of poll.options) {
            let key = null;
            for (let labelKey in labels) {
                if (labels[labelKey] === option.text) {
                    key = labelKey;
                    break;
                }
            }
            if (key === null) {
                console.error('Failed to find proper action for poll option label `'+key+'`');
                continue;
            }

            row['vote.' + key] = option.voter_count;
        }
        row['vote.total'] = total;
        let num = row.rowNumber;
        row['vote.result'] = `=SuperMajorityVoting_newmember(H${num};I${num};J${num};K${num};L${num})`;

        spreadsheet.saveRow(row);
    });

}
main();