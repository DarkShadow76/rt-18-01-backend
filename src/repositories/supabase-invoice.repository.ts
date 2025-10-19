import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  IInvoiceRepository, 
  Invoice, 
  InvoiceFilters, 
  InvoiceQueryOptions, 
  InvoiceStats, 
  AuditEntry,
  InvoiceStatus,
  ProcessingMetrics,
  RepositoryHealthStatus
} from '../models';
import type { ProcessingTrend } from '../repositories/interfaces/invoice-repository.interface';
import { ConfigurationService } from '../config/configuration.service';
import { ErrorType } from '../common/dto/upload-invoice.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SupabaseInvoiceRepository implements IInvoiceRepository {
  private readonly logger = new Logger(SupabaseInvoiceRepository.name);
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigurationService) {
    this.supabase = createClient(
      this.configService.database.url,
      this.configService.database.apiKey
    );
  }

  async save(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<Invoice> {
    try {
      const invoiceData = {
        id: uuidv4(),
        invoice_number: invoice.invoiceNumber,
        bill_to: invoice.billTo,
        due_date: invoice.dueDate.toISOString(),
        total_amount: invoice.totalAmount,
        status: invoice.status,
        processing_attempts: invoice.processingAttempts || 0,
        last_processed_at: invoice.lastProcessedAt?.toISOString() || null,
        metadata: invoice.metadata,
        duplicate_of: invoice.duplicateOf || null,
        content_hash: invoice.contentHash || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to save invoice', { error, invoiceData });
        throw new Error(`Database error: ${error.message}`);
      }

      return this.mapToInvoice(data);
    } catch (error) {
      this.logger.error('Error saving invoice', { error, invoice });
      throw error;
    }
  }

  async findById(id: string, includeAuditTrail?: boolean): Promise<Invoice | null> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        this.logger.error('Failed to find invoice by ID', { error, id });
        throw new Error(`Database error: ${error.message}`);
      }

      const invoice = this.mapToInvoice(data);

      if (includeAuditTrail) {
        invoice.auditTrail = await this.getAuditTrail(id);
      }

      return invoice;
    } catch (error) {
      this.logger.error('Error finding invoice by ID', { error, id });
      throw error;
    }
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('invoice_number', invoiceNumber)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        this.logger.error('Failed to find invoice by number', { error, invoiceNumber });
        throw new Error(`Database error: ${error.message}`);
      }

      return this.mapToInvoice(data);
    } catch (error) {
      this.logger.error('Error finding invoice by number', { error, invoiceNumber });
      throw error;
    }
  }

  async update(id: string, updates: Partial<Invoice>): Promise<Invoice> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Map Invoice properties to database columns
      if (updates.invoiceNumber !== undefined) updateData.invoice_number = updates.invoiceNumber;
      if (updates.billTo !== undefined) updateData.bill_to = updates.billTo;
      if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate.toISOString();
      if (updates.totalAmount !== undefined) updateData.total_amount = updates.totalAmount;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.processingAttempts !== undefined) updateData.processing_attempts = updates.processingAttempts;
      if (updates.lastProcessedAt !== undefined) updateData.last_processed_at = updates.lastProcessedAt?.toISOString() || null;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
      if (updates.duplicateOf !== undefined) updateData.duplicate_of = updates.duplicateOf;
      if (updates.contentHash !== undefined) updateData.content_hash = updates.contentHash;

      const { data, error } = await this.supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to update invoice', { error, id, updates });
        throw new Error(`Database error: ${error.message}`);
      }

      return this.mapToInvoice(data);
    } catch (error) {
      this.logger.error('Error updating invoice', { error, id, updates });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('invoices')
        .delete()
        .eq('id', id);

      if (error) {
        this.logger.error('Failed to delete invoice', { error, id });
        throw new Error(`Database error: ${error.message}`);
      }
    } catch (error) {
      this.logger.error('Error deleting invoice', { error, id });
      throw error;
    }
  }

  async findAll(options?: InvoiceQueryOptions): Promise<{
    invoices: Invoice[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 10;
      const offset = (page - 1) * limit;

      let query = this.supabase.from('invoices').select('*', { count: 'exact' });

      // Apply filters
      if (options?.filters) {
        query = this.applyFilters(query, options.filters);
      }

      // Apply sorting
      if (options?.sortBy) {
        const column = this.mapSortField(options.sortBy);
        query = query.order(column, { ascending: options.sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        this.logger.error('Failed to find all invoices', { error, options });
        throw new Error(`Database error: ${error.message}`);
      }

      const invoices = data?.map(item => this.mapToInvoice(item)) || [];
      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        invoices,
        total,
        page,
        limit,
        totalPages
      };
    } catch (error) {
      this.logger.error('Error finding all invoices', { error, options });
      throw error;
    }
  }  
async findByFilters(filters: InvoiceFilters): Promise<Invoice[]> {
    try {
      let query = this.supabase.from('invoices').select('*');
      query = this.applyFilters(query, filters);

      const { data, error } = await query;

      if (error) {
        this.logger.error('Failed to find invoices by filters', { error, filters });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error finding invoices by filters', { error, filters });
      throw error;
    }
  }

  async findByStatus(status: InvoiceStatus[]): Promise<Invoice[]> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .in('status', status);

      if (error) {
        this.logger.error('Failed to find invoices by status', { error, status });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error finding invoices by status', { error, status });
      throw error;
    }
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Invoice[]> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .gte('due_date', startDate.toISOString())
        .lte('due_date', endDate.toISOString());

      if (error) {
        this.logger.error('Failed to find invoices by date range', { error, startDate, endDate });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error finding invoices by date range', { error, startDate, endDate });
      throw error;
    }
  }

  async findByAmountRange(minAmount: number, maxAmount: number): Promise<Invoice[]> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .gte('total_amount', minAmount)
        .lte('total_amount', maxAmount);

      if (error) {
        this.logger.error('Failed to find invoices by amount range', { error, minAmount, maxAmount });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error finding invoices by amount range', { error, minAmount, maxAmount });
      throw error;
    }
  }

  async searchByBillTo(searchTerm: string): Promise<Invoice[]> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .ilike('bill_to', `%${searchTerm}%`);

      if (error) {
        this.logger.error('Failed to search invoices by bill to', { error, searchTerm });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error searching invoices by bill to', { error, searchTerm });
      throw error;
    }
  }

  async findDuplicates(invoice: Partial<Invoice>): Promise<Invoice[]> {
    try {
      let query = this.supabase.from('invoices').select('*');

      // Check for invoice number duplicates
      if (invoice.invoiceNumber) {
        query = query.eq('invoice_number', invoice.invoiceNumber);
      }

      // Check for content hash duplicates
      if (invoice.contentHash) {
        query = query.or(`content_hash.eq.${invoice.contentHash}`);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error('Failed to find duplicates', { error, invoice });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error finding duplicates', { error, invoice });
      throw error;
    }
  }

  async findByContentHash(contentHash: string): Promise<Invoice[]> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('content_hash', contentHash);

      if (error) {
        this.logger.error('Failed to find invoices by content hash', { error, contentHash });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error finding invoices by content hash', { error, contentHash });
      throw error;
    }
  }

  async findSimilarInvoices(invoiceNumber: string, billTo: string): Promise<Invoice[]> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .or(`invoice_number.eq.${invoiceNumber},bill_to.ilike.%${billTo}%`);

      if (error) {
        this.logger.error('Failed to find similar invoices', { error, invoiceNumber, billTo });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error finding similar invoices', { error, invoiceNumber, billTo });
      throw error;
    }
  }

  async count(filters?: InvoiceFilters): Promise<number> {
    try {
      let query = this.supabase.from('invoices').select('*', { count: 'exact', head: true });

      if (filters) {
        query = this.applyFilters(query, filters);
      }

      const { count, error } = await query;

      if (error) {
        this.logger.error('Failed to count invoices', { error, filters });
        throw new Error(`Database error: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      this.logger.error('Error counting invoices', { error, filters });
      throw error;
    }
  }

  async getStats(filters?: InvoiceFilters): Promise<InvoiceStats> {
    try {
      // Get total count and status breakdown
      let query = this.supabase.from('invoices').select('status, total_amount, processing_attempts, metadata');

      if (filters) {
        query = this.applyFilters(query, filters);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error('Failed to get invoice stats', { error, filters });
        throw new Error(`Database error: ${error.message}`);
      }

      const invoices = data || [];
      const total = invoices.length;
      
      // Calculate status breakdown
      const byStatus = invoices.reduce((acc, invoice) => {
        acc[invoice.status as InvoiceStatus] = (acc[invoice.status as InvoiceStatus] || 0) + 1;
        return acc;
      }, {} as Record<InvoiceStatus, number>);

      // Calculate processing metrics
      const completedInvoices = invoices.filter(inv => inv.status === InvoiceStatus.COMPLETED);
      const averageProcessingTime = completedInvoices.length > 0 
        ? completedInvoices.reduce((sum, inv) => sum + (inv.metadata?.processingTimeMs || 0), 0) / completedInvoices.length
        : 0;

      const successRate = total > 0 ? (completedInvoices.length / total) * 100 : 0;
      const duplicateCount = invoices.filter(inv => inv.status === InvoiceStatus.DUPLICATE).length;
      const duplicateRate = total > 0 ? (duplicateCount / total) * 100 : 0;

      const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      return {
        total,
        byStatus,
        averageProcessingTime,
        successRate,
        duplicateRate,
        totalAmount
      };
    } catch (error) {
      this.logger.error('Error getting invoice stats', { error, filters });
      throw error;
    }
  }

  async getProcessingMetrics(dateFrom?: Date, dateTo?: Date): Promise<ProcessingMetrics> {
    try {
      let query = this.supabase.from('invoices').select('*');

      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error('Failed to get processing metrics', { error, dateFrom, dateTo });
        throw new Error(`Database error: ${error.message}`);
      }

      const invoices = data || [];
      const totalProcessed = invoices.length;
      const successful = invoices.filter(inv => inv.status === InvoiceStatus.COMPLETED).length;
      const failed = invoices.filter(inv => inv.status === InvoiceStatus.FAILED).length;
      const duplicates = invoices.filter(inv => inv.status === InvoiceStatus.DUPLICATE).length;

      const successRate = totalProcessed > 0 ? (successful / totalProcessed) * 100 : 0;
      const duplicateRate = totalProcessed > 0 ? (duplicates / totalProcessed) * 100 : 0;

      const processingTimes = invoices
        .filter(inv => inv.metadata?.processingTimeMs)
        .map(inv => inv.metadata.processingTimeMs);
      
      const averageProcessingTime = processingTimes.length > 0 
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
        : 0;

      // Group failure reasons
      const failureReasons = invoices
        .filter(inv => inv.status === InvoiceStatus.FAILED)
        .reduce((acc, inv) => {
          const reason = inv.metadata?.errorMessage || 'Unknown';
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      // Calculate daily trends (simplified - group by date)
      const processingTrends: ProcessingTrend[] = [];
      const dailyGroups = invoices.reduce((acc, inv) => {
        const date = new Date(inv.created_at).toDateString();
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(inv);
        return acc;
      }, {} as Record<string, any[]>);

      Object.entries(dailyGroups).forEach(([dateStr, dayInvoices]) => {
        const date = new Date(dateStr);
        const processed = (dayInvoices as any[]).length;
        const successful = (dayInvoices as any[]).filter(inv => inv.status === InvoiceStatus.COMPLETED).length;
        const failed = (dayInvoices as any[]).filter(inv => inv.status === InvoiceStatus.FAILED).length;
        const times = (dayInvoices as any[])
          .filter(inv => inv.metadata?.processingTimeMs)
          .map(inv => inv.metadata.processingTimeMs);
        const averageTime = times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 0;

        processingTrends.push({
          date,
          processed,
          successful,
          failed,
          averageTime
        });
      });

      return {
        totalProcessed,
        successRate,
        averageProcessingTime,
        failureReasons,
        duplicateRate,
        processingTrends: processingTrends.sort((a, b) => a.date.getTime() - b.date.getTime())
      };
    } catch (error) {
      this.logger.error('Error getting processing metrics', { error, dateFrom, dateTo });
      throw error;
    }
  }

  async saveWithAudit(
    invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>, 
    auditEntry: Omit<AuditEntry, 'id' | 'invoiceId' | 'timestamp'>
  ): Promise<Invoice> {
    try {
      // Start a transaction-like operation
      const savedInvoice = await this.save(invoice);
      
      // Create audit entry
      await this.createAuditEntry(savedInvoice.id, auditEntry);
      
      return savedInvoice;
    } catch (error) {
      this.logger.error('Error saving invoice with audit', { error, invoice, auditEntry });
      throw error;
    }
  }

  async updateWithAudit(
    id: string, 
    updates: Partial<Invoice>, 
    auditEntry: Omit<AuditEntry, 'id' | 'invoiceId' | 'timestamp'>
  ): Promise<Invoice> {
    try {
      const updatedInvoice = await this.update(id, updates);
      
      // Create audit entry
      await this.createAuditEntry(id, auditEntry);
      
      return updatedInvoice;
    } catch (error) {
      this.logger.error('Error updating invoice with audit', { error, id, updates, auditEntry });
      throw error;
    }
  }

  async deleteWithAudit(
    id: string, 
    auditEntry: Omit<AuditEntry, 'id' | 'invoiceId' | 'timestamp'>
  ): Promise<void> {
    try {
      // Create audit entry before deletion
      await this.createAuditEntry(id, auditEntry);
      
      await this.delete(id);
    } catch (error) {
      this.logger.error('Error deleting invoice with audit', { error, id, auditEntry });
      throw error;
    }
  }

  async saveBatch(invoices: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Invoice[]> {
    try {
      const invoiceData = invoices.map(invoice => ({
        id: uuidv4(),
        invoice_number: invoice.invoiceNumber,
        bill_to: invoice.billTo,
        due_date: invoice.dueDate.toISOString(),
        total_amount: invoice.totalAmount,
        status: invoice.status,
        processing_attempts: invoice.processingAttempts || 0,
        last_processed_at: invoice.lastProcessedAt?.toISOString() || null,
        metadata: invoice.metadata,
        duplicate_of: invoice.duplicateOf || null,
        content_hash: invoice.contentHash || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { data, error } = await this.supabase
        .from('invoices')
        .insert(invoiceData)
        .select();

      if (error) {
        this.logger.error('Failed to save batch invoices', { error, count: invoices.length });
        throw new Error(`Database error: ${error.message}`);
      }

      return data?.map(item => this.mapToInvoice(item)) || [];
    } catch (error) {
      this.logger.error('Error saving batch invoices', { error, count: invoices.length });
      throw error;
    }
  }

  async updateBatch(updates: { id: string; updates: Partial<Invoice> }[]): Promise<Invoice[]> {
    try {
      const results: Invoice[] = [];
      
      // Process updates sequentially to avoid conflicts
      for (const update of updates) {
        const result = await this.update(update.id, update.updates);
        results.push(result);
      }
      
      return results;
    } catch (error) {
      this.logger.error('Error updating batch invoices', { error, count: updates.length });
      throw error;
    }
  }

  async healthCheck(): Promise<RepositoryHealthStatus> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      const { data, error } = await this.supabase
        .from('invoices')
        .select('count')
        .limit(1);

      const responseTime = Date.now() - startTime;

      if (error) {
        return {
          isHealthy: false,
          connectionStatus: 'error',
          responseTime,
          lastChecked: new Date(),
          errors: [error.message],
          warnings: [],
          metrics: {
            totalRecords: 0
          }
        };
      }

      // Get total record count
      const { count } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });

      return {
        isHealthy: true,
        connectionStatus: 'connected',
        responseTime,
        lastChecked: new Date(),
        errors: [],
        warnings: responseTime > 1000 ? ['High response time detected'] : [],
        metrics: {
          totalRecords: count || 0
        }
      };
    } catch (error) {
      return {
        isHealthy: false,
        connectionStatus: 'disconnected',
        responseTime: Date.now() - startTime,
        lastChecked: new Date(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        metrics: {
          totalRecords: 0
        }
      };
    }
  }

  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { data, error } = await this.supabase
        .from('invoices')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        this.logger.error('Failed to cleanup old invoices', { error, olderThanDays });
        throw new Error(`Database error: ${error.message}`);
      }

      const deletedCount = data?.length || 0;
      this.logger.log(`Cleaned up ${deletedCount} invoices older than ${olderThanDays} days`);
      
      return deletedCount;
    } catch (error) {
      this.logger.error('Error cleaning up old invoices', { error, olderThanDays });
      throw error;
    }
  }

  // Private helper methods
  private mapToInvoice(data: any): Invoice {
    return new Invoice({
      id: data.id,
      invoiceNumber: data.invoice_number,
      billTo: data.bill_to,
      dueDate: new Date(data.due_date),
      totalAmount: data.total_amount,
      status: data.status,
      processingAttempts: data.processing_attempts || 0,
      lastProcessedAt: data.last_processed_at ? new Date(data.last_processed_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      metadata: data.metadata || {},
      duplicateOf: data.duplicate_of,
      contentHash: data.content_hash
    });
  }

  private applyFilters(query: any, filters: InvoiceFilters): any {
    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters.dateFrom) {
      query = query.gte('due_date', filters.dateFrom.toISOString());
    }

    if (filters.dateTo) {
      query = query.lte('due_date', filters.dateTo.toISOString());
    }

    if (filters.amountMin !== undefined) {
      query = query.gte('total_amount', filters.amountMin);
    }

    if (filters.amountMax !== undefined) {
      query = query.lte('total_amount', filters.amountMax);
    }

    if (filters.invoiceNumber) {
      query = query.ilike('invoice_number', `%${filters.invoiceNumber}%`);
    }

    if (filters.billTo) {
      query = query.ilike('bill_to', `%${filters.billTo}%`);
    }

    if (filters.processingAttemptsMin !== undefined) {
      query = query.gte('processing_attempts', filters.processingAttemptsMin);
    }

    if (filters.processingAttemptsMax !== undefined) {
      query = query.lte('processing_attempts', filters.processingAttemptsMax);
    }

    return query;
  }

  private mapSortField(field: keyof Invoice): string {
    const fieldMap: Record<string, string> = {
      invoiceNumber: 'invoice_number',
      billTo: 'bill_to',
      dueDate: 'due_date',
      totalAmount: 'total_amount',
      processingAttempts: 'processing_attempts',
      lastProcessedAt: 'last_processed_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    };

    return fieldMap[field] || field;
  }

  private async getAuditTrail(invoiceId: string): Promise<AuditEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from('invoice_audit_trail')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('timestamp', { ascending: false });

      if (error) {
        this.logger.error('Failed to get audit trail', { error, invoiceId });
        return [];
      }

      return data?.map(item => ({
        id: item.id,
        invoiceId: item.invoice_id,
        action: item.action,
        timestamp: new Date(item.timestamp),
        userId: item.user_id,
        changes: item.changes || {},
        metadata: item.metadata || {},
        correlationId: item.correlation_id
      })) || [];
    } catch (error) {
      this.logger.error('Error getting audit trail', { error, invoiceId });
      return [];
    }
  }

  private async createAuditEntry(
    invoiceId: string, 
    auditEntry: Omit<AuditEntry, 'id' | 'invoiceId' | 'timestamp'>
  ): Promise<void> {
    try {
      const auditData = {
        id: uuidv4(),
        invoice_id: invoiceId,
        action: auditEntry.action,
        timestamp: new Date().toISOString(),
        user_id: auditEntry.userId || null,
        changes: auditEntry.changes || {},
        metadata: auditEntry.metadata || {},
        correlation_id: auditEntry.correlationId || null
      };

      const { error } = await this.supabase
        .from('invoice_audit_trail')
        .insert(auditData);

      if (error) {
        this.logger.error('Failed to create audit entry', { error, auditData });
        // Don't throw here to avoid breaking the main operation
      }
    } catch (error) {
      this.logger.error('Error creating audit entry', { error, invoiceId, auditEntry });
      // Don't throw here to avoid breaking the main operation
    }
  }
}