import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

import { verifyClerkJwt } from './clerk-jwt';
import { verifyToken } from '@clerk/backend';

const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

describe('verifyClerkJwt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { sub } on a valid token', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc' });
    const result = await verifyClerkJwt('valid-token');
    expect(result).toEqual({ sub: 'user_abc' });
    expect(mockVerifyToken).toHaveBeenCalledWith('valid-token', {
      secretKey: expect.any(String) as string,
    });
  });

  it('returns null on an invalid/expired token', async () => {
    mockVerifyToken.mockRejectedValue(new Error('Token expired'));
    const result = await verifyClerkJwt('expired-token');
    expect(result).toBeNull();
  });

  it('returns null when verifyToken throws synchronously', async () => {
    mockVerifyToken.mockImplementation(() => {
      throw new Error('bad token');
    });
    const result = await verifyClerkJwt('bad-token');
    expect(result).toBeNull();
  });
});
