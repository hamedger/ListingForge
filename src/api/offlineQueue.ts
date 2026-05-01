import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PendingVinJob } from '@/src/domain/types';

const KEY = 'listforge:pending_vin_jobs';

export async function enqueuePendingVinJob(job: PendingVinJob) {
  const raw = await AsyncStorage.getItem(KEY);
  const list: PendingVinJob[] = raw ? JSON.parse(raw) : [];
  list.push(job);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function drainPendingVinJobs(): Promise<PendingVinJob[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  await AsyncStorage.removeItem(KEY);
  return JSON.parse(raw) as PendingVinJob[];
}
