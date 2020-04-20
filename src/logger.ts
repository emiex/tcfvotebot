import Bot from './bot';

export default class Logger {
    bot?: Bot;
    constructor(bot?: Bot) {
        this.bot = bot;
    }

    connectBot(bot: Bot) {
        this.bot = bot;
    }

    log(...args: any) {
        this.report('💬 ' + this.toString(args), true);
    }

    warn(...args: any) {
        this.report('⚠️ ' + this.toString(args));
    }

    err(...args: any) {
        this.report('⛔️ ' + this.toString(args));
    }

    private report(msg: string, silent : boolean = false) {
        console.log(msg);
        if (this.bot)
            this.bot.report(msg, silent);
    }

    private toString(args: any[]) {
        return args.map(arg => {
            if (arg instanceof Error)
                return arg.stack || arg.message || arg.toString();
            if (typeof arg === 'object')
                return JSON.stringify(arg, null, '\t');
            return arg + "";
        }).join(' ');
    }
}
