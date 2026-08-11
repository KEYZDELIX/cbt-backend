const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const proctorController = require('../controllers/proctorController');

// All proctoring endpoints require authentication
router.use(auth);

// 1. Candidate route: Log a violation event (e.g., tab switch, exit fullscreen)
router.post('/event', proctorController.logProctorEvent);

// 2. Admin / Proctor route: Fetch logs for a specific exam session
router.get(
  '/logs/:sessionId',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'PROCTOR'),
  proctorController.getProctorLogs
);

// 3. Admin / Proctor route: Force terminate a candidate session
router.patch(
  '/terminate/:sessionId',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'PROCTOR'),
  proctorController.terminateSession
);

module.exports = router;