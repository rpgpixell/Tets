/**
 * Basic unit tests для key функций
 */

describe('Validation', () => {
  test('validateTelegramId should accept valid IDs', () => {
    const { validateTelegramId } = require('../../utils/validation');
    expect(validateTelegramId('123456789')).toBe(true);
    expect(validateTelegramId(123456789)).toBe(true);
  });

  test('validateTelegramId should reject invalid IDs', () => {
    const { validateTelegramId } = require('../../utils/validation');
    expect(validateTelegramId('invalid')).toBe(false);
    expect(validateTelegramId('')).toBe(false);
  });

  test('validateCharacterId should work correctly', () => {
    const { validateCharacterId } = require('../../utils/validation');
    expect(validateCharacterId('fire')).toBe(true);
    expect(validateCharacterId('light')).toBe(true);
    expect(validateCharacterId('water')).toBe(true);
    expect(validateCharacterId('invalid')).toBe(false);
  });

  test('validateAmount should validate correctly', () => {
    const { validateAmount } = require('../../utils/validation');
    expect(validateAmount(100)).toBe(true);
    expect(validateAmount(100, 50, 150)).toBe(true);
    expect(validateAmount(100, 150, 200)).toBe(false);
    expect(validateAmount(-10)).toBe(false);
    expect(validateAmount(3.5)).toBe(false);
  });
});

describe('Anti-Cheat', () => {
  test('should detect HP exceeding maxHP', () => {
    const { checkCheat } = require('../../utils/antiCheat');
    const cheat = checkCheat('test', {
      hp: 200,
      maxHp: 100,
      gold: 100,
      pixr: 10,
      level: 1,
    });
    expect(cheat.isCheat).toBe(true);
    expect(cheat.severity).toBe('high');
  });

  test('should detect negative values', () => {
    const { checkCheat } = require('../../utils/antiCheat');
    const cheat = checkCheat('test', {
      hp: 50,
      maxHp: 100,
      gold: -100,
      pixr: 10,
      level: 1,
    });
    expect(cheat.isCheat).toBe(true);
  });

  test('should pass legitimate data', () => {
    const { checkCheat } = require('../../utils/antiCheat');
    const cheat = checkCheat('test', {
      hp: 50,
      maxHp: 100,
      gold: 1000,
      pixr: 10,
      level: 5,
    });
    expect(cheat.isCheat).toBe(false);
  });
});

describe('Game Service', () => {
  test('calculateXpForLevel should work', () => {
    const { calculateXpForLevel } = require('../../services/GameService');
    const xp1 = calculateXpForLevel(1);
    const xp2 = calculateXpForLevel(2);
    expect(xp1).toBeLessThan(xp2);
  });

  test('canUnlockFloor should check CP requirement', () => {
    const { canUnlockFloor } = require('../../services/GameService');
    expect(canUnlockFloor(0, 1)).toBe(true);
    expect(canUnlockFloor(100, 1)).toBe(true);
    expect(canUnlockFloor(100, 2)).toBe(false);
    expect(canUnlockFloor(1000, 2)).toBe(true);
  });
});
