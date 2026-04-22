import { Module } from '@nestjs/common';
import { ClerkProvider } from './infrastructure/clerk.provider';
import { ClerkAuthGuard } from './infrastructure/guards/clerk-auth.guard';

@Module({
  providers: [ClerkProvider, ClerkAuthGuard],
  exports: [ClerkProvider, ClerkAuthGuard],
})
export class AuthModule {}
