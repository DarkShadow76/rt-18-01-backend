import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { Buffer } from 'buffer';
import { InvoiceService } from 'src/invoice/invoice.service';
import { DocumentData } from 'src/models/document-data.interface';
import logger from 'src/logger';

@Controller('upload')
export class UploadController {
  private client: DocumentProcessorServiceClient;

  private extractDataFromDocument(response: any): DocumentData {
    const extractedData: DocumentData = {
      invoiceNumber: '',
      billTo: '',
      dueDate: '',
      totalAmount: 0,
    };

    const document = response.document;

    if (!document || !document.pages || document.pages.length === 0) {
      throw new BadRequestException('Document does not contain any pages.');
    }

    // console.log('Full Document Response:', JSON.stringify(document, null, 2));

    if (document.entities && document.entities.length > 0) {
      for (const entity of document.entities) {
        switch (entity.type) {
          case 'invoice_id':
            extractedData.invoiceNumber = entity.mentionText.trim();
            break;
          case 'due_date':
            extractedData.dueDate = entity.mentionText.trim();
            break;
          case 'receiver_name':
            extractedData.billTo = entity.mentionText.trim();
            break;
          case 'total_amount':
            extractedData.totalAmount = this.parseTotalAmount(
              entity.mentionText.trim(),
            );
            break;
          default:
            console.warn(`Unknown entity type: ${entity.type}`);
            break;
        }
      }
    } else {
      console.warn('No entities found in the document.');
    }

    if (!extractedData.dueDate) {
      console.warn(
        'Due date was not found in the extracted data:',
        extractedData,
      );
      throw new BadRequestException('Due date cannot be empty');
    }

    return extractedData; // Retorna el objeto con los datos extraídos
  }

  private parseTotalAmount(totalString: string): number {
    // Eliminar símbolos de moneda y comas
    const cleanedString = totalString.replace(/[$,]/g, '').trim();
    const amount = parseFloat(cleanedString);

    return isNaN(amount) ? 0 : amount;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly invoiceService: InvoiceService,
  ) {
    this.client = new DocumentProcessorServiceClient();
  }

  @Post('invoice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  async uploadInvoice(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No File Uploaded');

    const validMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];

    if (!validMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `No Amitted file format: ${file.mimetype}, Upload PDF, JPEG, PNG file`,
      );
    }

    // console.log(file);

    const projectId = this.configService.get<string>('PROJECT_ID');
    const location = this.configService.get<string>('LOCATION');
    const processorId = this.configService.get<string>('PROCESSOR_ID');

    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    // Convertir a Base 64
    const encodedDocument = Buffer.from(file.buffer).toString('base64');
    const request = {
      name,
      rawDocument: {
        mimeType: file.mimetype,
        content: encodedDocument,
      },
    };

    // console.log('Request: ', JSON.stringify(request, null, 2));
    // console.log(`${name}`);

    try {
      const [result] = await this.client.processDocument(request);

      // console.log('Full response:', JSON.stringify(result, null, 2));

      logger.info('Document processed successfully');

      const { document } = result;

      if (!document || !document.text) {
        throw new BadRequestException('Document does not contain text.');
      }

      // Getting Values
      const responseData = this.extractDataFromDocument(result);

      await this.invoiceService.saveInvoiceData(responseData);

      return responseData;
    } catch (error) {
      logger.error('Error at Processing Invoice: ' + error.message); // Log de error
      throw new BadRequestException(
        'Error at Processing Invoice: ' + error.message,
      );
    }
  }

  @Get('invoice')
  getInvoices(): String {
    return 'Here you got the json list of Invoices';
  }
}
