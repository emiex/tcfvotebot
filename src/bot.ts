import {readJSONFile, writeJSONFile} from './utils';
import {bold} from 'colors';
import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs';

const escHTML = (str : string) => str.replace(/\</g, '&lt;').replace(/\>/g, '&gt;');

const pollOptionsLabels = {
    confirm: "Can confirm his/her identity",
    accept: "Accept",
    decline: "Decline",
    neutral: "Neutral"
};
const pollOptions = {
    newMember: ['confirm', 'accept', 'decline', 'neutral'],
    general: ['accept', 'decline']
};

type PollUpdateListener = (poll: TelegramBot.Poll, total: number, labels: any) => void;
// Bot does:
//   - create polls
//   - check polls status
export default class Bot {
    private token: string;
    private username: string;
    private chat?: number;
    private cache: BotCache;
    private admin?: string;

    private bot: TelegramBot;
    constructor(token: string, cachePath: string, username: string, chat?: number, admin?: string) {
        this.token = token;
        this.username = username;
        this.chat = chat;
        this.admin = admin;

        this.cache = new BotCache(cachePath);
        this.bot = new TelegramBot(this.token, {polling: true});

        const events = ['message', 'poll', 'callback_query', 'inline_query', 'chosen_inline_result', 'channel_post', 'edited_message', 'edited_message_text', 'edited_message_caption', 'edited_channel_post', 'edited_channel_post_text', 'edited_channel_post_caption', 'shipping_query', 'pre_checkout_query', 'polling_error', 'webhook_error', 'error']
        events.forEach(eventName => {
            // @ts-ignore
            this.bot.on(eventName, (message: any) => {
                // console.log(eventName, message);
                this.cache.update(message);
            })
        })
        
        this.bot.on('new_chat_members', (message: TelegramBot.Message) => {
            if (message.chat && message.new_chat_members &&
                message.new_chat_members.find(member => member.is_bot && member.username === this.username)) {
                console.log("I was added to " + bold(message.chat.title || '(no name)') + " chat! (ID: " + message.chat.id + ")");
                if (this.chat === undefined)
                    console.log("If this is the chat, you want to support, update your config.json.");
            }
        });

        // @ts-ignore
        this.bot.on('poll', async (poll: TelegramBot.Poll) => {
            if (!this.pollUpdateListener)
                throw new Error("Missing poll update listener!");
            if (!this.chat)
                throw new Error("Bot.makePoll(): no chat_id is specified. Add bot and put a chat id in config.json");
            let total = await this.bot.getChatMembersCount(this.chat);
            this.pollUpdateListener(poll, total, pollOptionsLabels);
        });
    }

    async makePoll(title: string, info: string, type: "newMember" | "general") : Promise<TelegramBot.Message> {
        if (this.chat === undefined)
            throw new Error('Bot.makePoll(): no chat_id is specified. Add bot and put a chat id in config.json');
        let messageIntro = await this.bot.sendMessage(this.chat, `<b>${escHTML(title)}</b>\n${escHTML(info)}`, {parse_mode: "HTML"});
        // @ts-ignore
        let messagePoll = await this.bot.sendPoll(this.chat, title, pollOptions[type].map(name => pollOptionsLabels[name]));
        return messagePoll;
    }

    
    private pollUpdateListener: PollUpdateListener | null = null;
    onPollUpdate(listener: PollUpdateListener) {
        this.pollUpdateListener = listener;
    }

    private reportToAdmin(message : string) {
        if (!this.admin)
            return console.error(message);
        let admin = this.cache.findByUsername(this.admin);
        if (!admin) {
            console.error('Bot.reportToAdmin(): failed to find admin by username (@' + this.admin + '). Please, ask admin to contact bot directly first.');
            console.error(message);
            return;
        }
        this.bot.sendMessage(admin.id, message, {
            parse_mode: "HTML"
        });
    }
}

interface CacheItem {
    id: number,
    is_bot?: boolean,
    username?: string,
    language_code?: string,
    first_name?: string,
    last_name?: string,
    type?: string
};
interface CacheContent {
    items: CacheItem[],
    byID: any,
    byUsername: any
};
const DefaultCacheContent : CacheContent = {
    items: [], byID: {}, byUsername: {}
}
class BotCache {
    inited: boolean = false;

    content: CacheContent | null = null;
    private path: string;
    constructor(path: string) {
        this.init(this.path = path);
    }

    private async init(path: string) {
        try {
            this.content = await readJSONFile(path);
        } catch (e) {
            if (e.code === 'ENOENT')
                this.content = DefaultCacheContent
            else throw e;
        }
        this.inited = true;
    }

    update(message: TelegramBot.Message | any) {
        let put = false;
        if (message.from) {
            this.put(message.from);
            put = true;
        }
        if (message.chat) {
            this.put(message.chat);
            put = true;
        }

        if (put)
            this.save();
    }

    put(item: CacheItem) {
        if (!this.inited)
            throw new Error('BotCache has not initialized yet.');

        let indexInIDs = this.content!.byID[item.id];

        if (indexInIDs !== undefined && indexInIDs >= 0) {
            this.content!.items[indexInIDs] = 
                Object.assign(this.content!.items[indexInIDs], item);
            if (item.username)
                this.content!.byUsername[item.username] = indexInIDs;
        } else {
            let index = this.content!.items.length;
            this.content!.items.push(item);
            this.content!.byID[item.id] = index;
            if (item.username)
                this.content!.byUsername[item.username] = index;
        }
    }

    private save() {
        writeJSONFile(this.path, this.content);
    }

    findByUsername(username: string) : CacheItem | null {
        if (!this.inited)
            throw new Error('BotCache has not initialized yet.');

        username = username.trim().toLowerCase();
        if (username[0] === '@')
            username = username.substring(1);

        let index = this.content!.byUsername[username];
        if (index !== undefined && index >= 0)
            return this.content!.items[index];
        return null;
    }
    findByID(id: number) : CacheItem | null {
        if (!this.inited)
            throw new Error('BotCache has not initialized yet.');

        let index = this.content!.byID[id];
        if (index !== undefined && index >= 0)
            return this.content!.items[index];
        return null;
    }
}