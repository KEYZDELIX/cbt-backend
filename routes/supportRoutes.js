const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const supportController = require('../controllers/supportController');

router.use(auth);
router.use(tenantContext);

// Search candidates by email, regNo, phone, or name
router.get(
  '/candidate-lookup',
  authorize('CUSTOMER_SERVICE', 'ORG_ADMIN', 'EXAM_OFFICER'),
  supportController.lookupCandidate
);

// Reset candidate password from helpdesk
router.put(
  '/reset-candidate-password',
  authorize('CUSTOMER_SERVICE', 'ORG_ADMIN'),
  supportController.resetCandidatePassword
);

// Unlock a locked or frozen exam session
router.post(
  '/unlock-session',
  authorize('CUSTOMER_SERVICE', 'PROCTOR', 'EXAM_OFFICER'),
  supportController.unlockCandidateSession
);

// Ticket management
router.get(
  '/tickets',
  authorize('CUSTOMER_SERVICE', 'ORG_ADMIN', 'CANDIDATE'),
  supportController.getSupportTickets
);

router.post(
  '/tickets',
  authorize('CUSTOMER_SERVICE', 'CANDIDATE', 'ORG_ADMIN'),
  supportController.createSupportTicket
);

module.exports = router;