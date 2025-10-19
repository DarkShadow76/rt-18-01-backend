import { Injectable, Logger, Inject } from '@nestjs/common';
import { 
  IAuditService, 
  IAuditRepository,
  AuditEntry, 
  AuditSearchCriteria,
  AuditActionStats,
  UserActivityStats
} from '../../models';
import { AuditAction } from '../../models/invoice.entity';

@Injectable()
export class AuditService implements IAuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject('IAuditRepository')
    private readonly auditRepository: IAuditRepository,
  ) {}

  /**
   * Log an action for audit trail
   */
  async logAction(
    invoiceId: string,
    action: string,
    changes: Record<string, any>,
    metadata: Record<string, any> = {},
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    try {
      const auditEntry: Omit<AuditEntry, 'id' | 'timestamp'> = {
        invoiceId,
        action: action as AuditAction,
        userId,
        changes,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          source: 'audit-service',
        },
        correlationId,
      };

      await this.auditRepository.save(auditEntry);
      
      this.logger.log(`Audit entry created for invoice ${invoiceId}, action: ${action}`, {
        invoiceId,
        action,
        userId,
        correlationId,
      });
    } catch (error) {
      this.logger.error(`Failed to create audit entry for invoice ${invoiceId}`, {
        error: error.message,
        invoiceId,
        action,
        userId,
        correlationId,
      });
      // Don't throw error to avoid breaking the main operation
    }
  }

  /**
   * Get audit trail for a specific invoice
   */
  async getAuditTrail(invoiceId: string): Promise<AuditEntry[]> {
    try {
      return await this.auditRepository.findByInvoiceId(invoiceId, {
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    } catch (error) {
      this.logger.error(`Failed to retrieve audit trail for invoice ${invoiceId}`, {
        error: error.message,
        invoiceId,
      });
      throw error;
    }
  }

  /**
   * Search audit logs based on criteria
   */
  async searchAuditLogs(criteria: AuditSearchCriteria): Promise<AuditEntry[]> {
    try {
      const result = await this.auditRepository.search(criteria);
      return result.entries;
    } catch (error) {
      this.logger.error('Failed to search audit logs', {
        error: error.message,
        criteria,
      });
      throw error;
    }
  }

  /**
   * Get paginated audit logs with search criteria
   */
  async searchAuditLogsPaginated(criteria: AuditSearchCriteria): Promise<{
    entries: AuditEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      return await this.auditRepository.search(criteria);
    } catch (error) {
      this.logger.error('Failed to search audit logs with pagination', {
        error: error.message,
        criteria,
      });
      throw error;
    }
  }

  /**
   * Get audit entries by action type
   */
  async getAuditEntriesByAction(
    action: AuditAction,
    limit?: number,
    offset?: number,
  ): Promise<AuditEntry[]> {
    try {
      return await this.auditRepository.findByAction(action, {
        limit,
        offset,
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    } catch (error) {
      this.logger.error(`Failed to retrieve audit entries for action ${action}`, {
        error: error.message,
        action,
      });
      throw error;
    }
  }

  /**
   * Get audit entries by user
   */
  async getAuditEntriesByUser(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<AuditEntry[]> {
    try {
      return await this.auditRepository.findByUserId(userId, {
        limit,
        offset,
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    } catch (error) {
      this.logger.error(`Failed to retrieve audit entries for user ${userId}`, {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get audit entries by correlation ID
   */
  async getAuditEntriesByCorrelationId(correlationId: string): Promise<AuditEntry[]> {
    try {
      return await this.auditRepository.findByCorrelationId(correlationId);
    } catch (error) {
      this.logger.error(`Failed to retrieve audit entries for correlation ID ${correlationId}`, {
        error: error.message,
        correlationId,
      });
      throw error;
    }
  }

  /**
   * Get audit entries within a date range
   */
  async getAuditEntriesByDateRange(
    startDate: Date,
    endDate: Date,
    limit?: number,
    offset?: number,
  ): Promise<AuditEntry[]> {
    try {
      return await this.auditRepository.findByDateRange(startDate, endDate, {
        limit,
        offset,
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    } catch (error) {
      this.logger.error('Failed to retrieve audit entries by date range', {
        error: error.message,
        startDate,
        endDate,
      });
      throw error;
    }
  }

  /**
   * Get action statistics for reporting
   */
  async getActionStats(dateFrom?: Date, dateTo?: Date): Promise<AuditActionStats> {
    try {
      return await this.auditRepository.getActionStats(dateFrom, dateTo);
    } catch (error) {
      this.logger.error('Failed to retrieve action statistics', {
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
  async getUserActivityStats(
    userId: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<UserActivityStats> {
    try {
      return await this.auditRepository.getUserActivityStats(userId, dateFrom, dateTo);
    } catch (error) {
      this.logger.error(`Failed to retrieve user activity statistics for user ${userId}`, {
        error: error.message,
        userId,
        dateFrom,
        dateTo,
      });
      throw error;
    }
  }

  /**
   * Count audit entries based on criteria
   */
  async countAuditEntries(criteria?: AuditSearchCriteria): Promise<number> {
    try {
      return await this.auditRepository.count(criteria);
    } catch (error) {
      this.logger.error('Failed to count audit entries', {
        error: error.message,
        criteria,
      });
      throw error;
    }
  }

  /**
   * Clean up old audit entries
   */
  async cleanupOldEntries(olderThanDays: number): Promise<number> {
    try {
      const deletedCount = await this.auditRepository.cleanup(olderThanDays);
      this.logger.log(`Cleaned up ${deletedCount} audit entries older than ${olderThanDays} days`);
      return deletedCount;
    } catch (error) {
      this.logger.error(`Failed to cleanup audit entries older than ${olderThanDays} days`, {
        error: error.message,
        olderThanDays,
      });
      throw error;
    }
  }

  /**
   * Check audit repository health
   */
  async healthCheck(): Promise<{ isHealthy: boolean; message: string }> {
    try {
      const healthStatus = await this.auditRepository.healthCheck();
      return {
        isHealthy: healthStatus.isHealthy,
        message: healthStatus.isHealthy ? 'Audit service is healthy' : 'Audit service has issues',
      };
    } catch (error) {
      this.logger.error('Audit service health check failed', {
        error: error.message,
      });
      return {
        isHealthy: false,
        message: `Audit service health check failed: ${error.message}`,
      };
    }
  }

  /**
   * Helper method to create audit entry for invoice creation
   */
  async logInvoiceCreated(
    invoiceId: string,
    invoiceData: Record<string, any>,
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    await this.logAction(
      invoiceId,
      AuditAction.CREATED,
      { created: invoiceData },
      { operation: 'invoice_creation' },
      userId,
      correlationId,
    );
  }

  /**
   * Helper method to create audit entry for invoice updates
   */
  async logInvoiceUpdated(
    invoiceId: string,
    oldData: Record<string, any>,
    newData: Record<string, any>,
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    const changes = this.calculateChanges(oldData, newData);
    await this.logAction(
      invoiceId,
      AuditAction.UPDATED,
      changes,
      { operation: 'invoice_update' },
      userId,
      correlationId,
    );
  }

  /**
   * Helper method to create audit entry for invoice deletion
   */
  async logInvoiceDeleted(
    invoiceId: string,
    invoiceData: Record<string, any>,
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    await this.logAction(
      invoiceId,
      AuditAction.DELETED,
      { deleted: invoiceData },
      { operation: 'invoice_deletion' },
      userId,
      correlationId,
    );
  }

  /**
   * Helper method to create audit entry for status changes
   */
  async logStatusChanged(
    invoiceId: string,
    oldStatus: string,
    newStatus: string,
    reason?: string,
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    await this.logAction(
      invoiceId,
      AuditAction.STATUS_CHANGED,
      { 
        oldStatus, 
        newStatus,
        reason,
      },
      { operation: 'status_change' },
      userId,
      correlationId,
    );
  }

  /**
   * Helper method to create audit entry for processing events
   */
  async logProcessingEvent(
    invoiceId: string,
    eventType: 'started' | 'completed' | 'failed' | 'retried',
    details: Record<string, any>,
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    const action = eventType === 'failed' ? AuditAction.FAILED : 
                   eventType === 'retried' ? AuditAction.REPROCESSED : 
                   AuditAction.PROCESSED;

    await this.logAction(
      invoiceId,
      action,
      { eventType, ...details },
      { operation: 'processing_event' },
      userId,
      correlationId,
    );
  }

  /**
   * Helper method to create audit entry for duplicate detection
   */
  async logDuplicateDetected(
    invoiceId: string,
    originalInvoiceId: string,
    similarityScore: number,
    detectionMethod: string,
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    await this.logAction(
      invoiceId,
      AuditAction.DUPLICATE_DETECTED,
      { 
        originalInvoiceId,
        similarityScore,
        detectionMethod,
      },
      { operation: 'duplicate_detection' },
      userId,
      correlationId,
    );
  }

  /**
   * Helper method to create audit entry for validation failures
   */
  async logValidationFailed(
    invoiceId: string,
    validationErrors: any[],
    validationType: string,
    userId?: string,
    correlationId?: string,
  ): Promise<void> {
    await this.logAction(
      invoiceId,
      AuditAction.VALIDATION_FAILED,
      { 
        validationErrors,
        validationType,
      },
      { operation: 'validation_failure' },
      userId,
      correlationId,
    );
  }

  /**
   * Calculate changes between old and new data
   */
  private calculateChanges(oldData: Record<string, any>, newData: Record<string, any>): Record<string, any> {
    const changes: Record<string, any> = {};
    
    // Check for modified fields
    for (const key in newData) {
      if (oldData[key] !== newData[key]) {
        changes[key] = {
          old: oldData[key],
          new: newData[key],
        };
      }
    }
    
    // Check for removed fields
    for (const key in oldData) {
      if (!(key in newData)) {
        changes[key] = {
          old: oldData[key],
          new: null,
        };
      }
    }
    
    return changes;
  }
}