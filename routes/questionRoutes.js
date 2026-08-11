const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');
const { upload } = require('../config/cloudinary');

const questionController = require('../controllers/questionController');

// All question routes require authentication and tenant scoping
router.use(auth);
router.use(tenantContext);

// Create single question (with optional image upload)
router.post(
  '/',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR'),
  upload.single('questionImage'),
  questionController.createQuestion
);

// List/search/filter questions in batches
router.get(
  '/',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR', 'ORG_ADMIN'),
  questionController.getQuestions
);

// Get single question details
router.get(
  '/:id',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR', 'ORG_ADMIN'),
  questionController.getQuestionById
);

// Update question
router.put(
  '/:id',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR'),
  upload.single('questionImage'),
  questionController.updateQuestion
);

// Delete question
router.delete(
  '/:id',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'ORG_ADMIN'),
  questionController.deleteQuestion
);

// Bulk CSV/JSON question import
router.post(
  '/bulk-upload',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER'),
  upload.single('file'),
  questionController.bulkImportQuestions
);

module.exports = router;