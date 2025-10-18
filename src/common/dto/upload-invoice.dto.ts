import { 
  IsNotEmpty, 
  IsOptional, 
  IsString, 
  IsNumber, 
  IsDateString, 
  IsEnum, 
  IsUUID, 
  IsPositive, 
  IsInt, 
  Min, 
  Max, 
  ValidateNested 
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Enums for validation
export enum InvoiceStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DUPLICATE = 'duplicate'
}

export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  DUPLICATE_ERROR = 'DUPLICATE_ERROR',
  FILE_VALIDATION_ERROR = 'FILE_VALIDATION_ERROR'
}

// Metadata DTOs
export class InvoiceMetadataDto {
  @ApiProperty({ description: 'Original filename of the uploaded file' })
  @IsString()
  @IsNotEmpty()
  originalFileName: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @IsPositive()
  fileSize: number;

  @ApiProperty({ description: 'MIME type of the uploaded file' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({ description: 'Processing time in milliseconds' })
  @IsNumber()
  @Min(0)
  processingTimeMs: number;

  @ApiProperty({ description: 'Confidence score from document extraction (0-1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  extractionConfidence: number;

  @ApiPropertyOptional({ description: 'Document AI processor version used' })
  @IsOptional()
  @IsString()
  documentAiVersion?: string;
}

// Upload DTO
export class UploadInvoiceDto {
  @ApiProperty({ 
    type: 'string', 
    format: 'binary',
    description: 'Invoice file to upload (PDF, PNG, JPG, JPEG)' 
  })
  @IsNotEmpty({ message: 'File is required' })
  file: Express.Multer.File;

  @ApiPropertyOptional({ description: 'Optional description for the invoice' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({ description: 'Force reprocessing even if duplicate is found' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  forceReprocess?: boolean;
}

// Response DTOs
export class InvoiceResponseDto {
  @ApiProperty({ description: 'Unique invoice identifier' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'Invoice number extracted from document' })
  @IsString()
  @IsNotEmpty()
  invoiceNumber: string;

  @ApiProperty({ description: 'Bill to information' })
  @IsString()
  @IsNotEmpty()
  billTo: string;

  @ApiProperty({ description: 'Due date in ISO format' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ description: 'Total amount of the invoice' })
  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @ApiProperty({ enum: InvoiceStatus, description: 'Current processing status' })
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;

  @ApiProperty({ description: 'Number of processing attempts' })
  @IsInt()
  @Min(0)
  processingAttempts: number;

  @ApiPropertyOptional({ description: 'Last processing timestamp' })
  @IsOptional()
  @IsDateString()
  lastProcessedAt?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  @IsDateString()
  createdAt: string;

  @ApiProperty({ description: 'Last update timestamp' })
  @IsDateString()
  updatedAt: string;

  @ApiProperty({ type: InvoiceMetadataDto, description: 'Processing metadata' })
  @ValidateNested()
  @Type(() => InvoiceMetadataDto)
  metadata: InvoiceMetadataDto;
}

// Error handling DTOs
export class ErrorDetailsDto {
  @ApiProperty({ enum: ErrorType, description: 'Type of error that occurred' })
  @IsEnum(ErrorType)
  type: ErrorType;

  @ApiProperty({ description: 'Human-readable error message' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Additional error details' })
  @IsOptional()
  details?: any;

  @ApiPropertyOptional({ description: 'Correlation ID for tracking' })
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional({ description: 'Field-specific validation errors' })
  @IsOptional()
  fieldErrors?: Record<string, string[]>;
}

export class ErrorResponseDto {
  @ApiProperty({ description: 'Success indicator', default: false })
  success: false;

  @ApiProperty({ type: ErrorDetailsDto, description: 'Error information' })
  @ValidateNested()
  @Type(() => ErrorDetailsDto)
  error: ErrorDetailsDto;

  @ApiProperty({ description: 'Response timestamp' })
  @IsDateString()
  timestamp: string;
}

export class SuccessResponseDto<T = any> {
  @ApiProperty({ description: 'Success indicator', default: true })
  success: true;

  @ApiProperty({ description: 'Response data' })
  data: T;

  @ApiProperty({ description: 'Response timestamp' })
  @IsDateString()
  timestamp: string;

  @ApiPropertyOptional({ description: 'Correlation ID for tracking' })
  @IsOptional()
  @IsString()
  correlationId?: string;
}

// Validation DTOs for file upload
export class FileValidationResultDto {
  @ApiProperty({ description: 'Whether the file passed validation' })
  isValid: boolean;

  @ApiProperty({ description: 'List of validation errors if any' })
  errors: string[];

  @ApiProperty({ description: 'File metadata' })
  metadata: {
    size: number;
    mimeType: string;
    originalName: string;
  };
}

// Pagination DTOs
export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Sort field' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Array of items' })
  items: T[];

  @ApiProperty({ description: 'Total number of items' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Whether there are more pages' })
  hasNext: boolean;

  @ApiProperty({ description: 'Whether there are previous pages' })
  hasPrev: boolean;
}