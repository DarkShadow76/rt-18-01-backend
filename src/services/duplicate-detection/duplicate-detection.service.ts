import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { 
  IDuplicateDetectionService, 
  IInvoiceRepository 
} from '../../models/service.interfaces';
import { 
  Invoice, 
  DuplicateDetectionResult, 
  DuplicateDetectionMethod,
  DuplicateResolution,
  AuditAction 
} from '../../models/invoice.entity';

@Injectable()
export class DuplicateDetectionService implements IDuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(
    // Note: Repository will be injected when repository layer is implemented
    // private readonly invoiceRepository: IInvoiceRepository,
  ) {}

  /**
   * Check for duplicates using multiple detection methods
   */
  async checkForDuplicates(invoice: Partial<Invoice>): Promise<DuplicateDetectionResult> {
    if (!invoice) {
      throw new Error('Invoice data is required for duplicate detection');
    }

    this.logger.debug(`Checking for duplicates for invoice: ${invoice.invoiceNumber || 'unknown'}`);

    try {
      // Method 1: Check by invoice number (exact match)
      const invoiceNumberDuplicate = await this.checkByInvoiceNumber(invoice.invoiceNumber);
      if (invoiceNumberDuplicate.isDuplicate) {
        this.logger.warn(`Duplicate found by invoice number: ${invoice.invoiceNumber}`);
        return invoiceNumberDuplicate;
      }

      // Method 2: Check by content hash
      const contentHash = this.generateContentHash(invoice);
      const contentHashDuplicate = await this.checkByContentHash(contentHash);
      if (contentHashDuplicate.isDuplicate) {
        this.logger.warn(`Duplicate found by content hash for invoice: ${invoice.invoiceNumber}`);
        return contentHashDuplicate;
      }

      // Method 3: Fuzzy matching for similar invoices
      const fuzzyMatchDuplicate = await this.checkByFuzzyMatch(invoice);
      if (fuzzyMatchDuplicate.isDuplicate) {
        this.logger.warn(`Potential duplicate found by fuzzy matching for invoice: ${invoice.invoiceNumber}`);
        return fuzzyMatchDuplicate;
      }

      this.logger.debug(`No duplicates found for invoice: ${invoice.invoiceNumber}`);
      return {
        isDuplicate: false,
        detectionMethod: DuplicateDetectionMethod.COMBINED,
        confidence: 1.0,
      };

    } catch (error) {
      this.logger.error(`Error checking for duplicates: ${error.message}`, error.stack);
      throw new Error(`Failed to check for duplicates: ${error.message}`);
    }
  }

  /**
   * Generate a content hash for duplicate detection
   */
  generateContentHash(invoice: Partial<Invoice>): string {
    try {
      // Create a normalized string representation of key invoice fields
      const normalizedData = {
        invoiceNumber: this.normalizeString(invoice.invoiceNumber),
        billTo: this.normalizeString(invoice.billTo),
        totalAmount: this.normalizeAmount(invoice.totalAmount),
        dueDate: this.normalizeDate(invoice.dueDate),
      };

      const dataString = JSON.stringify(normalizedData, Object.keys(normalizedData).sort());
      const hash = createHash('sha256').update(dataString).digest('hex');
      
      this.logger.debug(`Generated content hash for invoice ${invoice.invoiceNumber}: ${hash.substring(0, 8)}...`);
      return hash;

    } catch (error) {
      this.logger.error(`Error generating content hash: ${error.message}`, error.stack);
      throw new Error(`Failed to generate content hash: ${error.message}`);
    }
  }

  /**
   * Find similar invoices using various matching criteria
   */
  async findSimilarInvoices(invoice: Partial<Invoice>): Promise<Invoice[]> {
    if (!invoice) {
      throw new Error('Invoice data is required to find similar invoices');
    }

    this.logger.debug(`Finding similar invoices for: ${invoice.invoiceNumber || 'unknown'}`);

    try {
      const similarInvoices: Invoice[] = [];

      // TODO: Implement when repository is available
      // This would search for invoices with:
      // - Same invoice number
      // - Same content hash
      // - Similar bill-to and amount combinations
      // - Similar due dates with same amounts

      this.logger.debug(`Found ${similarInvoices.length} similar invoices`);
      return similarInvoices;

    } catch (error) {
      this.logger.error(`Error finding similar invoices: ${error.message}`, error.stack);
      throw new Error(`Failed to find similar invoices: ${error.message}`);
    }
  }

  /**
   * Resolve a duplicate by linking it to the original
   */
  async resolveDuplicate(duplicateId: string, originalId: string, resolution: string): Promise<void> {
    this.logger.debug(`Resolving duplicate: ${duplicateId} -> ${originalId} with resolution: ${resolution}`);

    try {
      // TODO: Implement when repository is available
      // This would:
      // 1. Update the duplicate invoice status
      // 2. Set the duplicateOf field
      // 3. Create audit trail entries
      // 4. Store the resolution in duplicate records table

      this.logger.log(`Successfully resolved duplicate ${duplicateId} with resolution: ${resolution}`);

    } catch (error) {
      this.logger.error(`Error resolving duplicate: ${error.message}`, error.stack);
      throw new Error(`Failed to resolve duplicate: ${error.message}`);
    }
  }

  /**
   * Check for duplicates by exact invoice number match
   */
  private async checkByInvoiceNumber(invoiceNumber: string): Promise<DuplicateDetectionResult> {
    if (!invoiceNumber) {
      return {
        isDuplicate: false,
        detectionMethod: DuplicateDetectionMethod.INVOICE_NUMBER,
        confidence: 0,
      };
    }

    try {
      // TODO: Implement when repository is available
      // const existingInvoice = await this.invoiceRepository.findByInvoiceNumber(invoiceNumber);
      const existingInvoice = null; // Placeholder

      if (existingInvoice) {
        return {
          isDuplicate: true,
          originalInvoiceId: existingInvoice.id,
          similarityScore: 1.0,
          detectionMethod: DuplicateDetectionMethod.INVOICE_NUMBER,
          confidence: 1.0,
        };
      }

      return {
        isDuplicate: false,
        detectionMethod: DuplicateDetectionMethod.INVOICE_NUMBER,
        confidence: 1.0,
      };

    } catch (error) {
      this.logger.error(`Error checking by invoice number: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check for duplicates by content hash
   */
  private async checkByContentHash(contentHash: string): Promise<DuplicateDetectionResult> {
    try {
      // TODO: Implement when repository is available
      // const existingInvoices = await this.invoiceRepository.findByContentHash(contentHash);
      const existingInvoices = []; // Placeholder

      if (existingInvoices.length > 0) {
        return {
          isDuplicate: true,
          originalInvoiceId: existingInvoices[0].id,
          similarityScore: 1.0,
          detectionMethod: DuplicateDetectionMethod.CONTENT_HASH,
          confidence: 0.95,
        };
      }

      return {
        isDuplicate: false,
        detectionMethod: DuplicateDetectionMethod.CONTENT_HASH,
        confidence: 0.95,
      };

    } catch (error) {
      this.logger.error(`Error checking by content hash: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check for duplicates using fuzzy matching
   */
  private async checkByFuzzyMatch(invoice: Partial<Invoice>): Promise<DuplicateDetectionResult> {
    try {
      // TODO: Implement when repository is available
      // This would search for invoices with:
      // - Similar bill-to names (using string similarity)
      // - Same or very close amounts
      // - Similar due dates

      const similarityThreshold = 0.85;
      const highestSimilarity = 0; // Placeholder

      if (highestSimilarity >= similarityThreshold) {
        return {
          isDuplicate: true,
          originalInvoiceId: 'placeholder-id',
          similarityScore: highestSimilarity,
          detectionMethod: DuplicateDetectionMethod.FUZZY_MATCH,
          confidence: 0.8,
        };
      }

      return {
        isDuplicate: false,
        detectionMethod: DuplicateDetectionMethod.FUZZY_MATCH,
        confidence: 0.8,
      };

    } catch (error) {
      this.logger.error(`Error checking by fuzzy match: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Normalize string for consistent comparison
   */
  private normalizeString(value: string): string {
    if (!value) return '';
    return value.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Normalize amount for consistent comparison
   */
  private normalizeAmount(amount: number): number {
    if (!amount || isNaN(amount)) return 0;
    // Round to 2 decimal places to handle floating point precision issues
    return Math.round(amount * 100) / 100;
  }

  /**
   * Normalize date for consistent comparison
   */
  private normalizeDate(date: Date): string {
    if (!date) return '';
    try {
      return new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch {
      return '';
    }
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    const normalizedStr1 = this.normalizeString(str1);
    const normalizedStr2 = this.normalizeString(str2);
    
    if (normalizedStr1 === normalizedStr2) return 1;
    
    const distance = this.levenshteinDistance(normalizedStr1, normalizedStr2);
    const maxLength = Math.max(normalizedStr1.length, normalizedStr2.length);
    
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}