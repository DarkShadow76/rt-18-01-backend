import { createClient } from '@supabase/supabase-js';
import { Invoice } from '../../src/models/invoice.entity';
import { InvoiceFixtures } from '../fixtures/invoice-fixtures';

export class DatabaseTestUtils {
  private static supabase = createClient(
    process.env.SUPABASE_URL || 'https://test.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'test-key'
  );

  static async seedTestData(): Promise<Invoice[]> {
    const testInvoices = [
      InvoiceFixtures.createValidInvoice({ id: 'test-1', invoiceNumber: 'TEST-001' }),
      InvoiceFixtures.createValidInvoice({ id: 'test-2', invoiceNumber: 'TEST-002' }),
      InvoiceFixtures.createDuplicateInvoice(),
      InvoiceFixtures.createFailedInvoice()
    ];

    // Only seed if we're in test environment and have real database
    if (process.env.NODE_ENV === 'test' && process.env.SUPABASE_URL?.includes('supabase')) {
      const { data, error } = await this.supabase
        .from('invoices')
        .insert(testInvoices);

      if (error) {
        console.warn('Failed to seed test data:', error.message);
      }

      return (data || testInvoices) as Invoice[];
    }

    return testInvoices;
  }

  static async cleanupTestData(): Promise<void> {
    // Only cleanup if we're in test environment and have real database
    if (process.env.NODE_ENV === 'test' && process.env.SUPABASE_URL?.includes('supabase')) {
      await this.supabase
        .from('invoices')
        .delete()
        .like('id', 'test-%');

      await this.supabase
        .from('invoice_audit_trail')
        .delete()
        .like('invoice_id', 'test-%');

      await this.supabase
        .from('invoice_duplicates')
        .delete()
        .like('original_invoice_id', 'test-%');
    }
  }

  static async createTestInvoice(invoice: Partial<Invoice> = {}): Promise<Invoice> {
    const testInvoice = InvoiceFixtures.createValidInvoice(invoice);
    
    if (process.env.NODE_ENV === 'test' && process.env.SUPABASE_URL?.includes('supabase')) {
      const { data, error } = await this.supabase
        .from('invoices')
        .insert(testInvoice)
        .single();

      if (error) {
        throw new Error(`Failed to create test invoice: ${error.message}`);
      }

      return data as Invoice;
    }

    return testInvoice;
  }

  static async findTestInvoice(id: string): Promise<Invoice | null> {
    if (process.env.NODE_ENV === 'test' && process.env.SUPABASE_URL?.includes('supabase')) {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return null;
      }

      return data as Invoice;
    }

    return InvoiceFixtures.createValidInvoice({ id });
  }

  static async deleteTestInvoice(id: string): Promise<void> {
    if (process.env.NODE_ENV === 'test' && process.env.SUPABASE_URL?.includes('supabase')) {
      await this.supabase
        .from('invoices')
        .delete()
        .eq('id', id);
    }
  }
}