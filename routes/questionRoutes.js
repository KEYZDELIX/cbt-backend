const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

// Handle both default and destructured exports for upload
const cloudinaryConfig = require('../config/cloudinary');
const upload = cloudinaryConfig.upload || cloudinaryConfig;

const questionController = require('../controllers/questionController');

// All question routes require authentication and tenant scoping
router.use(auth);
router.use(tenantContext);

// Fallback helper to prevent boot crashes if a controller is undefined
const fallback = (name) => (req, res) => res.status(501).json({ error: `${name} function not implemented` });

// 1. Create single question (with optional image upload)
router.post(
  '/',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR'),
  upload && typeof upload.single === 'function' ? upload.single('questionImage') : (req, res, next) => next(),
  questionController.createQuestion || fallback('createQuestion')
);

// 2. List/search/filter questions in batches
router.get(
  '/',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR', 'ORG_ADMIN'),
  questionController.getQuestions || fallback('getQuestions')
);

// 3. Get single question details
router.get(
  '/:id',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR', 'ORG_ADMIN'),
  questionController.getQuestionById || fallback('getQuestionById')
);

// 4. Update question
router.put(
  '/:id',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'INSTRUCTOR'),
  upload && typeof upload.single === 'function' ? upload.single('questionImage') : (req, res, next) => next(),
  questionController.updateQuestion || fallback('updateQuestion')
);

// 5. Delete question
router.delete(
  '/:id',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER', 'ORG_ADMIN'),
  questionController.deleteQuestion || fallback('deleteQuestion')
);

// 6. Bulk CSV/JSON question import
router.post(
  '/bulk-upload',
  authorize('QUESTION_AUTHOR', 'EXAM_OFFICER'),
  upload && typeof upload.single === 'function' ? upload.single('file') : (req, res, next) => next(),
  questionController.bulkImportQuestions || fallback('bulkImportQuestions')
);

module.exports = router;