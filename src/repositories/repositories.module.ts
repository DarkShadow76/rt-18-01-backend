import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseInvoiceRepository } from './supabase-invoice.repository';
import { SupabaseAuditRepository } from './supabase-audit.repository';
import { ConfigurationService } from '../config/configuration.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ConfigurationService,
    {
      provide: 'IInvoiceRepository',
      useClass: SupabaseInvoiceRepository,
    },
    {
      provide: 'IAuditRepository',
      useClass: SupabaseAuditRepository,
    },
    SupabaseInvoiceRepository,
    SupabaseAuditRepository,
  ],
  exports: [
    'IInvoiceRepository',
    'IAuditRepository',
    SupabaseInvoiceRepository,
    SupabaseAuditRepository,
  ],
})
export class RepositoriesModule {}