const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const proctorController = require('../controllers/proctorController');

router.use(auth);
router.use(tenantContext);

// Get real-time active exam sessions in center / online hall
router.get(
  '/live-sessions',
  authorize('PROCTOR', 'EXAM_OFFICER'),
  proctorController.getLiveSessions
);

// Manually terminate a candidate session for malpractice
router.post(
  '/sessions/:id/terminate',
  authorize('PROCTOR', 'EXAM_OFFICER'),
  proctorController.terminateCandidateSession
);

// Log a proctor violation warning (tab switch, noise flag, multi-face detect)
router.post(
  '/sessions/:id/flag-violation',
  authorize('PROCTOR', 'EXAM_OFFICER'),
  proctorController.flagViolation
);

// Verify candidate passport / biometric match before test unlock
router.post(
  '/verify-identity',
  authorize('PROCTOR', 'EXAM_OFFICER'),
  proctorController.verifyCandidateIdentity
);

module.exports = router;