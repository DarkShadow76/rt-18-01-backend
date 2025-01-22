import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { InvoiceService } from 'src/invoice/invoice.service';
import { InvoiceModule } from 'src/invoice/invoice.module';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [InvoiceModule],
  controllers: [UploadController],
  providers: [InvoiceService, ConfigService],
})
export class UploadModule {}
