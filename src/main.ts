import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigurationService } from './config/configuration.service';
import { LoggerService } from './common/logger/logger.service';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
    });

    // Get configuration service
    const configService = app.get(ConfigurationService);
    const loggerService = app.get(LoggerService);

    // Validate configuration on startup
    configService.validateConfiguration();
    loggerService.log('Configuration validated successfully', 'Bootstrap');

    // Use custom logger
    app.useLogger(loggerService);

    // Enable CORS
    app.enableCors({
      origin: configService.frontendUrl,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: false,
    });

    // Enable validation pipes globally
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    const port = configService.port;
    await app.listen(port);

    loggerService.log(`Application started successfully on port ${port}`, 'Bootstrap', {
      port,
      frontendUrl: configService.frontendUrl,
      environment: process.env.NODE_ENV || 'development',
    });

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();
