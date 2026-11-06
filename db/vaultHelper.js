import { query } from './index.js';

const DOC_LABELS = {
  barCertificate: 'Bar license',
  bar_license: 'Bar license',
  cnicFront: 'CNIC front',
  cnicBack: 'CNIC back',
  cnic: 'CNIC attested',
  caCertificate: 'ICAP certificate',
  icap: 'ICAP certificate',
  photo: 'Photo',
  profilePhoto: 'Profile photo',
  fbr_ntn: 'FBR / NTN',
};

const DOC_TYPE_ALIAS = {
  barCertificate: 'bar_license',
  caCertificate: 'icap',
  cnicFront: 'cnic',
  cnicBack: 'cnic',
};

export function vaultItem(row) {
  const docType = DOC_TYPE_ALIAS[row.doc_type] || row.doc_type;
  const authBase = (process.env.AUTH_PUBLIC_URL || 'https://nexus-lexis-backend-45v4.vercel.app/api/auth').replace(/\/$/, '');
  return {
    id: String(row.id),
    docType,
    label: row.label || DOC_LABELS[row.doc_type] || row.doc_type,
    fileName: row.file_name || `${docType}.bin`,
    fileUrl: `${authBase}/documents/${row.id}`,
    state: row.state || 'pending',
    role: row.role || null,
  };
}

export async function listVaultForUser(userId, roleHint = null) {
  const result = await query(
    `SELECT id, user_id, doc_type, file_name, mime_type, state, role, label, created_at
     FROM verification_uploads
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  ).catch(() => ({ rows: [] }));

  let rows = result.rows || [];
  if (roleHint === 'lawyer') {
    rows = rows.filter((r) => !r.role || r.role === 'lawyer' || /bar|cnic|profile/i.test(r.doc_type));
  } else if (roleHint === 'ca') {
    rows = rows.filter((r) => !r.role || r.role === 'ca' || /icap|ca|cnic|fbr|photo/i.test(r.doc_type));
  }
  return rows.map(vaultItem);
}

export function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

export function joinList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(', ');
  return value == null ? null : String(value);
}
