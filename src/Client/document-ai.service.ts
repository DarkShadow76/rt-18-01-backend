import { Injectable } from '@nestjs/common';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { ConfigService } from '@nestjs/config';
import { Buffer } from 'buffer';

@Injectable()
export class DocumentAIService {
  private client: DocumentProcessorServiceClient;

  private projectId: string;
  private location: string;
  private processorId: string;

  constructor(private configService: ConfigService) {
    this.client = new DocumentProcessorServiceClient();

    const projectId = this.configService.get<string>('PROJECT_ID');
    const location = this.configService.get<string>('LOCATION');
    const processorId = this.configService.get<string>('PROCESSOR_ID');
  }

  async processDocument(
    fileBuffer: Buffer,
    mimeType: string,
    projectId: string,
    location: string,
    processorId: string,
  ) {
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    const encodedImage = Buffer.from(fileBuffer).toString('base64');

    const request = {
      name,
      rawDocument: {
        content: encodedImage,
        mimeType,
      },
      processOptions: {
        ocrConfig: {
          enableImageQualityScores: true,
        },
      },
    };

    const [result] = await this.client.processDocument(request);

    return result.document;
  }
}
