/**
 * Knowledge Bank calculators — NL-BE-KB-CALC-001
 * Snapshot replace only. Never merge items by id.
 */
import { query } from './index.js';
import { ensureCalculatorSchema } from './ensureCalculatorSchema.js';
import {
  CALCULATOR_IDS,
  CALCULATOR_GROUP_KINDS,
  requiredItemKeys,
  requiredFieldKeys,
} from './calculatorSeed.js';

export class CalculatorError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function mapResource(row, { publicBaseUrl = null } = {}) {
  const raw = row.resource && typeof row.resource === 'object' ? row.resource : null;
  const hasFile = Boolean(row.resource_content_base64);
  if (!raw && !hasFile) return null;
  const heading = raw?.heading || 'For further information';
  const fileName = raw?.fileName || row.resource_file_name || null;
  let url = typeof raw?.url === 'string' ? raw.url : '';
  if (hasFile) {
    url = publicBaseUrl
      ? `${publicBaseUrl}/api/v2/knowledge-bank/calculators/${row.id}/resource.pdf`
      : `/api/v2/knowledge-bank/calculators/${row.id}/resource.pdf`;
  }
  return { heading, fileName, url: url || '' };
}

export function mapCalculatorRow(row, { publicBaseUrl = null } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || null,
    status: row.status,
    hint: row.hint || null,
    note: row.note || null,
    resource: mapResource(row, { publicBaseUrl }),
    groups: Array.isArray(row.groups) ? row.groups : [],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by != null ? String(row.updated_by) : null,
  };
}

function validateGroup(calcId, group, { allowEmptyItems = true } = {}) {
  if (!group || typeof group !== 'object') {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: 'Each group must be an object',
      fields: { groups: 'Snapshot rejected' },
    });
  }
  const seeded = CALCULATOR_GROUP_KINDS[calcId];
  if (!seeded) {
    throw new CalculatorError(`Unknown calculator id: ${calcId}`, 404);
  }
  const groupId = String(group.id || '');
  const expectedKind = seeded[groupId];
  if (!expectedKind) {
    throw new CalculatorError('Validation failed', 404, {
      error: 'Validation failed',
      message: `Unknown groupId "${groupId}" for calculator "${calcId}"`,
      fields: { groupId: 'Unknown' },
    });
  }
  const kind = String(group.kind || '');
  if (kind !== expectedKind) {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: `groups[].kind must be "${expectedKind}" for group "${groupId}" (got "${kind}")`,
      fields: { kind: 'Invalid kind' },
    });
  }

  const fields = group.fields && typeof group.fields === 'object' && !Array.isArray(group.fields)
    ? group.fields
    : {};
  const requiredFields = requiredFieldKeys(kind) || [];
  for (const key of requiredFields) {
    if (!isNumber(fields[key]) && fields[key] !== 0) {
      throw new CalculatorError('Validation failed', 422, {
        error: 'Validation failed',
        message: `fields.${key} must be a number for kind ${kind}`,
        fields: { fields: 'Snapshot rejected' },
      });
    }
  }

  const itemKeys = requiredItemKeys(kind);
  let items = Array.isArray(group.items) ? group.items : [];
  if (itemKeys === null) {
    // kinds with no list — ignore items or force empty
    items = [];
  } else {
    if (!allowEmptyItems && items.length === 0) {
      // empty allowed per spec
    }
    items.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        throw new CalculatorError('Validation failed', 422, {
          error: 'Validation failed',
          message: `items[${idx}] must be an object`,
          fields: { items: 'Snapshot rejected' },
        });
      }
      for (const key of itemKeys) {
        if (item[key] === undefined || item[key] === null) {
          throw new CalculatorError('Validation failed', 422, {
            error: 'Validation failed',
            message: `items[${idx}].${key} is required`,
            fields: { items: 'Snapshot rejected' },
          });
        }
      }
      // numeric checks for common band/slab keys
      for (const numKey of ['from', 'up', 'filer', 'non', 'fee', 'ratePercent', 'base', 'govt', 'years', 'months', 'days']) {
        if (item[numKey] !== undefined && item[numKey] !== null && !isNumber(Number(item[numKey]))) {
          throw new CalculatorError('Validation failed', 422, {
            error: 'Validation failed',
            message: `items[${idx}].${numKey} must be a number`,
            fields: { items: 'Snapshot rejected' },
          });
        }
      }
    });
  }

  const out = {
    id: groupId,
    title: group.title != null ? String(group.title) : groupId,
    kind,
    hint: group.hint != null ? group.hint : null,
    fields: { ...fields },
    items: items.map((it) => ({ ...it })),
  };
  if (group.itemFeeKey) out.itemFeeKey = String(group.itemFeeKey);
  return out;
}

