import {
  saveVerificationUpload,
  getVerificationUpload,
  isAllowedDocType,
  toDocumentRef,
  parseDocumentRef,
} from '../db/verificationDocumentRepository.js';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

function resolveMimeType(file) {
  const reported = (file.mimetype || '').toLowerCase().split(';')[0].trim();
  if (reported && ALLOWED_MIME.has(reported)) {
    return reported === 'image/jpg' || reported === 'image/pjpeg' ? 'image/jpeg' : reported;
  }

  const name = String(file.originalname || file.filename || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  if (EXT_TO_MIME[ext]) {
    return EXT_TO_MIME[ext];
  }

  return reported || 'application/octet-stream';
}

function authPublicBase() {
  return (process.env.AUTH_PUBLIC_URL || 'https://nexus-lexis-backend-45v4.vercel.app/api/auth').replace(/\/$/, '');
}

export function buildDocumentViewUrl(documentId) {
  return `${authPublicBase()}/documents/${documentId}`;
}

export async function uploadVerificationDocument(userId, file, docType) {
  if (!file?.buffer?.length) {
    throw new Error('File is required');
  }
  if (!docType || !isAllowedDocType(docType)) {
    throw new Error('Invalid docType. Use profilePhoto, barCertificate, cnicFront, cnicBack, photo, or caCertificate');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('File must be 3 MB or smaller');
  }
  const mimeType = resolveMimeType(file);
  const allowedOutput = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
  if (!allowedOutput.has(mimeType)) {
    throw new Error('File type not allowed. Use JPG, PNG, WEBP, GIF, or PDF');
  }

  const saved = await saveVerificationUpload({
    userId,
    docType,
    fileName: file.originalname || file.filename || `${docType}.bin`,
    mimeType,
    buffer: file.buffer,
  });

  return {
    documentId: saved.id,
    docType: saved.docType,
    fileName: saved.fileName,
    mimeType: saved.mimeType,
    documentRef: toDocumentRef(saved.id),
    viewUrl: buildDocumentViewUrl(saved.id),
  };
}

export async function getDocumentForViewer(documentId, viewer) {
  const row = await getVerificationUpload(documentId);
  if (!row) {
    throw new Error('Document not found');
  }

  const isAdmin = viewer.role === 'admin' || viewer.activeRole === 'admin';
  const viewerId = Number(viewer.userId || viewer.sub);
  if (!isAdmin && viewerId !== Number(row.user_id)) {
    throw new Error('Access denied');
  }

  return {
    id: row.id,
    docType: row.doc_type,
    fileName: row.file_name,
    mimeType: row.mime_type,
    buffer: Buffer.from(row.content_base64, 'base64'),
  };
}

export function normalizeDocumentInput(value) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;

  const docId = parseDocumentRef(str);
  if (docId) return toDocumentRef(docId);

  const urlMatch = str.match(/\/documents\/([0-9a-f-]{36})/i);
  if (urlMatch) return toDocumentRef(urlMatch[1]);

  if (str.startsWith('data:') || str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }

  throw new Error(`Invalid document reference: ${str.slice(0, 60)}`);
}

export function resolveDocumentForAdmin(storedValue, docType) {
  if (!storedValue) {
    return { docType, documentId: null, viewUrl: null, fileName: null, mimeType: null, uploaded: false };
  }

  const docId = parseDocumentRef(storedValue);
  if (docId) {
    return {
      docType,
      documentId: docId,
      viewUrl: buildDocumentViewUrl(docId),
      fileName: null,
      mimeType: null,
      uploaded: true,
    };
  }

  if (storedValue.startsWith('data:') || storedValue.startsWith('http')) {
    return {
      docType,
      documentId: null,
      viewUrl: storedValue,
      fileName: null,
      mimeType: storedValue.startsWith('data:') ? storedValue.slice(5).split(';')[0] : null,
      uploaded: true,
    };
  }

  return { docType, documentId: null, viewUrl: null, fileName: null, mimeType: null, uploaded: false };
}
