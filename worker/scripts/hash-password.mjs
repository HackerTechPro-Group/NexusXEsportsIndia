#!/usr/bin/env node
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ITERATIONS = 100000;
const WEAK_PASSWORD_FRAGMENTS = [
  'password',
  '123456',
  'qwerty',
  'nexusx123',
  'admin123',
  'changeme',
];

function validatePasswordStrength(password) {
  if (!password || password.length < 14 || password.length > 256) {
    return 'Admin password must be between 14 and 256 characters (Workers WebCrypto PBKDF2 is capped at 100k iterations, so high password entropy is essential).';
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    return 'Admin password must include uppercase, lowercase, digit, and special characters.';
  }
  const lower = password.trim().toLowerCase();
  if (WEAK_PASSWORD_FRAGMENTS.some((frag) => lower.includes(frag))) {
    return 'Common predictable passphrase fragments cannot be used in production.';
  }
  if (/(.)\1{3,}/.test(password)) {
    return 'Admin password must not repeat the same character 4+ times consecutively.';
  }
  return null;
}

async function main() {
  let password = process.argv[2];
  if (!password) {
    const rl = readline.createInterface({ input, output });
    password = await rl.question('Enter new Admin password (visible input - clear terminal after): ');
    rl.close();
  }

  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    console.error(`Error: ${strengthError}`);
    process.exit(1);
  }

  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  const encoded = `pbkdf2_sha256$${ITERATIONS}$${salt.toString('base64')}$${derived.toString('base64')}`;

  console.log('\nADMIN_PASSWORD_HASH value for `wrangler secret put ADMIN_PASSWORD_HASH`:\n');
  console.log(encoded);
}

main();
