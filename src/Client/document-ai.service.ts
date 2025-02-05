import { Injectable, OnModuleInit } from '@nestjs/common';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { ConfigService } from '@nestjs/config';
import { Buffer } from 'buffer';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentAIService implements OnModuleInit {
  private client: DocumentProcessorServiceClient;
  private storage: Storage;
  private projectId: string;
  private location: string;
  private processorId: string;

  constructor(private configService: ConfigService) {
    this.client = new DocumentProcessorServiceClient();

    const projectId = this.configService.get<string>('PROJECT_ID');
    const location = this.configService.get<string>('LOCATION');
    const processorId = this.configService.get<string>('PROCESSOR_ID');
  }
  async onModuleInit() {
    try {
      const credentialPath = path.join('/tmp', 'google-credentials.json');
      fs.writeFileSync(credentialPath,
        this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS'),
      );

      this.storage = new Storage({
        keyFilename: credentialPath,
      });
      console.log('Google Cloud Storage Client Started');
    } catch (error) {
      console.log(
        'Error Starting Google Cloud Storage:',
        error,
      );
    }
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
