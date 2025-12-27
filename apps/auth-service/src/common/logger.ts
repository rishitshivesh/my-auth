import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';

const options = pretty({ colorize: true });

export const logger: Logger = pino(options);
