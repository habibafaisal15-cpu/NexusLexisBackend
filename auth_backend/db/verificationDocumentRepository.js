import crypto from 'crypto';
import { query } from './index.js';

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS verification_uploads (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    content_base64 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_verification_uploads_user ON verification_uploads (user_id);
`;

let tableReady = false;

export async function ensureVerificationUploadsTable() {
  if (tableReady) return;
  await query(TABLE_SQL);
  tableReady = true;
}

export const LAWYER_DOC_TYPES = new Set([
  'profilePhoto',
  'barCertificate',
  'cnicFront',
  'cnicBack',
]);

export const CA_DOC_TYPES = new Set([
  'photo',
  'caCertificate',
  'cnicFront',
  'cnicBack',
]);

export function isAllowedDocType(docType, roleHint = 'any') {
  if (LAWYER_DOC_TYPES.has(docType)) return true;
  if (CA_DOC_TYPES.has(docType)) return true;
  if (roleHint === 'lawyer') return LAWYER_DOC_TYPES.has(docType);
  if (roleHint === 'ca') return CA_DOC_TYPES.has(docType);
  return false;
}

export async function saveVerificationUpload({
  userId,
  docType,
  fileName,
  mimeType,
  buffer,
}) {
  await ensureVerificationUploadsTable();
  const id = crypto.randomUUID();
  const contentBase64 = buffer.toString('base64');

  await query(
    `INSERT INTO verification_uploads (id, user_id, doc_type, file_name, mime_type, content_base64)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, docType, fileName || null, mimeType, contentBase64]
  );

  return { id, docType, fileName: fileName || null, mimeType };
}

export async function getVerificationUpload(documentId) {
  await ensureVerificationUploadsTable();
  const result = await query(
    `SELECT id, user_id, doc_type, file_name, mime_type, content_base64, created_at
     FROM verification_uploads WHERE id = $1`,
    [documentId]
  );
  return result.rows[0] || null;
}

export function toDocumentRef(documentId) {
  return `doc:${documentId}`;
}

export function parseDocumentRef(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('doc:')) return trimmed.slice(4);
  if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
  return null;
}
