import { Controller, Get } from '@nestjs/common';
import { ConfigurationService } from '../config/configuration.service';
import { LoggerService } from '../common/logger/logger.service';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    configuration: boolean;
    database: boolean;
    documentAI: boolean;
  };
  details?: any;
}

@Controller('health')
export class HealthController {
  constructor(
    private configService: ConfigurationService,
    private logger: LoggerService
  ) {}

  @Get()
  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    this.logger.debug('Health check requested', 'HealthController');

    const checks = {
      configuration: this.checkConfiguration(),
      database: await this.checkDatabase(),
      documentAI: await this.checkDocumentAI(),
    };

    const allHealthy = Object.values(checks).every(check => check === true);
    const status: HealthStatus = {
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks,
    };

    const responseTime = Date.now() - startTime;
    this.logger.logPerformance('health-check', responseTime, 'HealthController', {
      status: status.status,
      checks,
    });

    return status;
  }

  @Get('ready')
  async readinessCheck(): Promise<{ ready: boolean }> {
    // Simple readiness check - just verify configuration is valid
    try {
      this.configService.validateConfiguration();
      return { ready: true };
    } catch (error) {
      this.logger.error('Readiness check failed', error.stack, 'HealthController');
      return { ready: false };
    }
  }

  @Get('live')
  async livenessCheck(): Promise<{ alive: boolean }> {
    // Simple liveness check - just return true if the service is running
    return { alive: true };
  }

  private checkConfiguration(): boolean {
    try {
      this.configService.validateConfiguration();
      return true;
    } catch (error) {
      this.logger.error('Configuration check failed', error.stack, 'HealthController');
      return false;
    }
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      // This is a placeholder - actual database connectivity check would be implemented
      // when we create the repository implementation
      const dbConfig = this.configService.database;
      return !!(dbConfig.url && dbConfig.apiKey);
    } catch (error) {
      this.logger.error('Database check failed', error.stack, 'HealthController');
      return false;
    }
  }

  private async checkDocumentAI(): Promise<boolean> {
    try {
      const gcConfig = this.configService.googleCloud;
      return !!(
        gcConfig.projectId &&
        gcConfig.location &&
        gcConfig.processorId &&
        gcConfig.credentials.clientEmail &&
        gcConfig.credentials.privateKey
      );
    } catch (error) {
      this.logger.error('Document AI check failed', error.stack, 'HealthController');
      return false;
    }
  }
}