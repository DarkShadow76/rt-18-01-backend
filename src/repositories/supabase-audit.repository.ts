import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  IAuditRepository,
  AuditEntry, 
  AuditQueryOptions,
  AuditSearchCriteria,
  AuditActionStats,
  UserActivityStats,
  RepositoryHealthStatus,
  DailyActivityStats
} from './interfaces/invoice-repository.interface';
import { ConfigurationService } from '../config/configuration.service';

@Injectable()
export class SupabaseAuditRepository implements IAuditRepository {
  private readonly logger = new Logger(SupabaseAuditRepository.name);
  private readonly supabase: SupabaseClient;
  private readonly tableName = 'invoice_audit_trail';

  constructor(private readonly configService: ConfigurationService) {
    const config = this.configService.database;
    this.supabase = createClient(config.url, config.apiKey);
  }

  /**
   * Save audit entry
   */
  async save(auditEntry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
    try {
      const entryToSave = {
        invoice_id: auditEntry.invoiceId,
        action: auditEntry.action,
        user_id: auditEntry.userId,
        changes: auditEntry.changes,
        metadata: auditEntry.metadata,
        correlation_id: auditEntry.correlationId,
        timestamp: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(entryToSave)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to save audit entry', {
          error: error.message,
          auditEntry: entryToSave,
        });
        throw new Error(`Failed to save audit entry: ${error.message}`);
      }