function validateScheduleBody(calcId, body = {}) {
  if (!CALCULATOR_IDS.includes(calcId)) {
    throw new CalculatorError(`Unknown calculator id: ${calcId}`, 404);
  }
  if (body.id != null && String(body.id) !== calcId) {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: 'body.id must match URL :id',
      fields: { id: 'Mismatch' },
    });
  }

  const status = body.status != null ? String(body.status) : 'live';
  if (!['live', 'draft'].includes(status)) {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: 'status must be live or draft',
      fields: { status: 'Invalid' },
    });
  }

  const title = body.title != null ? String(body.title).trim() : '';
  if (status === 'live' && !title) {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: 'title is required when status is live',
      fields: { title: 'Required' },
    });
  }

  if (!Array.isArray(body.groups)) {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: 'groups must be an array (full snapshot)',
      fields: { groups: 'Snapshot rejected' },
    });
  }

  // Must include exactly the seeded groups (order = display order from body)
  const seededIds = Object.keys(CALCULATOR_GROUP_KINDS[calcId]);
  const seen = new Set();
  const groups = body.groups.map((g) => {
    const validated = validateGroup(calcId, g);
    if (seen.has(validated.id)) {
      throw new CalculatorError('Validation failed', 422, {
        error: 'Validation failed',
        message: `Duplicate group id "${validated.id}"`,
        fields: { groups: 'Snapshot rejected' },
      });
    }
    seen.add(validated.id);
    return validated;
  });

  for (const sid of seededIds) {
    if (!seen.has(sid)) {
      throw new CalculatorError('Validation failed', 422, {
        error: 'Validation failed',
        message: `Missing seeded group "${sid}" in snapshot`,
        fields: { groups: 'Snapshot rejected' },
      });
    }
  }
  for (const id of seen) {
    if (!seededIds.includes(id)) {
      throw new CalculatorError('Validation failed', 404, {
        error: 'Validation failed',
        message: `Unknown groupId "${id}"`,
        fields: { groupId: 'Unknown' },
      });
    }
  }

  let resource = null;
  if (body.resource !== undefined) {
    if (body.resource === null) {
      resource = null;
    } else if (typeof body.resource === 'object') {
      resource = {
        heading: body.resource.heading != null ? String(body.resource.heading) : 'For further information',
        fileName: body.resource.fileName != null ? String(body.resource.fileName) : null,
        url: typeof body.resource.url === 'string' ? body.resource.url : '',
      };
    }
  }

  return {
    title: title || calcId,
    subtitle: body.subtitle != null ? String(body.subtitle) : null,
    status,
    hint: body.hint != null ? body.hint : null,
    note: body.note != null ? body.note : null,
    resource,
    groups,
  };
}

