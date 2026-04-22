// Domain event types — defined in relevant stories
export interface DomainEvent<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly occurredAt: string;
}
