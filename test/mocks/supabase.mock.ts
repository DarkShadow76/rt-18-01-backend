import { Invoice } from '../../src/models/invoice.entity';
import { InvoiceFixtures } from '../fixtures/invoice-fixtures';

export const createSupabaseMock = () => {
  const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    data: null,
    error: null
  };

  // Default successful responses
  mockSupabase.single.mockResolvedValue({
    data: InvoiceFixtures.createValidInvoice(),
    error: null
  });

  mockSupabase.select.mockResolvedValue({
    data: [InvoiceFixtures.createValidInvoice()],
    error: null
  });

  mockSupabase.insert.mockResolvedValue({
    data: InvoiceFixtures.createValidInvoice(),
    error: null
  });

  mockSupabase.update.mockResolvedValue({
    data: InvoiceFixtures.createValidInvoice(),
    error: null
  });

  mockSupabase.delete.mockResolvedValue({
    data: null,
    error: null
  });

  return mockSupabase;
};

export const createFailingSupabaseMock = () => {
  const mockSupabase = createSupabaseMock();
  
  mockSupabase.single.mockResolvedValue({
    data: null,
    error: { message: 'Database connection failed' }
  });

  return mockSupabase;
};

export const createEmptySupabaseMock = () => {
  const mockSupabase = createSupabaseMock();
  
  mockSupabase.select.mockResolvedValue({
    data: [],
    error: null
  });

  mockSupabase.single.mockResolvedValue({
    data: null,
    error: null
  });

  return mockSupabase;
};