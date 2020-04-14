import * as fs from 'fs';
import {promisify} from 'util';

export const readJSONFile = (path: string | number | Buffer, options?: { encoding?: null; flag?: string; }) : Promise<any> => {
    return promisify(fs.readFile)(path, options)
            .then(buff => buff.toString())
            .then(str => JSON.parse(str));
}