import { Injectable } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import type { ClerkClient } from '@clerk/backend';

@Injectable()
export class ClerkProvider {
  private readonly client: ClerkClient;

  constructor() {
    this.client = createClerkClient({
      secretKey: process.env['CLERK_SECRET_KEY'] ?? '',
    });
  }

  getClient(): ClerkClient {
    return this.client;
  }
}
