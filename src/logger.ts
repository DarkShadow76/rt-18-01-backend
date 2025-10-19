// Legacy logger - deprecated
// Use LoggerService from src/common/logger/logger.service.ts instead

import { createLogger, format, transports } from 'winston';
import * as path from 'path';

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.File({
      filename: path.join(__dirname, '..', 'logs', 'app.log'),
      level: 'info',
    }),
    new transports.Console(),
  ],
});

export default logger;
