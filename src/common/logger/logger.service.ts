import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';
import { ConfigurationService } from '../../config/configuration.service';
import * as path from 'path';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: Logger;
  private correlationId?: string;

  constructor(private configService: ConfigurationService) {
    this.logger = this.createLogger();
  }

  private createLogger(): Logger {
    const logConfig = this.configService.logging;
    const logTransports: any[] = [];

    // Console transport
    if (logConfig.enableConsole) {
      logTransports.push(
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            format.printf(({ timestamp, level, message, context, correlationId, ...meta }) => {
              let logMessage = `${timestamp} [${level}]`;
              if (context) logMessage += ` [${context}]`;
              if (correlationId) logMessage += ` [${correlationId}]`;
              logMessage += ` ${message}`;
              
              if (Object.keys(meta).length > 0) {
                logMessage += ` ${JSON.stringify(meta)}`;
              }
              
              return logMessage;
            })
          ),
        })
      );
    }

    // File transport
    if (logConfig.enableFile) {
      logTransports.push(
        new transports.File({
          filename: path.join(process.cwd(), 'logs', 'app.log'),
          format: format.combine(
            format.timestamp(),
            format.json()
          ),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );

      // Error file transport
      logTransports.push(
        new transports.File({
          filename: path.join(process.cwd(), 'logs', 'error.log'),
          level: 'error',
          format: format.combine(
            format.timestamp(),
            format.json()
          ),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );
    }

    return createLogger({
      level: logConfig.level,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      transports: logTransports,
      exceptionHandlers: logConfig.enableFile ? [
        new transports.File({
          filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
        })
      ] : [],
      rejectionHandlers: logConfig.enableFile ? [
        new transports.File({
          filename: path.join(process.cwd(), 'logs', 'rejections.log'),
        })
      ] : [],
    });
  }

  setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  clearCorrelationId(): void {
    this.correlationId = undefined;
  }

  private formatLogEntry(message: string, context?: string, metadata?: Record<string, any>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      context,
      correlationId: this.correlationId,
      metadata,
    };
  }

  log(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.info(message, { context, correlationId: this.correlationId, ...metadata });
  }

  error(message: string, trace?: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.error(message, { 
      context, 
      correlationId: this.correlationId, 
      stack: trace,
      ...metadata 
    });
  }

  warn(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.warn(message, { context, correlationId: this.correlationId, ...metadata });
  }

  debug(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.debug(message, { context, correlationId: this.correlationId, ...metadata });
  }

  verbose(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.verbose(message, { context, correlationId: this.correlationId, ...metadata });
  }

  // Performance monitoring methods
  logPerformance(operation: string, durationMs: number, context?: string, metadata?: Record<string, any>): void {
    this.logger.info(`Performance: ${operation} completed in ${durationMs}ms`, {
      context,
      correlationId: this.correlationId,
      operation,
      durationMs,
      ...metadata,
    });
  }

  logSecurityEvent(event: string, details: Record<string, any>, context?: string): void {
    this.logger.warn(`Security Event: ${event}`, {
      context,
      correlationId: this.correlationId,
      securityEvent: event,
      ...details,
    });
  }

  logDatabaseOperation(operation: string, table: string, durationMs?: number, metadata?: Record<string, any>): void {
    this.logger.debug(`Database: ${operation} on ${table}`, {
      correlationId: this.correlationId,
      operation,
      table,
      durationMs,
      ...metadata,
    });
  }
}