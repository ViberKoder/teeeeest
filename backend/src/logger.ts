import pino from 'pino';
import { config } from './config';

/** Readable logs locally and optional pretty logs in production (LOG_PRETTY=true). Otherwise JSON lines for log aggregators. */
const usePretty =
  config.LOG_PRETTY || process.env.NODE_ENV === undefined || process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: usePretty
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      }
    : undefined,
});

export type Logger = typeof logger;
