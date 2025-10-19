import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ServicesModule } from '../services/services.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [
    ServicesModule,
    RepositoriesModule,
    LoggerModule
  ],
  controllers: [UploadController],
  providers: [],
})
export class UploadModule {}
