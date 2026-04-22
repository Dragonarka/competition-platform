export interface GetCurrentUserResult {
  userId: string;
}

export function getCurrentUser(userId: string): GetCurrentUserResult {
  return { userId };
}
