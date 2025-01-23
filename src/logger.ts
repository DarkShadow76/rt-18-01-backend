import { createLogger, format, transports } from 'winston';
import * as path from 'path';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({
      filename: path.join(__dirname, '..', 'logs', 'app.log'),
      level: 'info',
    }),
    new transports.Console(), // Opcional: para mostrar logs en la consola
  ],
});

export default logger;