      return this.mapToAuditEntry(data);
    } catch (error) {
      this.logger.error('Error saving audit entry', {
        error: error.message,
        auditEntry,
      });
      throw error;
    }
  }

  /**
   * Find audit entry by ID
   */
  async findById(id: string): Promise<AuditEntry | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(`Failed to find audit entry: ${error.message}`);
      }

      return this.mapToAuditEntry(data);
    } catch (error) {
      this.logger.error(`Error finding audit entry by ID ${id}`, {
        error: error.message,
        id,
      });
      throw error;
    }
  }

  /**
   * Find audit entries by invoice ID
   */
  async findByInvoiceId(invoiceId: string, options?: AuditQueryOptions): Promise<AuditEntry[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('invoice_id', invoiceId);

      if (options?.sortBy && options?.sortOrder) {
        const column = this.mapSortColumn(options.sortBy);
        query = query.order(column, { ascending: options.sortOrder === 'asc' });
      } else {
        query = query.order('timestamp', { ascending: false });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to find audit entries by invoice ID: ${error.message}`);
      }

      return data.map(item => this.mapToAuditEntry(item));
    } catch (error) {
      this.logger.error(`Error finding audit entries by invoice ID ${invoiceId}`, {
        error: error.message,
        invoiceId,
        options,
      });
      throw error;
    }
  }

  /**
   * Find audit entries by action
   */
  async findByAction(action: string, options?: AuditQueryOptions): Promise<AuditEntry[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('action', action);

      if (options?.sortBy && options?.sortOrder) {
        const column = this.mapSortColumn(options.sortBy);
        query = query.order(column, { ascending: options.sortOrder === 'asc' });
      } else {
        query = query.order('timestamp', { ascending: false });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to find audit entries by action: ${error.message}`);
      }

      return data.map(item => this.mapToAuditEntry(item));
    } catch (error) {
      this.logger.error(`Error finding audit entries by action ${action}`, {
        error: error.message,
        action,
        options,
      });
      throw error;
    }
  }

  /**
   * Find audit entries by user ID
   */
  async findByUserId(userId: string, options?: AuditQueryOptions): Promise<AuditEntry[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (options?.sortBy && options?.sortOrder) {
        const column = this.mapSortColumn(options.sortBy);
        query = query.order(column, { ascending: options.sortOrder === 'asc' });
      } else {
        query = query.order('timestamp', { ascending: false });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to find audit entries by user ID: ${error.message}`);
      }

      return data.map(item => this.mapToAuditEntry(item));
    } catch (error) {
      this.logger.error(`Error finding audit entries by user ID ${userId}`, {
        error: error.message,
        userId,
        options,
      });
      throw error;
    }
  }

  /**
   * Find audit entries by date range
   */
  async findByDateRange(startDate: Date, endDate: Date, options?: AuditQueryOptions): Promise<AuditEntry[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString());

      if (options?.sortBy && options?.sortOrder) {
        const column = this.mapSortColumn(options.sortBy);
        query = query.order(column, { ascending: options.sortOrder === 'asc' });
      } else {
        query = query.order('timestamp', { ascending: false });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to find audit entries by date range: ${error.message}`);
      }

      return data.map(item => this.mapToAuditEntry(item));
    } catch (error) {
      this.logger.error('Error finding audit entries by date range', {
        error: error.message,
        startDate,
        endDate,
        options,
      });
      throw error;
    }
  }

  /**
   * Find audit entries by correlation ID
   */
  async findByCorrelationId(correlationId: string): Promise<AuditEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('correlation_id', correlationId)
        .order('timestamp', { ascending: false });

      if (error) {
        throw new Error(`Failed to find audit entries by correlation ID: ${error.message}`);
      }

      return data.map(item => this.mapToAuditEntry(item));
    } catch (error) {
      this.logger.error(`Error finding audit entries by correlation ID ${correlationId}`, {
        error: error.message,
        correlationId,
      });
      throw error;
    }
  }

  /**
   * Search audit entries with complex criteria
   */
  async search(criteria: AuditSearchCriteria): Promise<{
    entries: AuditEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      let query = this.supabase.from(this.tableName).select('*', { count: 'exact' });

      // Apply filters
      if (criteria.invoiceId) {
        query = query.eq('invoice_id', criteria.invoiceId);
      }
      if (criteria.action) {
        query = query.eq('action', criteria.action);
      }
      if (criteria.userId) {
        query = query.eq('user_id', criteria.userId);
      }
      if (criteria.correlationId) {
        query = query.eq('correlation_id', criteria.correlationId);
      }
      if (criteria.dateFrom) {
        query = query.gte('timestamp', criteria.dateFrom.toISOString());
      }
      if (criteria.dateTo) {
        query = query.lte('timestamp', criteria.dateTo.toISOString());
      }

      // Apply sorting
      if (criteria.sortBy && criteria.sortOrder) {
        const column = this.mapSortColumn(criteria.sortBy);
        query = query.order(column, { ascending: criteria.sortOrder === 'asc' });
      } else {
        query = query.order('timestamp', { ascending: false });
      }

      // Apply pagination
      const limit = criteria.limit || 10;
      const offset = criteria.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to search audit entries: ${error.message}`);
      }

      const total = count || 0;
      const page = Math.floor(offset / limit) + 1;
      const totalPages = Math.ceil(total / limit);

      return {
        entries: data.map(item => this.mapToAuditEntry(item)),
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      this.logger.error('Error searching audit entries', {
        error: error.message,
        criteria,
      });
      throw error;
    }
  }

  /**
   * Count audit entries
   */
  async count(criteria?: AuditSearchCriteria): Promise<number> {
    try {
      let query = this.supabase.from(this.tableName).select('*', { count: 'exact', head: true });

      if (criteria) {
        if (criteria.invoiceId) {
          query = query.eq('invoice_id', criteria.invoiceId);
        }
        if (criteria.action) {
          query = query.eq('action', criteria.action);
        }
        if (criteria.userId) {
          query = query.eq('user_id', criteria.userId);
        }
        if (criteria.correlationId) {
          query = query.eq('correlation_id', criteria.correlationId);
        }
        if (criteria.dateFrom) {
          query = query.gte('timestamp', criteria.dateFrom.toISOString());
        }
        if (criteria.dateTo) {
          query = query.lte('timestamp', criteria.dateTo.toISOString());
        }
      }

      const { count, error } = await query;

      if (error) {
        throw new Error(`Failed to count audit entries: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      this.logger.error('Error counting audit entries', {
        error: error.message,
        criteria,
      });
      throw error;
    }
  }

  /**
   * Get action statistics
   */
  async getActionStats(dateFrom?: Date, dateTo?: Date): Promise<AuditActionStats> {
    try {
      let query = this.supabase.from(this.tableName).select('action, user_id, timestamp');

      if (dateFrom) {
        query = query.gte('timestamp', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('timestamp', dateTo.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to get action stats: ${error.message}`);
      }

      const actionCounts: Record<string, number> = {};
      const userCounts: Record<string, number> = {};
      const dailyActivity: Record<string, DailyActivityStats> = {};

      data.forEach(entry => {
        // Count actions
        actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;

        // Count users
        if (entry.user_id) {
          userCounts[entry.user_id] = (userCounts[entry.user_id] || 0) + 1;
        }

        // Daily activity
        const date = new Date(entry.timestamp).toISOString().split('T')[0];
        if (!dailyActivity[date]) {
          dailyActivity[date] = {
            date: new Date(date),
            actionCount: 0,
            uniqueUsers: 0,
            topActions: {},
          };
        }
        dailyActivity[date].actionCount++;
        dailyActivity[date].topActions[entry.action] = (dailyActivity[date].topActions[entry.action] || 0) + 1;
      });

      // Calculate unique users per day
      Object.keys(dailyActivity).forEach(date => {
        const dayEntries = data.filter(entry => 
          new Date(entry.timestamp).toISOString().split('T')[0] === date
        );
        const uniqueUsers = new Set(dayEntries.map(entry => entry.user_id).filter(Boolean));
        dailyActivity[date].uniqueUsers = uniqueUsers.size;
      });

      return {
        totalActions: data.length,
        actionCounts,
        userCounts,
        dailyActivity: Object.values(dailyActivity),
      };
    } catch (error) {
      this.logger.error('Error getting action stats', {
        error: error.message,
        dateFrom,
        dateTo,
      });
      throw error;
    }
  }

  /**
   * Get user activity statistics
   */
  async getUserActivityStats(userId: string, dateFrom?: Date, dateTo?: Date): Promise<UserActivityStats> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('action, timestamp')
        .eq('user_id', userId);

      if (dateFrom) {
        query = query.gte('timestamp', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('timestamp', dateTo.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to get user activity stats: ${error.message}`);
      }

      if (data.length === 0) {
        return {
          userId,
          totalActions: 0,
          actionBreakdown: {},
          firstActivity: new Date(),
          lastActivity: new Date(),
          averageActionsPerDay: 0,
        };
      }

      const actionBreakdown: Record<string, number> = {};
      const timestamps = data.map(entry => new Date(entry.timestamp));

      data.forEach(entry => {
        actionBreakdown[entry.action] = (actionBreakdown[entry.action] || 0) + 1;
      });

      const firstActivity = new Date(Math.min(...timestamps.map(t => t.getTime())));
      const lastActivity = new Date(Math.max(...timestamps.map(t => t.getTime())));
      const daysDiff = Math.max(1, Math.ceil((lastActivity.getTime() - firstActivity.getTime()) / (1000 * 60 * 60 * 24)));
      const averageActionsPerDay = data.length / daysDiff;

      return {
        userId,
        totalActions: data.length,
        actionBreakdown,
        firstActivity,
        lastActivity,
        averageActionsPerDay,
      };
    } catch (error) {
      this.logger.error(`Error getting user activity stats for user ${userId}`, {
        error: error.message,
        userId,
        dateFrom,
        dateTo,
      });
      throw error;
    }
  }

  /**
   * Clean up old audit entries
   */
  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .delete()
        .lt('timestamp', cutoffDate.toISOString())
        .select('id');

      if (error) {
        throw new Error(`Failed to cleanup audit entries: ${error.message}`);
      }

      return data.length;
    } catch (error) {
      this.logger.error(`Error cleaning up audit entries older than ${olderThanDays} days`, {
        error: error.message,
        olderThanDays,
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<RepositoryHealthStatus> {
    const startTime = Date.now();
    
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('count', { count: 'exact', head: true })
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
          metrics: { totalRecords: 0 },
        };
      }

      return {
        isHealthy: true,
        connectionStatus: 'connected',
        responseTime,
        lastChecked: new Date(),
        errors: [],
        warnings: responseTime > 1000 ? ['High response time'] : [],
        metrics: { totalRecords: data?.length || 0 },
      };
    } catch (error) {
      return {
        isHealthy: false,
        connectionStatus: 'error',
        responseTime: Date.now() - startTime,
        lastChecked: new Date(),
        errors: [error.message],
        warnings: [],
        metrics: { totalRecords: 0 },
      };
    }
  }

  /**
   * Map database row to AuditEntry
   */
  private mapToAuditEntry(data: any): AuditEntry {
    return {
      id: data.id,
      invoiceId: data.invoice_id,
      action: data.action,
      timestamp: new Date(data.timestamp),
      userId: data.user_id,
      changes: data.changes || {},
      metadata: data.metadata || {},
      correlationId: data.correlation_id,
    };
  }

  /**
   * Map sort column names
   */
  private mapSortColumn(sortBy: keyof AuditEntry): string {
    const columnMap: Record<keyof AuditEntry, string> = {
      id: 'id',
      invoiceId: 'invoice_id',
      action: 'action',
      timestamp: 'timestamp',
      userId: 'user_id',
      changes: 'changes',
      metadata: 'metadata',
      correlationId: 'correlation_id',
    };

    return columnMap[sortBy] || 'timestamp';
  }
}