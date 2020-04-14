import {readJSONFile} from './utils';
import Spreadsheet from './sheet';
import Bot from './bot';

async function main() {
    const config = await readJSONFile('config.json');
    const sheetCredentials = await readJSONFile(config.sheet.credentials || 'credentials.json');
    
    let spreadsheet = await Spreadsheet.getInstance(config.sheet.id, config.sheet.title, sheetCredentials);
    let bot = new Bot(config.bot.token, config.bot.username);

    spreadsheet.onNewProposal(async (data) => {
        console.log(data.rowNumber);
        data.votingput = 'TRUE';
        spreadsheet.saveRow(data);
    });

}
main();