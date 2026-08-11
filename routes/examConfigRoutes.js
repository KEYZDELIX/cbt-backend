const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const examConfigController = require('../controllers/examConfigController');

router.use(auth);
router.use(tenantContext);

// Get all exam blueprints
router.get(
  '/',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'),
  examConfigController.getExamConfigs
);

// Create new exam blueprint
router.post(
  '/',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'),
  examConfigController.createExamConfig
);

// Get single blueprint details
router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'),
  examConfigController.getExamConfigById
);

// Update blueprint
router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER'),
  examConfigController.updateExamConfig
);

// Delete blueprint
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN'),
  examConfigController.deleteExamConfig
);

module.exports = router;