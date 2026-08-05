import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { getDocumentForViewer } from '../services/verificationDocumentService.js';
import { asyncHandler } from '../../shared/lib/asyncHandler.js';

const router = Router();

async function serveDocument(req, res) {
  const doc = await getDocumentForViewer(req.params.documentId, req.user);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${(doc.fileName || doc.docType).replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(doc.buffer);
}

router.get('/:documentId', authMiddleware, asyncHandler(serveDocument));

export default router;

export const verificationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
});
