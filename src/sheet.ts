const {
    GoogleSpreadsheet, 
    GoogleSpreadsheetWorksheet, 
    GoogleSpreadsheetRow
} = require('google-spreadsheet');

export const requiredHeaderValues = [
    'invitedby',
    'userinvited',
    'name',
    'email',
    'info',

    'validated',
    'votingput',

    'timestart',
    'pollid',
    'messageid1',
    'messageid2',

    'vote.confirm',
    'vote.accept',
    'vote.decline',
    'vote.neutral',
    'vote.total',
    'vote.result',

    'done'
];

/*
    1) Spreadsheet  ===(new proposals)==> Bot
    2) Spreadsheet <===(update voting)=== Bot

    1) spreadsheet.onNewProposal(callback)
    2) spreadsheet.getProposalByMessageId(messageId)
*/

class PromiseWrapper {
    promise: Promise<unknown>;
    resolve: (arg?: unknown) => void;
    reject: (arg?: unknown) => void;
    constructor() {
        this.resolve = this.reject = () => {
            throw new Error("PromiseWrapper: didn't take resolve/reject functions");
        };
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

const TimeoutPromise = (timeout: number) : Promise<void> => new Promise<void>(resolve => setTimeout(resolve, timeout));

class RequestsOrderExecution {
    interval: number;
    constructor(interval: number) {
        this.interval = interval;
        this.order = new Array();
    }

    private lastExecution: number = 0;

    private order: PromiseWrapper[];
    reserve() : Promise<unknown> {
        let promise = new PromiseWrapper();
        this.order.push(promise);

        if (this.order.length === 1) {
            this.next();
        }
        
        return promise.promise;
    }

    release() {
        if (this.order.length === 0)
            return;
        this.next();
    }

    private waitInterval() : Promise<void> {
        let diff = (Date.now() - this.lastExecution);
        if (diff >= this.interval) {
            return Promise.resolve();
        } else {
            return TimeoutPromise(this.interval - diff);
        }
    }
    private next() {
        this.waitInterval().then(() => {
            if (this.order.length > 0) {
                this.lastExecution = Date.now();
                this.order.shift()!.resolve()
            }
        });
    }
}

export const updateTimeout = 2000;
export default class Spreadsheet {
    docLink: string;
    sheetTitle: string;
    credentials: any;
    inited: boolean = false;

    doc: typeof GoogleSpreadsheet;
    sheet: typeof GoogleSpreadsheetWorksheet;
    rows?: typeof GoogleSpreadsheetRow[];

    private order: RequestsOrderExecution;

    private constructor(docLink: string, sheetTitle: string, credentials: any) {
        this.docLink = docLink;
        this.sheetTitle = sheetTitle;
        this.credentials = credentials;
        this.rowsIgnored = new Array();
        this.order = new RequestsOrderExecution(
            1000 // 100 requests per 100 seconds for 1 user
        );
    }
    static async getInstance (docLink : string, sheetTitle : string, credentials : any) : Promise<Spreadsheet> {
        let instance = new Spreadsheet(docLink, sheetTitle, credentials);
        await instance.init();
        return instance;
    }

    async init() {
        this.doc = new GoogleSpreadsheet(this.docLink);
        await this.doc.useServiceAccountAuth(this.credentials);

        try {
            await this.doc.loadInfo();
        } catch (e) {
            if (e.response && e.response.status === 403)
                console.error('It seems, that I don\'t have an access to the spreadsheet.\nPlease, give me an access: ' + this.credentials.client_email);
            throw e;
        }

        this.sheet = this.doc.sheetsByIndex.find((sheet : any) => sheet.title === this.sheetTitle);
        if (this.sheet === undefined)
            throw new Error("There is no sheet with `"+this.sheetTitle+"` title.\nActually, there are these sheets: `" + this.doc.sheetsByIndex.map((sheet : any) => sheet.title).join('`, `') + '`.');

        await this.sheet.loadHeaderRow();

        let missingHeaders = [];
        for (let requiredHeader of requiredHeaderValues) {
            if (!this.sheet.headerValues.includes(requiredHeader)) {
                missingHeaders.push(requiredHeader);
                break;
            }
        }
        if (missingHeaders.length > 0)
            throw new Error("Missing `" + missingHeaders.join('`, `') + "` header"+(missingHeaders.length>1?'s':'')+" in the table.");

        this.inited = true;

        this.update(true, updateTimeout);
    }
    
    private _onNewProposal?: (arg: typeof GoogleSpreadsheetRow) => void;
    onNewProposal(callback: (arg: typeof GoogleSpreadsheetRow) => void) {
        this._onNewProposal = callback;
    }
    private _onFirstLoad?: (arg: typeof GoogleSpreadsheetRow[]) => void;
    onFirstLoad(callback: (arg: typeof GoogleSpreadsheetRow[]) => void) {
        this._onFirstLoad = callback;
    }
    private _onEdit?: (arg: typeof GoogleSpreadsheetRow, arg2: typeof GoogleSpreadsheetRow) => void;
    onEdit(callback: (arg: typeof GoogleSpreadsheetRow, arg2: typeof GoogleSpreadsheetRow) => void) {
        this._onEdit = callback;
    }

    getProposalByPollId(pollId: string | number) {
        return this.rows ? this.rows.find(row => row.pollid == pollId) : undefined;
    }

    private firstLoad: boolean = true;
    private async update(next: boolean, timeout: number) {
        await this.order.reserve();

        let prevRows = this.rows;
        this.rows = await this.sheet.getRows();
        if (this.firstLoad && this._onFirstLoad) {
            this.firstLoad = false;
            this._onFirstLoad(this.rows!);
        }

        this.process(this.rows!, prevRows);

        if (next)
            setTimeout(this.update.bind(this, next, timeout), timeout);

        this.order.release();
    }

    private rowsIgnored: number[];
    private process(rows: typeof GoogleSpreadsheetRow[], prevRows?: typeof GoogleSpreadsheetRow[]) {
        if (prevRows) {
            for (let row of rows) {
                let same = null;
                for (let pRow of prevRows) {
                    if (row.rowNumber === pRow.rowNumber) {
                        same = pRow;
                        break;
                    }
                }

                if (same == null)
                    continue;

                if (!this.areSame(row, same)) {
                    let ignoreIndex;
                    if ((ignoreIndex = this.rowsIgnored.indexOf(row.rowNumber)) >= 0)
                        this.rowsIgnored.splice(ignoreIndex, 1);
                    if (this._onEdit)
                        this._onEdit(row, same);
                }
            } 
        }

        for (let row of rows) {
            if ( this.isTrue(row.validated) && 
                !this.isTrue(row.votingput) && 
                !this.rowsIgnored.includes(row.rowNumber)) {
                if (this._onNewProposal == null) {
                    console.error("New proposal found (" + row.name + "), but Spreadsheet object doesn't have a callback. Call onNewProposal with your callback.");
                } else {
                    this._onNewProposal(row);
                    this.rowsIgnored.push(row.rowNumber);
                }
            }
        }
    }

    private areSame(a: typeof GoogleSpreadsheetRow, b: typeof GoogleSpreadsheetRow) : boolean {
        for (let field of requiredHeaderValues)
            if (a[field] !== b[field])
                return false;
        return true;
    }

    isTrue(a : string) : boolean {
        a = (a || '').toLowerCase().trim();
        return a === 'true' || a === '1';
    }

    async saveRow(row: typeof GoogleSpreadsheetRow) {
        await this.order.reserve();
        await row.save();
        this.order.release();
    }
}