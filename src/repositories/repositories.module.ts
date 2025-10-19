import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseInvoiceRepository } from './supabase-invoice.repository';
import { ConfigurationService } from '../config/configuration.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ConfigurationService,
    {
      provide: 'IInvoiceRepository',
      useClass: SupabaseInvoiceRepository,
    },
    SupabaseInvoiceRepository,
  ],
  exports: [
    'IInvoiceRepository',
    SupabaseInvoiceRepository,
  ],
})
export class RepositoriesModule {}