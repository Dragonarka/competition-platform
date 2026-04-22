import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk-auth.guard';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '@clerk/backend';
const mockVerifyToken = vi.mocked(verifyToken);

function makeContext(authHeader?: string): ExecutionContext {
  const req: Record<string, unknown> = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('ClerkAuthGuard', () => {
  let guard: ClerkAuthGuard;

  beforeEach(() => {
    guard = new ClerkAuthGuard();
    vi.clearAllMocks();
  });

  it('returns true and sets userId when token is valid', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_abc123' } as never);
    const ctx = makeContext('Bearer valid-token');
    const req = ctx.switchToHttp().getRequest<{ userId?: string }>();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.userId).toBe('user_abc123');
    expect(mockVerifyToken).toHaveBeenCalledWith(
      'valid-token',
      expect.objectContaining({ secretKey: expect.any(String) }),
    );
  });

  it('throws UnauthorizedException when Authorization header is missing', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when Bearer token part is missing', async () => {
    // 'Bearer '.split(' ')[1] === '' which is falsy — guard throws before calling verifyToken
    const ctx = makeContext('Bearer ');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when token verification fails', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Token expired'));
    const ctx = makeContext('Bearer bad-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
