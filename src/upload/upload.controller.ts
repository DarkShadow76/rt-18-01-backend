import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  HttpStatus,
  HttpCode,
  Body,
  Query,
  Inject,
  Logger
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { memoryStorage } from 'multer';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiConsumes, 
  ApiBody,
  ApiQuery
} from '@nestjs/swagger';
import { 
  UploadInvoiceDto, 
  InvoiceResponseDto, 
  SuccessResponseDto, 
  ErrorResponseDto,
  PaginationDto,
  PaginatedResponseDto
} from '../common/dto/upload-invoice.dto';
import { IInvoiceProcessingService } from '../models/service.interfaces';
import { AppError } from '../common/errors/app-error';
import { LoggerService } from '../common/logger/logger.service';
import * as crypto from 'crypto';

@ApiTags('Invoice Upload')
@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    @Inject('IInvoiceProcessingService') 
    private readonly invoiceProcessingService: IInvoiceProcessingService,
    private readonly loggerService: LoggerService
  ) {}

  @Post('invoice')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Upload and process invoice document',
    description: 'Upload an invoice file (PDF, PNG, JPG, JPEG) for processing and data extraction'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Invoice file upload',
    type: UploadInvoiceDto,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Invoice processed successfully',
    type: SuccessResponseDto<InvoiceResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid file or processing error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'File validation failed',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate invoice detected',
    type: ErrorResponseDto,
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
  )
  async uploadInvoice(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto?: UploadInvoiceDto
  ): Promise<SuccessResponseDto<InvoiceResponseDto>> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.log('Invoice upload request received', {
      filename: file?.originalname,
      size: file?.size,
      mimetype: file?.mimetype,
      correlationId
    });

    try {
      if (!file) {
        throw AppError.validationError(
          'No file uploaded',
          { field: 'file' },
          correlationId
        );
      }

      // Process the invoice using the service layer
      const processedInvoice = await this.invoiceProcessingService.processInvoice(file, {
        correlationId,
        forceReprocess: uploadDto?.forceReprocess || false,
        skipValidation: false,
        skipDuplicateCheck: false,
        metadata: {
          description: uploadDto?.description,
          uploadSource: 'api'
        }
      });

      const processingTime = Date.now() - startTime;

      this.loggerService.logPerformance(
        {
          operation: 'invoice-upload',
          durationMs: processingTime,
          startTime: new Date(startTime),
          endTime: new Date()
        },
        'UploadController'
      );

      const response: SuccessResponseDto<InvoiceResponseDto> = {
        success: true,
        data: processedInvoice.toResponseDto(),
        timestamp: new Date().toISOString(),
        correlationId
      };

      this.logger.log('Invoice processed successfully', {
        invoiceId: processedInvoice.id,
        invoiceNumber: processedInvoice.invoiceNumber,
        status: processedInvoice.status,
        processingTimeMs: processingTime,
        correlationId
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.loggerService.error(
        'Invoice processing failed',
        error.stack,
        'UploadController',
        {
          filename: file?.originalname,
          processingTimeMs: processingTime,
          correlationId,
          error: error.message
        }
      );

      // Re-throw AppError instances as-is, wrap others
      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.processingError(
        `Invoice processing failed: ${error.message}`,
        { originalError: error.message },
        correlationId
      );
    }
  }

  @Get('invoices')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get all invoices',
    description: 'Retrieve a paginated list of all processed invoices'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
    example: 1
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (max 100)',
    example: 10
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Field to sort by',
    example: 'createdAt'
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction',
    example: 'desc'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoices retrieved successfully',
    type: SuccessResponseDto<PaginatedResponseDto<InvoiceResponseDto>>,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid query parameters',
    type: ErrorResponseDto,
  })
  async getInvoices(
    @Query() paginationDto: PaginationDto
  ): Promise<SuccessResponseDto<PaginatedResponseDto<InvoiceResponseDto>>> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.log('Get invoices request received', {
      pagination: paginationDto,
      correlationId
    });

    try {
      // For now, we'll use a placeholder implementation
      // In a real implementation, this would use the repository service
      const mockInvoices: InvoiceResponseDto[] = [];
      const total = 0;

      const paginatedResult: PaginatedResponseDto<InvoiceResponseDto> = {
        items: mockInvoices,
        total,
        page: paginationDto.page || 1,
        limit: paginationDto.limit || 10,
        totalPages: Math.ceil(total / (paginationDto.limit || 10)),
        hasNext: (paginationDto.page || 1) * (paginationDto.limit || 10) < total,
        hasPrev: (paginationDto.page || 1) > 1
      };

      const processingTime = Date.now() - startTime;

      this.loggerService.logPerformance(
        {
          operation: 'get-invoices',
          durationMs: processingTime,
          startTime: new Date(startTime),
          endTime: new Date()
        },
        'UploadController'
      );

      const response: SuccessResponseDto<PaginatedResponseDto<InvoiceResponseDto>> = {
        success: true,
        data: paginatedResult,
        timestamp: new Date().toISOString(),
        correlationId
      };

      this.logger.log('Invoices retrieved successfully', {
        count: mockInvoices.length,
        processingTimeMs: processingTime,
        correlationId
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.loggerService.error(
        'Failed to retrieve invoices',
        error.stack,
        'UploadController',
        {
          pagination: paginationDto,
          processingTimeMs: processingTime,
          correlationId,
          error: error.message
        }
      );

      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.processingError(
        `Failed to retrieve invoices: ${error.message}`,
        { originalError: error.message },
        correlationId
      );
    }
  }

  @Get('invoices/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get invoice processing status',
    description: 'Get the current processing status of an invoice'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Processing status retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
    type: ErrorResponseDto,
  })
  async getProcessingStatus(
    @Query('id') invoiceId: string
  ): Promise<SuccessResponseDto<any>> {
    const correlationId = crypto.randomUUID();

    this.logger.log('Get processing status request received', {
      invoiceId,
      correlationId
    });

    try {
      const status = await this.invoiceProcessingService.getProcessingStatus(invoiceId);

      const response: SuccessResponseDto<any> = {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
        correlationId
      };

      return response;

    } catch (error) {
      this.loggerService.error(
        'Failed to get processing status',
        error.stack,
        'UploadController',
        {
          invoiceId,
          correlationId,
          error: error.message
        }
      );

      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.processingError(
        `Failed to get processing status: ${error.message}`,
        { originalError: error.message },
        correlationId
      );
    }
  }

  @Post('invoices/:id/reprocess')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Reprocess an invoice',
    description: 'Reprocess an existing invoice'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice reprocessed successfully',
    type: SuccessResponseDto<InvoiceResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Invoice cannot be reprocessed in current state',
    type: ErrorResponseDto,
  })
  async reprocessInvoice(
    @Query('id') invoiceId: string,
    @Body() options?: { forceReprocess?: boolean }
  ): Promise<SuccessResponseDto<InvoiceResponseDto>> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.log('Reprocess invoice request received', {
      invoiceId,
      options,
      correlationId
    });

    try {
      const reprocessedInvoice = await this.invoiceProcessingService.reprocessInvoice(
        invoiceId,
        {
          correlationId,
          forceReprocess: options?.forceReprocess || false
        }
      );

      const processingTime = Date.now() - startTime;

      this.loggerService.logPerformance(
        {
          operation: 'invoice-reprocess',
          durationMs: processingTime,
          startTime: new Date(startTime),
          endTime: new Date()
        },
        'UploadController'
      );

      const response: SuccessResponseDto<InvoiceResponseDto> = {
        success: true,
        data: reprocessedInvoice.toResponseDto(),
        timestamp: new Date().toISOString(),
        correlationId
      };

      this.logger.log('Invoice reprocessed successfully', {
        invoiceId,
        status: reprocessedInvoice.status,
        processingTimeMs: processingTime,
        correlationId
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.loggerService.error(
        'Invoice reprocessing failed',
        error.stack,
        'UploadController',
        {
          invoiceId,
          processingTimeMs: processingTime,
          correlationId,
          error: error.message
        }
      );

      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.processingError(
        `Invoice reprocessing failed: ${error.message}`,
        { originalError: error.message },
        correlationId
      );
    }
  }
}
