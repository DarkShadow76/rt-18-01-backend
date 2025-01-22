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
import { google } from '@google-cloud/documentai/build/protos/protos';
import { InvoiceService } from 'src/invoice/invoice.service';
import { DocumentData } from 'src/models/document-data.interface';

@Controller('upload')
export class UploadController {
  private client: DocumentProcessorServiceClient;

  private extractDataFromDocument(
    document: google.cloud.documentai.v1.IDocument,
  ): DocumentData {
    const extractedData: DocumentData = {
      invoiceNumber: '',
      billTo: '',
      dueDate: '',
      totalAmount: 0,
    };

    const fullText = document.text || '';

    const pages = document.pages || [];

    for (const page of pages) {
      const paragraphs = page.paragraphs || [];

      for (const paragraph of paragraphs) {
        const paragraphText = paragraph.layout.textAnchor.textSegments
          .map((segment) => {
            const startIndex = Number(segment.startIndex);
            const endIndex = Number(segment.endIndex);
            return fullText.substring(startIndex, endIndex);
          })
          .join('');

        if (paragraphText.includes('Invoice no:')) {
          extractedData.invoiceNumber = paragraphText
            .split('Invoice no:')[1]
            .split('\n')[0]
            .trim();
        }

        if (paragraphText.includes('FROM:')) {
          extractedData.billTo = paragraphText
            .split('FROM:')[1]
            .split('\n')[0]
            .trim();
        }

        if (paragraphText.includes('Due Date:')) {
          extractedData.dueDate = paragraphText
            .split('Due Date:')[1]
            .split('\n')[0]
            .trim();
        }

        if (paragraphText.includes('BALANCE DUE')) {
          const balanceDueMatch = paragraphText.match(
            /BALANCE DUE\s*\$?([\d,.]+)/,
          );
          if (balanceDueMatch) {
            extractedData.totalAmount =
              parseFloat(balanceDueMatch[1].replace(/,/g, '')) || 0;
          }
        }
      }
    }

    if (!extractedData.dueDate) {
      console.warn('Due date not found in the document:', fullText);
      throw new BadRequestException('Due date cannot be empty');
    }

    return extractedData;
  }

  constructor(
    private readonly configService: ConfigService, // Injeccion de Depencias
    private readonly invoiceService: InvoiceService,
  ) {
    this.client = new DocumentProcessorServiceClient();
  }

  @Post('invoice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  ) // Nombre de campo del formulario
  async uploadInvoice(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No File Uploaded');

    // Admite mas tipo de Archivos Pero de preferencia estos solamente
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
    const encodedImage = Buffer.from(file.buffer).toString('base64');
    const request = {
      name,
      rawDocument: {
        mimeType: file.mimetype,
        content: encodedImage,
      },
    };

    // console.log('Request: ', JSON.stringify(request, null, 2));
    // console.log(`${name}`);

    try {
      const [result] = await this.client.processDocument(request);
      const { document } = result;

      // Getting Text
      const responseData = this.extractDataFromDocument(document);

      await this.invoiceService.saveInvoiceData(responseData);

      return responseData;
    } catch (error) {
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
