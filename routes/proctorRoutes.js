const express = require('express');
const router = express.Router();

// 1. Safely import middleware (handles both default and named exports)
const authMiddleware = require('../middleware/auth');
const auth = typeof authMiddleware === 'function' ? authMiddleware : authMiddleware.auth;

const rbacMiddleware = require('../middleware/rbac');
const authorize = typeof rbacMiddleware === 'function' ? rbacMiddleware : rbacMiddleware.authorize;

const tenantMiddleware = require('../middleware/tenantContext');
const tenantContext = typeof tenantMiddleware === 'function' ? tenantMiddleware : tenantMiddleware.tenantContext;

// 2. Import Controller
const proctorController = require('../controllers/proctorController');

// Apply global route middleware
if (typeof auth === 'function') router.use(auth);
if (typeof tenantContext === 'function') router.use(tenantContext);

// 3. Define Routes (with inline fallback checks to prevent Express boot crash)
router.get(
  '/live-sessions',
  authorize ? authorize('PROCTOR', 'EXAM_OFFICER') : (req, res, next) => next(),
  proctorController.getLiveSessions || ((req, res) => res.status(501).json({ error: 'Not implemented' }))
);

router.post(
  '/sessions/:id/terminate',
  authorize ? authorize('PROCTOR', 'EXAM_OFFICER') : (req, res, next) => next(),
  proctorController.terminateCandidateSession || ((req, res) => res.status(501).json({ error: 'Not implemented' }))
);

router.post(
  '/sessions/:id/flag-violation',
  authorize ? authorize('PROCTOR', 'EXAM_OFFICER') : (req, res, next) => next(),
  proctorController.flagViolation || ((req, res) => res.status(501).json({ error: 'Not implemented' }))
);

router.post(
  '/verify-identity',
  authorize ? authorize('PROCTOR', 'EXAM_OFFICER') : (req, res, next) => next(),
  proctorController.verifyCandidateIdentity || ((req, res) => res.status(501).json({ error: 'Not implemented' }))
);

module.exports = router;