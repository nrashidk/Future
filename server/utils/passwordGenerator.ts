import crypto from 'crypto';

export type PasswordComplexity = 'easy' | 'medium' | 'strong';

interface PasswordConfig {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

const COMPLEXITY_CONFIGS: Record<PasswordComplexity, PasswordConfig> = {
  easy: {
    length: 8,
    lowercase: true,
    uppercase: false,
    numbers: true,
    symbols: false,
  },
  medium: {
    length: 12,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: false,
  },
  strong: {
    length: 16,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
  },
};

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+';

function getCharacterSet(config: PasswordConfig): string {
  let charset = '';
  if (config.lowercase) charset += LOWERCASE;
  if (config.uppercase) charset += UPPERCASE;
  if (config.numbers) charset += NUMBERS;
  if (config.symbols) charset += SYMBOLS;
  return charset;
}

function secureRandomInt(max: number): number {
  // Rejection sampling to avoid modulo bias: reject values in the biased tail
  // (those >= the largest multiple of `max` that fits in 2^32) and re-draw.
  const range = 2 ** 32;
  const limit = range - (range % max);
  let randomInt: number;
  do {
    randomInt = crypto.randomBytes(4).readUInt32BE(0);
  } while (randomInt >= limit);
  return randomInt % max;
}

export function generatePassword(complexity: PasswordComplexity = 'medium'): string {
  const config = COMPLEXITY_CONFIGS[complexity];
  const charset = getCharacterSet(config);
  
  if (charset.length === 0) {
    throw new Error('Invalid password configuration: no character sets enabled');
  }

  let password = '';
  const requiredChars: string[] = [];

  if (config.lowercase) requiredChars.push(LOWERCASE[secureRandomInt(LOWERCASE.length)]);
  if (config.uppercase) requiredChars.push(UPPERCASE[secureRandomInt(UPPERCASE.length)]);
  if (config.numbers) requiredChars.push(NUMBERS[secureRandomInt(NUMBERS.length)]);
  if (config.symbols) requiredChars.push(SYMBOLS[secureRandomInt(SYMBOLS.length)]);

  for (let i = requiredChars.length; i < config.length; i++) {
    const randomIndex = secureRandomInt(charset.length);
    password += charset[randomIndex];
  }

  const passwordArray = password.split('').concat(requiredChars);
  
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
  }

  return passwordArray.join('');
}

/**
 * Kept as a thin re-export so the three call sites have ONE definition to
 * follow. The rule itself — transliteration, the no-bare-dot guarantee and the
 * numbering — lives in shared/username.ts, pure and tested, because the old
 * version of this function had none of those and the damage it did was
 * invisible: every account carried four random hex characters it did not need,
 * and an Arabic name produced "..36ad".
 *
 * The old third parameter (`studentId`) is GONE. Nothing ever passed a student
 * id to it — the only callers passed a fresh random string on collision, which
 * is the behaviour being removed.
 */
export { usernameBase as generateUsername, resolveUsername } from "@shared/username";
