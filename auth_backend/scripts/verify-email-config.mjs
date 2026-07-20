import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { verifyEmailDelivery } from '../services/emailService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const result = await verifyEmailDelivery();
if (result.ok) {
  console.log(`Email delivery OK (${result.provider})`);
  if (result.sender) console.log('Sender:', result.sender);
  if (result.from) console.log('From:', result.from);
  process.exit(0);
}

console.error('Email delivery NOT ready:');
console.error(result.error);
if (result.raw) console.error('Detail:', result.raw);
process.exit(1);
