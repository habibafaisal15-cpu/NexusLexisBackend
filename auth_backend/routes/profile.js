import { Router } from 'express';

import { authMiddleware } from '../middleware/auth.js';

import { findUserByEmail } from '../services/authService.js';

import {

  getProfileForUser,

  saveClientProfile,

  signupAsClient,

  applyLawyerProfile,

  applyCAProfile,

  switchActiveRole,

  issueTokenForProfile

} from '../services/profileService.js';

import * as repo from '../db/profileRepository.js';
import { asyncHandler } from '../../shared/lib/asyncHandler.js';

const router = Router();

function getUserId(req) {

  return Number(req.user.userId || req.user.sub);

}



router.get('/', authMiddleware, asyncHandler(async (req, res) => {

  const userId = getUserId(req);

  const profile = await getProfileForUser(userId, req.user.email);

  res.json({ profile });

}));



router.put('/client', authMiddleware, asyncHandler(async (req, res) => {

  const userId = getUserId(req);

  const profile = await saveClientProfile(userId, req.user.email, req.body);

  const authUser = await findUserByEmail(req.user.email);

  const bundle = await repo.getFullProfileBundle(userId);

  const token = issueTokenForProfile(authUser, bundle);

  res.json({ profile, token });

}));



router.post('/client/signup', authMiddleware, asyncHandler(async (req, res) => {

  const userId = getUserId(req);

  const profile = await signupAsClient(userId, req.user.email);

  const authUser = await findUserByEmail(req.user.email);

  const bundle = await repo.getFullProfileBundle(userId);

  const token = issueTokenForProfile(authUser, bundle);

  res.status(201).json({ profile, token });

}));



router.post('/lawyer/apply', authMiddleware, asyncHandler(async (req, res) => {

  const userId = getUserId(req);

  const profile = await applyLawyerProfile(userId, req.user.email, req.body);

  const authUser = await findUserByEmail(req.user.email);

  const bundle = await repo.getFullProfileBundle(userId);

  const token = issueTokenForProfile(authUser, bundle);

  res.json({ profile, token });

}));



router.post('/ca/apply', authMiddleware, asyncHandler(async (req, res) => {

  const userId = getUserId(req);

  const profile = await applyCAProfile(userId, req.user.email, req.body);

  const authUser = await findUserByEmail(req.user.email);

  const bundle = await repo.getFullProfileBundle(userId);

  const token = issueTokenForProfile(authUser, bundle);

  res.json({ profile, token });

}));



router.post('/switch-role', authMiddleware, asyncHandler(async (req, res) => {

  const userId = getUserId(req);

  const { role } = req.body;

  const profile = await switchActiveRole(userId, req.user.email, role);

  const authUser = await findUserByEmail(req.user.email);

  const bundle = await repo.getFullProfileBundle(userId);

  const token = issueTokenForProfile(authUser, bundle);

  res.json({ profile, token });

}));



router.use((err, _req, res, _next) => {

  if (err.code === 'PENDING_VERIFICATION') {

    return res.status(409).json({

      error: err.message,

      code: err.code,

      pendingRole: err.pendingRole

    });

  }

  res.status(400).json({ error: err.message || 'Profile request failed' });

});



export default router;


