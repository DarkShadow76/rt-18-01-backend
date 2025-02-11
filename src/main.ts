import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'; 
  const port = process.env.PORT ?? 4447;
  app.enableCors({
    origin: frontendUrl, // Permitir solicitudes desde este origen
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: false,
  });
  await app.listen(port);
  console.log(`App Running on port: ${port}`);
}
bootstrap();
