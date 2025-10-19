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

export interface PerformanceMetrics {
  operation: string;
  durationMs: number;
  startTime: Date;
  endTime: Date;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
}

export interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  details: Record<string, any>;
  timestamp: Date;
}

export interface DatabaseMetrics {
  operation: string;
  table: string;
  durationMs: number;
  rowsAffected?: number;
  querySize?: number;
  success: boolean;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: Logger;
  private correlationId?: string;
  private performanceTimers: Map<string, { startTime: Date; startCpuUsage: NodeJS.CpuUsage }> = new Map();

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
  startPerformanceTimer(operationId: string): void {
    this.performanceTimers.set(operationId, {
      startTime: new Date(),
      startCpuUsage: process.cpuUsage(),
    });
  }

  endPerformanceTimer(operationId: string, operation: string, context?: string, metadata?: Record<string, any>): PerformanceMetrics | null {
    const timer = this.performanceTimers.get(operationId);
    if (!timer) {
      this.warn(`Performance timer not found for operation: ${operationId}`, context);
      return null;
    }

    const endTime = new Date();
    const endCpuUsage = process.cpuUsage(timer.startCpuUsage);
    const durationMs = endTime.getTime() - timer.startTime.getTime();
    const memoryUsage = process.memoryUsage();

    const metrics: PerformanceMetrics = {
      operation,
      durationMs,
      startTime: timer.startTime,
      endTime,
      memoryUsage,
      cpuUsage: endCpuUsage,
    };

    this.logPerformance(metrics, context, metadata);
    this.performanceTimers.delete(operationId);

    return metrics;
  }

  logPerformance(metrics: PerformanceMetrics, context?: string, metadata?: Record<string, any>): void {
    const level = this.getPerformanceLogLevel(metrics.durationMs);
    const message = `Performance: ${metrics.operation} completed in ${metrics.durationMs}ms`;

    this.logger.log(level, message, {
      context,
      correlationId: this.correlationId,
      performance: {
        operation: metrics.operation,
        durationMs: metrics.durationMs,
        startTime: metrics.startTime.toISOString(),
        endTime: metrics.endTime.toISOString(),
        memoryUsage: {
          rss: metrics.memoryUsage?.rss,
          heapUsed: metrics.memoryUsage?.heapUsed,
          heapTotal: metrics.memoryUsage?.heapTotal,
          external: metrics.memoryUsage?.external,
        },
        cpuUsage: {
          user: metrics.cpuUsage?.user,
          system: metrics.cpuUsage?.system,
        },
      },
      ...metadata,
    });
  }

  private getPerformanceLogLevel(durationMs: number): string {
    if (durationMs > 5000) return 'error'; // > 5 seconds
    if (durationMs > 2000) return 'warn';  // > 2 seconds
    if (durationMs > 1000) return 'info';  // > 1 second
    return 'debug'; // <= 1 second
  }

  logSecurityEvent(event: SecurityEvent, context?: string): void {
    const level = this.getSecurityLogLevel(event.severity);
    const message = `Security Event: ${event.type} - ${event.severity.toUpperCase()}`;

    this.logger.log(level, message, {
      context,
      correlationId: this.correlationId,
      security: {
        type: event.type,
        severity: event.severity,
        source: event.source,
        timestamp: event.timestamp.toISOString(),
        details: event.details,
      },
    });
  }

  private getSecurityLogLevel(severity: SecurityEvent['severity']): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
      default:
        return 'info';
    }
  }

  logDatabaseOperation(metrics: DatabaseMetrics, context?: string, metadata?: Record<string, any>): void {
    const level = metrics.success ? 'debug' : 'error';
    const message = `Database: ${metrics.operation} on ${metrics.table} - ${metrics.success ? 'SUCCESS' : 'FAILED'} (${metrics.durationMs}ms)`;

    this.logger.log(level, message, {
      context,
      correlationId: this.correlationId,
      database: {
        operation: metrics.operation,
        table: metrics.table,
        durationMs: metrics.durationMs,
        rowsAffected: metrics.rowsAffected,
        querySize: metrics.querySize,
        success: metrics.success,
      },
      ...metadata,
    });
  }

  // Structured logging methods
  logApiRequest(method: string, url: string, statusCode: number, durationMs: number, metadata?: Record<string, any>): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const message = `API Request: ${method} ${url} - ${statusCode} (${durationMs}ms)`;

    this.logger.log(level, message, {
      correlationId: this.correlationId,
      api: {
        method,
        url,
        statusCode,
        durationMs,
      },
      ...metadata,
    });
  }

  logBusinessEvent(event: string, entity: string, entityId: string, action: string, metadata?: Record<string, any>): void {
    this.logger.info(`Business Event: ${event}`, {
      correlationId: this.correlationId,
      business: {
        event,
        entity,
        entityId,
        action,
        timestamp: new Date().toISOString(),
      },
      ...metadata,
    });
  }

  logExternalServiceCall(service: string, operation: string, durationMs: number, success: boolean, metadata?: Record<string, any>): void {
    const level = success ? 'info' : 'error';
    const message = `External Service: ${service}.${operation} - ${success ? 'SUCCESS' : 'FAILED'} (${durationMs}ms)`;

    this.logger.log(level, message, {
      correlationId: this.correlationId,
      externalService: {
        service,
        operation,
        durationMs,
        success,
        timestamp: new Date().toISOString(),
      },
      ...metadata,
    });
  }

  // Audit logging
  logAuditEvent(userId: string, action: string, resource: string, resourceId: string, changes?: Record<string, any>): void {
    this.logger.info(`Audit: ${action} on ${resource}`, {
      correlationId: this.correlationId,
      audit: {
        userId,
        action,
        resource,
        resourceId,
        changes,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Health check logging
  logHealthCheck(component: string, status: 'healthy' | 'unhealthy', details?: Record<string, any>): void {
    const level = status === 'healthy' ? 'debug' : 'error';
    const message = `Health Check: ${component} - ${status.toUpperCase()}`;

    this.logger.log(level, message, {
      correlationId: this.correlationId,
      health: {
        component,
        status,
        timestamp: new Date().toISOString(),
        details,
      },
    });
  }

  // Configuration logging
  logConfigurationLoad(configName: string, success: boolean, details?: Record<string, any>): void {
    const level = success ? 'info' : 'error';
    const message = `Configuration: ${configName} - ${success ? 'LOADED' : 'FAILED'}`;

    this.logger.log(level, message, {
      configuration: {
        name: configName,
        success,
        timestamp: new Date().toISOString(),
        details,
      },
    });
  }

  // Metrics aggregation
  logMetrics(metrics: Record<string, number>, context?: string): void {
    this.logger.info('Application Metrics', {
      context,
      correlationId: this.correlationId,
      metrics: {
        ...metrics,
        timestamp: new Date().toISOString(),
      },
    });
  }
}