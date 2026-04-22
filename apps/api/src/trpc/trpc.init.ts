import { initTRPC } from '@trpc/server';
import type { TrpcContext } from './trpc.context';

export const t = initTRPC.context<TrpcContext>().create();
