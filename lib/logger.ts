/**
 * Production-safe logger
 * Silences all logs in production builds, keeps them in __DEV__ mode
 */
const noop = () => {};

export const logger = {
  log: __DEV__ ? console.log : noop,
  warn: __DEV__ ? console.warn : noop,
  error: console.error, // Always log errors
  debug: __DEV__ ? console.debug : noop,
};
