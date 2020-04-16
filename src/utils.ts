import * as fs from 'fs';
import {promisify} from 'util';

export const readJSONFile = (path: string | number | Buffer, options?: { encoding?: null; flag?: string; }) : Promise<any> =>
    promisify(fs.readFile)(path, options)
        .then(buff => buff.toString())
        .then(str => JSON.parse(str));
export const writeJSONFile = (path: string | number | Buffer, content: any) => 
    promisify(fs.writeFile)(path, JSON.stringify(content));

export const timeoutString = (timeout : number) : string => {
    let hours = Math.floor(timeout / (60 * 60));
    let minutes = Math.floor((timeout - hours * (60 * 60)) / 60);
    let seconds = timeout - (hours * 60 + minutes) * 60;

    let res = [];
    if (hours > 0)
        res.push(hours, 'hours');
    if (minutes > 0)
        res.push(minutes, 'minutes');
    if (seconds > 0)
        res.push(seconds, 'seconds');
    if (res.length == 0)
        res.push('a moment');
    return res.join(' ');
}
export const now = () : number => Math.floor(Date.now() / 1000);

export const telegramUsername = (username: string) : string => {
    username = username.toLowerCase().trim();
    if (username[0] !== '@')
        username = '@' + username;
    return username;
}