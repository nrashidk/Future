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
    uppercase: true,
    numbers: true,
    symbols: false,
  },
  medium: {
    length: 10,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: false,
  },
  strong: {
    length: 12,
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
  const randomBuffer = crypto.randomBytes(4);
  const randomInt = randomBuffer.readUInt32BE(0);
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

export function generateUsername(firstName: string, lastName: string, studentId?: string): string {
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (studentId) {
    return `${cleanFirst}.${cleanLast}.${studentId}`;
  }
  
  const randomSuffix = crypto.randomBytes(2).toString('hex');
  return `${cleanFirst}.${cleanLast}.${randomSuffix}`;
}
