import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { InvoiceService } from '../invoice/invoice.service';
import { InvoiceModule } from '../invoice/invoice.module';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [InvoiceModule, ServicesModule],
  controllers: [UploadController],
  providers: [InvoiceService],
})
export class UploadModule {}
