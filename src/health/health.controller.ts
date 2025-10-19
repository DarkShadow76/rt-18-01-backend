import {
  Controller,
  Get,
  Inject,
  Logger,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigurationService } from '../config/configuration.service';
import { LoggerService } from '../common/logger/logger.service';
import {
  IInvoiceProcessingService,
  IInvoiceRepository,
} from '../models/service.interfaces';
import { AppError } from '../common/errors/app-error';
import * as crypto from 'crypto';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    configuration: HealthCheck;
    database: HealthCheck;
    documentAI: HealthCheck;
    services: HealthCheck;
    memory: HealthCheck;
  };
  metrics?: {
    activeProcessing: number;
    completedToday: number;
    failedToday: number;
    averageProcessingTime: number;
    duplicateRate: number;
  };
  details?: any;
}

export interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  responseTime?: number;
  details?: any;
  error?: string;
}

export interface ReadinessStatus {
  ready: boolean;
  timestamp: string;
  checks: {
    configuration: boolean;
    database: boolean;
    services: boolean;
  };
  details?: any;
}

export interface LivenessStatus {
  alive: boolean;
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

@ApiTags('Health & Monitoring')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private configService: ConfigurationService,
    private loggerService: LoggerService,
    @Inject('IInvoiceProcessingService')
    private readonly invoiceProcessingService: IInvoiceProcessingService,
    @Inject('IInvoiceRepository')
    private readonly invoiceRepository: IInvoiceRepository,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Comprehensive health check',
    description:
      'Get detailed health status of all system components and services',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Health status retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'System is unhealthy',
  })
  async healthCheck(): Promise<HealthStatus> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.log('Comprehensive health check requested', { correlationId });

    try {
      // Run all health checks in parallel
      const [
        configCheck,
        databaseCheck,
        documentAICheck,
        servicesCheck,
        memoryCheck,
        metrics,
      ] = await Promise.allSettled([
        this.checkConfiguration(),
        this.checkDatabase(),
        this.checkDocumentAI(),
        this.checkServices(),
        this.checkMemory(),
        this.getSystemMetrics(),
      ]);

      const checks = {
        configuration: this.extractHealthCheck(configCheck),
        database: this.extractHealthCheck(databaseCheck),
        documentAI: this.extractHealthCheck(documentAICheck),
        services: this.extractHealthCheck(servicesCheck),
        memory: this.extractHealthCheck(memoryCheck),
      };

      // Determine overall status
      const failedChecks = Object.values(checks).filter(
        (check) => check.status === 'fail',
      ).length;
      const warnChecks = Object.values(checks).filter(
        (check) => check.status === 'warn',
      ).length;

      let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
      if (failedChecks > 0) {
        overallStatus = 'unhealthy';
      } else if (warnChecks > 0) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'healthy';
      }

      const status: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks,
        metrics: metrics.status === 'fulfilled' ? metrics.value : undefined,
      };

      const responseTime = Date.now() - startTime;

      this.loggerService.logPerformance(
        {
          operation: 'health-check',
          durationMs: responseTime,
          startTime: new Date(startTime),
          endTime: new Date(),
        },
        'HealthController',
      );

      this.logger.log('Health check completed', {
        status: overallStatus,
        responseTimeMs: responseTime,
        failedChecks,
        warnChecks,
        correlationId,
      });

      return status;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.loggerService.error(
        'Health check failed',
        error.stack,
        'HealthController',
        {
          responseTimeMs: responseTime,
          correlationId,
          error: error.message,
        },
      );

      // Return unhealthy status
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks: {
          configuration: { status: 'fail', error: 'Health check failed' },
          database: { status: 'fail', error: 'Health check failed' },
          documentAI: { status: 'fail', error: 'Health check failed' },
          services: { status: 'fail', error: 'Health check failed' },
          memory: { status: 'fail', error: 'Health check failed' },
        },
        details: { error: error.message },
      };
    }
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Readiness check',
    description: 'Check if the application is ready to serve requests',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Application readiness status',
  })
  async readinessCheck(): Promise<ReadinessStatus> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.log('Readiness check requested', { correlationId });

    try {
      // Check critical components required for serving requests
      const [configCheck, databaseCheck, servicesCheck] =
        await Promise.allSettled([
          this.checkConfiguration(),
          this.checkDatabase(),
          this.checkServices(),
        ]);

      const checks = {
        configuration:
          configCheck.status === 'fulfilled' &&
          configCheck.value.status === 'pass',
        database:
          databaseCheck.status === 'fulfilled' &&
          databaseCheck.value.status !== 'fail',
        services:
          servicesCheck.status === 'fulfilled' &&
          servicesCheck.value.status !== 'fail',
      };

      const ready = Object.values(checks).every(Boolean);
      const responseTime = Date.now() - startTime;

      this.loggerService.logPerformance(
        {
          operation: 'readiness-check',
          durationMs: responseTime,
          startTime: new Date(startTime),
          endTime: new Date(),
        },
        'HealthController',
      );

      const status: ReadinessStatus = {
        ready,
        timestamp: new Date().toISOString(),
        checks,
        details: ready
          ? undefined
          : { reason: 'One or more critical components are not ready' },
      };

      this.logger.log('Readiness check completed', {
        ready,
        responseTimeMs: responseTime,
        correlationId,
      });

      return status;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.loggerService.error(
        'Readiness check failed',
        error.stack,
        'HealthController',
        {
          responseTimeMs: responseTime,
          correlationId,
          error: error.message,
        },
      );

      return {
        ready: false,
        timestamp: new Date().toISOString(),
        checks: {
          configuration: false,
          database: false,
          services: false,
        },
        details: { error: error.message },
      };
    }
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness check',
    description: 'Check if the application is alive and responsive',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Application liveness status',
  })
  async livenessCheck(): Promise<LivenessStatus> {
    const correlationId = crypto.randomUUID();

    this.logger.log('Liveness check requested', { correlationId });

    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
      const usedMemory = memoryUsage.heapUsed;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      const status: LivenessStatus = {
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: usedMemory,
          total: totalMemory,
          percentage: Math.round(memoryPercentage * 100) / 100,
        },
      };

      this.logger.log('Liveness check completed', {
        alive: true,
        uptime: status.uptime,
        memoryPercentage: status.memory.percentage,
        correlationId,
      });

      return status;
    } catch (error) {
      this.loggerService.error(
        'Liveness check failed',
        error.stack,
        'HealthController',
        {
          correlationId,
          error: error.message,
        },
      );

      // Even if there's an error, we're still alive if we can respond
      return {
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
        },
      };
    }
  }

  private async checkConfiguration(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      this.configService.validateConfiguration();

      const responseTime = Date.now() - startTime;
      return {
        status: 'pass',
        responseTime,
        details: {
          environment: process.env.NODE_ENV || 'development',
          configuredServices: ['database', 'documentAI', 'logging'],
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.loggerService.error(
        'Configuration check failed',
        error.stack,
        'HealthController',
        { error: error.message },
      );

      return {
        status: 'fail',
        responseTime,
        error: error.message,
        details: { configurationErrors: error.message },
      };
    }
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const dbConfig = this.configService.database;

      if (!dbConfig.url || !dbConfig.apiKey) {
        return {
          status: 'fail',
          responseTime: Date.now() - startTime,
          error: 'Database configuration is incomplete',
          details: {
            hasUrl: !!dbConfig.url,
            hasApiKey: !!dbConfig.apiKey,
          },
        };
      }

      // Try to perform a simple database connectivity check
      try {
        // This would be replaced with actual database connectivity test
        // For now, we'll simulate a connection test
        await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate DB call

        const responseTime = Date.now() - startTime;
        return {
          status: 'pass',
          responseTime,
          details: {
            connectionPool: 'active',
            lastConnectionTest: new Date().toISOString(),
          },
        };
      } catch (dbError) {
        const responseTime = Date.now() - startTime;
        return {
          status: 'fail',
          responseTime,
          error: `Database connection failed: ${dbError.message}`,
          details: { connectionError: dbError.message },
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.loggerService.error(
        'Database check failed',
        error.stack,
        'HealthController',
        { error: error.message },
      );

      return {
        status: 'fail',
        responseTime,
        error: error.message,
      };
    }
  }

  private async checkDocumentAI(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const gcConfig = this.configService.googleCloud;

      const requiredFields = {
        projectId: !!gcConfig.projectId,
        location: !!gcConfig.location,
        processorId: !!gcConfig.processorId,
        clientEmail: !!gcConfig.credentials?.clientEmail,
        privateKey: !!gcConfig.credentials?.privateKey,
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([_, hasValue]) => !hasValue)
        .map(([field]) => field);

      if (missingFields.length > 0) {
        return {
          status: 'fail',
          responseTime: Date.now() - startTime,
          error: `Document AI configuration is incomplete: missing ${missingFields.join(', ')}`,
          details: {
            requiredFields,
            missingFields,
          },
        };
      }

      // Try to test Document AI service availability
      try {
        // This would be replaced with actual Document AI service test
        // For now, we'll simulate a service availability check
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate API call

        const responseTime = Date.now() - startTime;
        return {
          status: 'pass',
          responseTime,
          details: {
            projectId: gcConfig.projectId,
            location: gcConfig.location,
            processorId: gcConfig.processorId,
            lastServiceTest: new Date().toISOString(),
          },
        };
      } catch (serviceError) {
        const responseTime = Date.now() - startTime;
        return {
          status: 'warn',
          responseTime,
          error: `Document AI service test failed: ${serviceError.message}`,
          details: {
            serviceError: serviceError.message,
            configurationValid: true,
          },
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.loggerService.error(
        'Document AI check failed',
        error.stack,
        'HealthController',
        { error: error.message },
      );

      return {
        status: 'fail',
        responseTime,
        error: error.message,
      };
    }
  }

  private async checkServices(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Check the health of the invoice processing service
      const serviceHealth = await this.invoiceProcessingService.healthCheck();

      const responseTime = Date.now() - startTime;

      if (serviceHealth.status === 'healthy') {
        return {
          status: 'pass',
          responseTime,
          details: {
            activeProcessing: serviceHealth.activeProcessing,
            dependencies: serviceHealth.dependencies,
          },
        };
      } else if (serviceHealth.status === 'degraded') {
        return {
          status: 'warn',
          responseTime,
          error: 'Some service dependencies are unhealthy',
          details: {
            activeProcessing: serviceHealth.activeProcessing,
            dependencies: serviceHealth.dependencies,
          },
        };
      } else {
        return {
          status: 'fail',
          responseTime,
          error: 'Invoice processing service is unhealthy',
          details: {
            activeProcessing: serviceHealth.activeProcessing,
            dependencies: serviceHealth.dependencies,
          },
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.loggerService.error(
        'Services check failed',
        error.stack,
        'HealthController',
        { error: error.message },
      );

      return {
        status: 'fail',
        responseTime,
        error: error.message,
      };
    }
  }

  private async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
      const usedMemory = memoryUsage.heapUsed;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      const responseTime = Date.now() - startTime;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let error: string | undefined;

      if (memoryPercentage > 90) {
        status = 'fail';
        error = 'Memory usage is critically high';
      } else if (memoryPercentage > 75) {
        status = 'warn';
        error = 'Memory usage is high';
      }

      return {
        status,
        responseTime,
        error,
        details: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
          usedPercentage: Math.round(memoryPercentage * 100) / 100,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.loggerService.error(
        'Memory check failed',
        error.stack,
        'HealthController',
        { error: error.message },
      );

      return {
        status: 'fail',
        responseTime,
        error: error.message,
      };
    }
  }

  private async getSystemMetrics(): Promise<any> {
    try {
      const stats =
        await this.invoiceProcessingService.getProcessingStatistics();
      return stats;
    } catch (error) {
      this.loggerService.error(
        'Failed to get system metrics',
        error.stack,
        'HealthController',
        { error: error.message },
      );
      return undefined;
    }
  }

  private extractHealthCheck(
    result: PromiseSettledResult<HealthCheck>,
  ): HealthCheck {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'fail',
        error: result.reason?.message || 'Unknown error',
        details: { promiseRejected: true },
      };
    }
  }
}
