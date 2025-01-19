import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';

@Controller('upload')
export class UploadController {
  @Post('invoice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './invoices',
        filename: (req, file, cb) => {
          const uniqueSuffix = uuidv4();
          cb(null, `${uniqueSuffix}-${file.originalname}`);
        },
      }),
    }),
  ) // Nombre de campo del formulario
  uploadInvoice(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No File Uploaded');

    console.log(file);

    return {
      message: 'Invoice uploaded successfully',
      filename: file.originalname,
    };
  }

  @Get('invoice')
  getInvoices(): String {
    return 'Here you got the json list of Invoices';
  }
}
