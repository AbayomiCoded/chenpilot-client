import { describe, it, expect } from 'vitest';
import { detectLanguage, isForeignLanguage } from './translation';

describe('message language detection (#83)', () => {
  it('detects the app languages', () => {
    expect(detectLanguage('What is the balance of my wallet and the fees?')).toBe('en');
    expect(detectLanguage('¿Cuál es el saldo de mi cartera para la semana?')).toBe('es');
    expect(detectLanguage('Quel est le solde de mon portefeuille pour la semaine?')).toBe('fr');
    expect(detectLanguage('ما هو رصيد محفظتي اليوم')).toBe('ar');
  });

  it('returns null without enough signal', () => {
    expect(detectLanguage('')).toBeNull();
    expect(detectLanguage('XLM 100')).toBeNull();
  });

  it('offers translation only for messages in another language', () => {
    expect(isForeignLanguage('¿Cuál es el saldo de mi cartera para la semana?', 'en')).toBe(true);
    expect(isForeignLanguage('What is the balance of my wallet and the fees?', 'en')).toBe(false);
    expect(isForeignLanguage('XLM 100', 'en')).toBe(false);
  });
});
