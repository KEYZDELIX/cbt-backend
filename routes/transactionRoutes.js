const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const transactionController = require('../controllers/transactionController');

router.use(auth);
router.use(tenantContext);

// Batch generate registration / exam access PINs
router.post(
  '/generate-pins',
  authorize('ORG_ADMIN', 'ORG_FINANCE'),
  transactionController.generateAccessPins
);

// List/filter generated PINs and usage status
router.get(
  '/pins',
  authorize('ORG_ADMIN', 'ORG_FINANCE'),
  transactionController.getAccessPins
);

// View transaction ledger and payment logs
router.get(
  '/',
  authorize('ORG_ADMIN', 'ORG_FINANCE'),
  transactionController.getTransactions
);

// Verify payment gateway transaction (Paystack / Flutterwave)
router.post(
  '/verify-payment',
  authorize('ORG_ADMIN', 'ORG_FINANCE', 'CANDIDATE'),
  transactionController.verifyPayment
);

module.exports = router;