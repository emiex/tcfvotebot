import * as fs from 'fs';
import {promisify} from 'util';

export const readJSONFile = (path: string | number | Buffer, options?: { encoding?: null; flag?: string; }) : Promise<any> =>
    promisify(fs.readFile)(path, options)
        .then(buff => buff.toString())
        .then(str => JSON.parse(str));
export const writeJSONFile = (path: string | number | Buffer, content: any) => 
    promisify(fs.writeFile)(path, JSON.stringify(content));