export async function listCalculators({ publicOnly = false, publicBaseUrl = null } = {}) {
  await ensureCalculatorSchema();
  const result = await query(
    `SELECT * FROM knowledge_calculators
     ${publicOnly ? `WHERE status = 'live'` : ''}
     ORDER BY array_position($1::text[], id)`,
    [CALCULATOR_IDS]
  );
  const schedules = result.rows.map((r) => mapCalculatorRow(r, { publicBaseUrl }));

  let counts;
  if (publicOnly) {
    counts = { live: schedules.length, draft: 0 };
  } else {
    const summary = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'live')::int AS live,
         COUNT(*) FILTER (WHERE status = 'draft')::int AS draft
       FROM knowledge_calculators`
    );
    counts = {
      live: summary.rows[0]?.live || 0,
      draft: summary.rows[0]?.draft || 0,
    };
  }
  return { success: true, data: { schedules, counts } };
}

export async function getCalculator(id, { publicOnly = false, publicBaseUrl = null } = {}) {
  await ensureCalculatorSchema();
  if (!CALCULATOR_IDS.includes(String(id))) {
    throw new CalculatorError(`Unknown calculator id: ${id}`, 404);
  }
  const result = await query(`SELECT * FROM knowledge_calculators WHERE id = $1`, [String(id)]);
  const row = result.rows[0];
  if (!row) throw new CalculatorError('Calculator not found', 404);
  if (publicOnly && row.status !== 'live') {
    throw new CalculatorError('Calculator not found', 404);
  }
  return { success: true, data: mapCalculatorRow(row, { publicBaseUrl }) };
}

export async function replaceCalculator(id, body = {}, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureCalculatorSchema();
  const calcId = String(id);
  if (!CALCULATOR_IDS.includes(calcId)) {
    throw new CalculatorError(`Unknown calculator id: ${calcId}`, 404);
  }
  const existing = await query(`SELECT id, resource, resource_content_base64, resource_file_name, resource_mime_type
    FROM knowledge_calculators WHERE id = $1`, [calcId]);
  if (!existing.rows[0]) throw new CalculatorError('Calculator not found', 404);

  const next = validateScheduleBody(calcId, body);

  // Keep stored PDF unless resource explicitly cleared; chrome may update heading/fileName
  let resourceJson = next.resource;
  if (body.resource === undefined) {
    resourceJson = existing.rows[0].resource;
  } else if (next.resource && existing.rows[0].resource_content_base64) {
    // preserve file; clear url so mapResource rebuilds relative path
    resourceJson = {
      heading: next.resource.heading,
      fileName: next.resource.fileName || existing.rows[0].resource_file_name,
      url: '',
    };
  }

  const updated = await query(
    `UPDATE knowledge_calculators SET
       title = $2, subtitle = $3, status = $4, hint = $5, note = $6,
       resource = $7::jsonb, groups = $8::jsonb,
       updated_at = CURRENT_TIMESTAMP, updated_by = $9
     WHERE id = $1
     RETURNING *`,
    [
      calcId,
      next.title,
      next.subtitle,
      next.status,
      next.hint,
      next.note,
      JSON.stringify(resourceJson),
      JSON.stringify(next.groups),
      adminUserId || null,
    ]
  );

  return { success: true, data: mapCalculatorRow(updated.rows[0], { publicBaseUrl }) };
}

export async function replaceCalculatorGroup(id, groupId, body = {}, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureCalculatorSchema();
  const calcId = String(id);
  if (!CALCULATOR_IDS.includes(calcId)) {
    throw new CalculatorError(`Unknown calculator id: ${calcId}`, 404);
  }
  const result = await query(`SELECT * FROM knowledge_calculators WHERE id = $1`, [calcId]);
  const row = result.rows[0];
  if (!row) throw new CalculatorError('Calculator not found', 404);

  const seeded = CALCULATOR_GROUP_KINDS[calcId];
  if (!seeded[String(groupId)]) {
    throw new CalculatorError(`Unknown groupId: ${groupId}`, 404);
  }

  const validated = validateGroup(calcId, {
    ...body,
    id: String(groupId),
    kind: body.kind || seeded[String(groupId)],
  });

  const groups = Array.isArray(row.groups) ? [...row.groups] : [];
  const idx = groups.findIndex((g) => g.id === String(groupId));
  if (idx < 0) {
    // insert in seeded order
    groups.push(validated);
  } else {
    groups[idx] = validated;
  }

  const updated = await query(
    `UPDATE knowledge_calculators SET
       groups = $2::jsonb, updated_at = CURRENT_TIMESTAMP, updated_by = $3
     WHERE id = $1
     RETURNING *`,
    [calcId, JSON.stringify(groups), adminUserId || null]
  );

  return { success: true, data: mapCalculatorRow(updated.rows[0], { publicBaseUrl }) };
}

export async function patchCalculator(id, body = {}, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureCalculatorSchema();
  const calcId = String(id);
  if (!CALCULATOR_IDS.includes(calcId)) {
    throw new CalculatorError(`Unknown calculator id: ${calcId}`, 404);
  }
  const result = await query(`SELECT * FROM knowledge_calculators WHERE id = $1`, [calcId]);
  const row = result.rows[0];
  if (!row) throw new CalculatorError('Calculator not found', 404);

  // Chrome only — ignore arrays
  const next = {
    title: body.title !== undefined ? String(body.title).trim() : row.title,
    subtitle: body.subtitle !== undefined ? body.subtitle : row.subtitle,
    status: body.status !== undefined ? String(body.status) : row.status,
    hint: body.hint !== undefined ? body.hint : row.hint,
    note: body.note !== undefined ? body.note : row.note,
  };

  if (!['live', 'draft'].includes(next.status)) {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: 'status must be live or draft',
      fields: { status: 'Invalid' },
    });
  }
  if (next.status === 'live' && !next.title) {
    throw new CalculatorError('Validation failed', 422, {
      error: 'Validation failed',
      message: 'title is required when status is live',
      fields: { title: 'Required' },
    });
  }

  const updated = await query(
    `UPDATE knowledge_calculators SET
       title = $2, subtitle = $3, status = $4, hint = $5, note = $6,
       updated_at = CURRENT_TIMESTAMP, updated_by = $7
     WHERE id = $1
     RETURNING *`,
    [calcId, next.title, next.subtitle, next.status, next.hint, next.note, adminUserId || null]
  );

  return { success: true, data: mapCalculatorRow(updated.rows[0], { publicBaseUrl }) };
}

export async function uploadCalculatorResource(id, { file, heading, fileName } = {}, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureCalculatorSchema();
  const calcId = String(id);
  if (!['tax', 'business'].includes(calcId)) {
    throw new CalculatorError('Resource PDF is only supported for tax and business calculators', 422, {
      error: 'Validation failed',
      message: 'Resource PDF is only supported for tax and business calculators',
      fields: { id: 'Unsupported' },
    });
  }
  if (!file?.buffer) {
    throw new CalculatorError('file is required', 400);
  }
  const mime = file.mimetype || '';
  if (mime !== 'application/pdf' && !String(file.originalname || '').toLowerCase().endsWith('.pdf')) {
    throw new CalculatorError('resource file is not application/pdf', 415);
  }
  if (file.buffer.length > 10 * 1024 * 1024) {
    throw new CalculatorError('PDF too large — cap 10 MB', 413);
  }

  const result = await query(`SELECT * FROM knowledge_calculators WHERE id = $1`, [calcId]);
  if (!result.rows[0]) throw new CalculatorError('Calculator not found', 404);

  const displayName = fileName || file.originalname || 'guide.pdf';
  const resource = {
    heading: heading || 'For further information',
    fileName: displayName,
    url: '',
  };

  const updated = await query(
    `UPDATE knowledge_calculators SET
       resource = $2::jsonb,
       resource_file_name = $3,
       resource_mime_type = 'application/pdf',
       resource_content_base64 = $4,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = $5
     WHERE id = $1
     RETURNING *`,
    [
      calcId,
      JSON.stringify(resource),
      displayName,
      file.buffer.toString('base64'),
      adminUserId || null,
    ]
  );

  return { success: true, data: mapCalculatorRow(updated.rows[0], { publicBaseUrl }) };
}

export async function deleteCalculatorResource(id, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureCalculatorSchema();
  const calcId = String(id);
  const result = await query(`SELECT * FROM knowledge_calculators WHERE id = $1`, [calcId]);
  if (!result.rows[0]) throw new CalculatorError('Calculator not found', 404);

  const prev = result.rows[0].resource && typeof result.rows[0].resource === 'object'
    ? result.rows[0].resource
    : {};
  const resource = {
    heading: prev.heading || 'For further information',
    fileName: prev.fileName || 'WithholdingTaxRatesCard2027.pdf',
    url: '',
  };

  const updated = await query(
    `UPDATE knowledge_calculators SET
       resource = $2::jsonb,
       resource_file_name = NULL,
       resource_mime_type = NULL,
       resource_content_base64 = NULL,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = $3
     WHERE id = $1
     RETURNING *`,
    [calcId, JSON.stringify(resource), adminUserId || null]
  );

  return { success: true, data: mapCalculatorRow(updated.rows[0], { publicBaseUrl }) };
}

export async function getCalculatorResourceFile(id) {
  await ensureCalculatorSchema();
  const result = await query(
    `SELECT id, resource_file_name, resource_mime_type, resource_content_base64
     FROM knowledge_calculators WHERE id = $1`,
    [String(id)]
  );
  const row = result.rows[0];
  if (!row?.resource_content_base64) {
    throw new CalculatorError('Resource not found', 404);
  }
  return {
    fileName: row.resource_file_name || 'guide.pdf',
    mimeType: row.resource_mime_type || 'application/pdf',
    buffer: Buffer.from(row.resource_content_base64, 'base64'),
  };
}
