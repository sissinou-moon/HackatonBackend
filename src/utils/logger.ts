import * as fs from 'fs';
import * as path from 'path';

// Logs directory path
const LOGS_DIR = path.join(process.cwd(), 'logs');

// Capture server start time once when module loads
const SERVER_START_TIME = new Date();

// Generate log file name based on server start time
function getLogFileName(): string {
  const year = SERVER_START_TIME.getFullYear();
  const month = String(SERVER_START_TIME.getMonth() + 1).padStart(2, '0');
  const day = String(SERVER_START_TIME.getDate()).padStart(2, '0');
  const hours = String(SERVER_START_TIME.getHours()).padStart(2, '0');
  const minutes = String(SERVER_START_TIME.getMinutes()).padStart(2, '0');
  const seconds = String(SERVER_START_TIME.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}.log`;
}

// Ensure logs directory exists
function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

// Format timestamp for log entries (human readable)
function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

// Log levels
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// Write log entry to file
function writeLog(level: LogLevel, message: string, ...args: unknown[]): void {
  ensureLogsDir();
  
  const timestamp = getTimestamp();
  const fileName = getLogFileName();
  const filePath = path.join(LOGS_DIR, fileName);
  
  // Format additional arguments
  let formattedArgs = '';
  if (args.length > 0) {
    formattedArgs = ' ' + args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }
  
  const logEntry = `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;
  
  // Append to log file
  fs.appendFileSync(filePath, logEntry, 'utf8');
}

// Logger interface matching console methods
export const logger = {
  log: (message: string, ...args: unknown[]): void => {
    writeLog('INFO', message, ...args);
  },
  
  info: (message: string, ...args: unknown[]): void => {
    writeLog('INFO', message, ...args);
  },
  
  warn: (message: string, ...args: unknown[]): void => {
    writeLog('WARN', message, ...args);
  },
  
  error: (message: string, ...args: unknown[]): void => {
    writeLog('ERROR', message, ...args);
  },
  
  debug: (message: string, ...args: unknown[]): void => {
    writeLog('DEBUG', message, ...args);
  }
};

// Default export for easy importing
export default logger;
