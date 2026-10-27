import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { Inventory } from '../../shared/contracts';

export async function collectInventory(): Promise<Inventory> {
  return {
    platform: Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web',
    model: Platform.OS === 'web' ? 'Browser preview' : Device.modelName || 'Unknown model',
    osVersion: Platform.OS === 'web' ? 'unavailable' : Device.osVersion || 'unavailable',
    isPhysicalDevice: Platform.OS !== 'web' && Device.isDevice,
    appVersion: Constants.expoConfig?.version || '1.0.0',
    collectedAt: new Date().toISOString(),
  };
}
