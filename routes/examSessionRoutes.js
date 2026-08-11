const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const examSessionController = require('../controllers/examSessionController');

router.use(auth);
router.use(tenantContext);

router.get(
  '/',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'),
  examSessionController.getExamSessions
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'),
  examSessionController.createExamSession
);

router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR', 'CANDIDATE'),
  examSessionController.getExamSessionById
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER'),
  examSessionController.updateExamSession
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN'),
  examSessionController.deleteExamSession
);

module.exports = router;