import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
  apiKey: string;
}

export interface GoogleCloudConfig {
  projectId: string;
  location: string;
  processorId: string;
  credentials: {
    clientEmail: string;
    privateKey: string;
  };
}

export interface UploadConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  storageLocation: string;
}

export interface LoggingConfig {
  level: string;
  enableConsole: boolean;
  enableFile: boolean;
}

export interface AppConfig {
  database: DatabaseConfig;
  googleCloud: GoogleCloudConfig;
  upload: UploadConfig;
  logging: LoggingConfig;
  port: number;
  frontendUrl: string;
}

@Injectable()
export class ConfigurationService {
  private readonly config: AppConfig;

  constructor(private configService: ConfigService) {
    this.config = this.loadAndValidateConfig();
  }

  private loadAndValidateConfig(): AppConfig {
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'GOOGLE_CLOUD_PROJECT_ID',
      'GOOGLE_CLOUD_LOCATION',
      'GOOGLE_CLOUD_PROCESSOR_ID',
      'GOOGLE_CLOUD_CLIENT_EMAIL',
      'GOOGLE_CLOUD_PRIVATE_KEY'
    ];

    const missingVars = requiredEnvVars.filter(
      varName => !this.configService.get(varName)
    );

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}`
      );
    }

    return {
      database: {
        url: this.configService.get<string>('SUPABASE_URL')!,
        apiKey: this.configService.get<string>('SUPABASE_ANON_KEY')!,
      },
      googleCloud: {
        projectId: this.configService.get<string>('GOOGLE_CLOUD_PROJECT_ID')!,
        location: this.configService.get<string>('GOOGLE_CLOUD_LOCATION')!,
        processorId: this.configService.get<string>('GOOGLE_CLOUD_PROCESSOR_ID')!,
        credentials: {
          clientEmail: this.configService.get<string>('GOOGLE_CLOUD_CLIENT_EMAIL')!,
          privateKey: this.configService.get<string>('GOOGLE_CLOUD_PRIVATE_KEY')!.replace(/\\n/g, '\n'),
        },
      },
      upload: {
        maxFileSize: this.configService.get<number>('MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB default
        allowedMimeTypes: this.configService.get<string>('ALLOWED_MIME_TYPES', 'application/pdf,image/png,image/jpeg').split(','),
        storageLocation: this.configService.get<string>('STORAGE_LOCATION', './invoices'),
      },
      logging: {
        level: this.configService.get<string>('LOG_LEVEL', 'info'),
        enableConsole: this.configService.get<boolean>('LOG_ENABLE_CONSOLE', true),
        enableFile: this.configService.get<boolean>('LOG_ENABLE_FILE', true),
      },
      port: this.configService.get<number>('PORT', 4447),
      frontendUrl: this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000'),
    };
  }

  get database(): DatabaseConfig {
    return this.config.database;
  }

  get googleCloud(): GoogleCloudConfig {
    return this.config.googleCloud;
  }

  get upload(): UploadConfig {
    return this.config.upload;
  }

  get logging(): LoggingConfig {
    return this.config.logging;
  }

  get port(): number {
    return this.config.port;
  }

  get frontendUrl(): string {
    return this.config.frontendUrl;
  }

  validateConfiguration(): void {
    // Additional validation logic can be added here
    if (this.config.upload.maxFileSize <= 0) {
      throw new Error('MAX_FILE_SIZE must be greater than 0');
    }

    if (this.config.upload.allowedMimeTypes.length === 0) {
      throw new Error('At least one MIME type must be allowed');
    }
  }
}