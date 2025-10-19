import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ConfigModule } from '../config/config.module';
import { LoggerModule } from '../common/logger/logger.module';
import { ServicesModule } from '../services/services.module';
import { RepositoriesModule } from '../repositories/repositories.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ServicesModule,
    RepositoriesModule
  ],
  controllers: [HealthController],
})
export class HealthModule {}