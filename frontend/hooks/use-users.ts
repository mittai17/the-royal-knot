'use client';
import { asRows, useApi } from './use-api';
import type { User } from '@/types';

export function useUsers() {
  const r = useApi<unknown>('/users', { pageSize: 100 });
  return { users: asRows<User>(r.data), loading: r.loading };
}
