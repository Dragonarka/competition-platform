import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './modules/database/database.module';
import { TrpcModule } from './trpc/trpc.module';

@Module({
  imports: [DatabaseModule, AuthModule, TrpcModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
