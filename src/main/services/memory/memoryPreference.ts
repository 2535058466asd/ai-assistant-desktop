// ==========================================
// 用户偏好读写（JSON 文件持久化）
// ==========================================

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { createLogger } from '../../../shared/logger';
import type { UserPreferences } from './memoryTypes';

const logger = createLogger('memoryStore');

export class PreferenceStore {
  private preferencesPath: string;
  private preferences: UserPreferences;

  constructor(dataDir: string) {
    this.preferencesPath = path.join(dataDir, 'preferences.json');
    this.preferences = this.load();
  }

  private load(): UserPreferences {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Load user preferences failed', error);
    }
    return {};
  }

  private save(): void {
    try {
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2));
      logger.info('User preferences saved');
    } catch (error) {
      logger.error('Save user preferences failed', error);
    }
  }

  set(key: string, value: any): void {
    this.preferences[key] = value;
    this.save();
  }

  get(key: string): any {
    return this.preferences[key];
  }

  getAll(): UserPreferences {
    return { ...this.preferences };
  }
}
