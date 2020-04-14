import {bold} from 'colors';
import TelegramBot from 'node-telegram-bot-api';
//const TelegramBot = require('node-telegram-bot-api');

// Bot does:
//   - create polls
//   - check polls status
export default class Bot {
    private token: string;
    private username: string;
    private chat?: number;

    private bot: TelegramBot;
    constructor(token: string, username: string, chat?: number) {
        this.token = token;
        this.username = username;
        this.chat = chat;
        this.bot = new TelegramBot(this.token, {polling: true});

        //let events = ['poll', 'new_chat_members', 'message', 'new_chat_participant', 'callback_query'];
        //events.forEach(ev => this.bot.on(ev, (...args : any[]) => console.log(ev, ...args)));
        //this.bot.on('message', (msg : any) => console.log(msg));
        
        this.bot.on('new_chat_members', (message: TelegramBot.Message) => {
            if (message.chat && message.new_chat_members &&
                message.new_chat_members.find(member => member.is_bot && member.username === this.username)) {
                console.log("I was added to " + bold(message.chat.title || '(no name)') + " chat! (ID: " + message.chat.id + ")");
                console.log("If this is the chat, you want to support, update your config.json.");
            }
        });
    }
}