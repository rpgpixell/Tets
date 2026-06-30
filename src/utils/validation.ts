import validator from 'validator';
import { logger } from './logger';

// ═══════════════════════════════════════════════════════
// VALIDATION UTILITIES
// ═══════════════════════════════════════════════════════

export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationResult {
  private errors: ValidationError[] = [];

  addError(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  isValid(): boolean {
    return this.errors.length === 0;
  }

  getErrors(): ValidationError[] {
    return this.errors;
  }

  getFirstError(): ValidationError | null {
    return this.errors[0] || null;
  }
}

// ═══════════════════════════════════════════════════════
// VALIDATORS
// ═══════════════════════════════════════════════════════

export function validateTelegramId(id: string | number): boolean {
  const idStr = String(id);
  return /^\d{1,20}$/.test(idStr);
}

export function validateCharacterId(charId: string): boolean {
  const validIds = ['fire', 'light', 'water'];
  return validIds.includes(charId);
}

export function validateEmail(email: string): boolean {
  return validator.isEmail(email);
}

export function validateWallet(wallet: string): boolean {
  if (!wallet || wallet.length < 10 || wallet.length > 100) return false;
  // Basic TON address validation (base64url format)
  return /^[A-Za-z0-9_\-+=/]{32,100}$/.test(wallet);
}

export function validateAmount(amount: unknown, min = 1, max = Infinity): boolean {
  if (typeof amount !== 'number') return false;
  if (!Number.isInteger(amount)) return false;
  return amount >= min && amount <= max;
}

export function validateItemId(id: unknown): boolean {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

export function validatePrice(price: unknown): boolean {
  return typeof price === 'number' && Number.isFinite(price) && price >= 1;
}

export function validateFloor(floor: unknown): boolean {
  return typeof floor === 'number' && Number.isInteger(floor) && floor >= 1 && floor <= 10;
}

export function validateRarity(rarity: string): boolean {
  const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legend'];
  return validRarities.includes(rarity);
}

export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return validator.trim(validator.escape(input)).substring(0, 500);
}

export function validateGameData(data: any): ValidationResult {
  const result = new ValidationResult();

  if (!data || typeof data !== 'object') {
    result.addError('data', 'Data must be an object');
    return result;
  }

  if (data.tgId && !validateTelegramId(data.tgId)) {
    result.addError('tgId', 'Invalid Telegram ID');
  }

  if (data.charId && !validateCharacterId(data.charId)) {
    result.addError('charId', 'Invalid character ID');
  }

  if (typeof data.level !== 'undefined' && (typeof data.level !== 'number' || data.level < 1)) {
    result.addError('level', 'Level must be >= 1');
  }

  if (typeof data.hp !== 'undefined' && (typeof data.hp !== 'number' || data.hp < 0)) {
    result.addError('hp', 'HP must be >= 0');
  }

  if (typeof data.gold !== 'undefined' && (typeof data.gold !== 'number' || data.gold < 0)) {
    result.addError('gold', 'Gold must be >= 0');
  }

  if (typeof data.pixr !== 'undefined' && (typeof data.pixr !== 'number' || data.pixr < 0)) {
    result.addError('pixr', 'PIXR must be >= 0');
  }

  return result;
}

export function validateDelta(delta: any): ValidationResult {
  const result = new ValidationResult();

  if (!delta || typeof delta !== 'object') {
    result.addError('delta', 'Delta must be an object');
    return result;
  }

  // All fields in delta should be reasonable numbers or arrays
  const allowedFields = [
    'hp',
    'gold',
    'xp',
    'pixr',
    'floor',
    'level',
    'inventory',
    'equipped',
    'upg',
    'skills',
  ];

  for (const [key, value] of Object.entries(delta)) {
    if (!allowedFields.includes(key)) {
      result.addError(key, `Field not allowed: ${key}`);
    }

    // Basic type checking
    if (typeof value === 'number' && !Number.isFinite(value)) {
      result.addError(key, `${key} must be a valid number`);
    }
  }

  return result;
}
