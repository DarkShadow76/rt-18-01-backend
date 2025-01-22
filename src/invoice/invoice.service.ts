import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InvoiceService {
  private supabase: SupabaseClient<any, 'public', any>;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SB_URL'),
      this.configService.get<string>('SB_ANON_KEY'),
    );
  }

  async saveInvoiceData(data: any) {
    const { error } = await this.supabase
      .from('invoices')
      .insert([
        {
          invoice_number: data.invoiceNumber,
          bill_to: data.billTo,
          due_date: data.dueDate,
          total_amount: data.totalAmount,
        },
      ]);

    if (error) {
      throw new Error('Error saving invoice data: ' + error.message);
    }
  }
}
