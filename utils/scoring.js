/**
 * Advanced CBT Scoring, Grading, & Normalization Engine
 * Supports: JAMB (400-mark scaled curve), WAEC/NECO (A1-F9), Cambridge, and Multi-Tenant Pools
 */

// ==========================================
// 1. STATISTICAL HELPERS
// ==========================================
const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const getSD = (arr, mean) => {
  if (arr.length <= 1) return 0;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
};

// ==========================================
// 2. OFFICIAL GRADE MAPPER UTILITIES
// ==========================================
const getWAECGrade = (percentage) => {
  if (percentage >= 80) return 'A1';
  if (percentage >= 75) return 'B2';
  if (percentage >= 70) return 'B3';
  if (percentage >= 65) return 'C4';
  if (percentage >= 60) return 'C5';
  if (percentage >= 50) return 'C6';
  if (percentage >= 45) return 'D7';
  if (percentage >= 40) return 'E8';
  return 'F9';
};

const getCambridgeGrade = (percentage) => {
  if (percentage >= 90) return 'A*';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  if (percentage >= 40) return 'E';
  return 'F';
};

// ==========================================
// 3. SINGLE-SESSION AUTO-MARKING ENGINE
// ==========================================
/**
 * Evaluates candidate responses, generates subject metrics, raw scores, and topic breakdowns.
 */
exports.evaluateSubmission = (candidateResponses, examConfig, questionBankMap) => {
  const subjectMap = {};

  // Group and grade responses by subject and topic
  candidateResponses.forEach((response) => {
    const question = questionBankMap[response.questionId?.toString()];
    if (!question) return;

    const subject = question.subject || 'General';
    const topic = question.topic || 'General Concepts';

    if (!subjectMap[subject]) {
      subjectMap[subject] = {
        subjectName: subject,
        totalQuestions: 0,
        correctCount: 0,
        attemptedCount: 0,
        wrongCount: 0,
        unattemptedCount: 0,
        timeSpentSeconds: 0,
        topics: {}
      };
    }

    const subObj = subjectMap[subject];
    subObj.totalQuestions += 1;
    subObj.timeSpentSeconds += response.timeSpent || 0;

    // Initialize topic tracker
    if (!subObj.topics[topic]) {
      subObj.topics[topic] = { total: 0, correct: 0 };
    }
    subObj.topics[topic].total += 1;

    // Check response status
    if (!response.selectedOptionKey) {
      subObj.unattemptedCount += 1;
    } else {
      subObj.attemptedCount += 1;
      if (response.selectedOptionKey === question.correctOptionKey) {
        subObj.correctCount += 1;
        subObj.topics[topic].correct += 1;
      } else {
        subObj.wrongCount += 1;
      }
    }
  });

  // Calculate scores and subject-level summaries
  const subjectResults = Object.values(subjectMap).map((sub) => {
    const rawScore = sub.correctCount;
    const percentage = sub.totalQuestions > 0 
      ? parseFloat(((sub.correctCount / sub.totalQuestions) * 100).toFixed(2)) 
      : 0;

    // English language weighting multiplier (if configured in exam blueprint)
    const weightMultiplier = sub.subjectName.toLowerCase().includes('english') ? 1.25 : 1.0;
    const weightedScore = parseFloat((rawScore * weightMultiplier).toFixed(2));

    // Map topic performance array for student diagnostic reports
    const topicBreakdown = Object.keys(sub.topics).map((topicName) => {
      const topData = sub.topics[topicName];
      return {
        topicName,
        totalQuestions: topData.total,
        correctCount: topData.correct,
        scorePercentage: parseFloat(((topData.correct / topData.total) * 100).toFixed(2))
      };
    });

    return {
      subjectName: sub.subjectName,
      totalQuestions: sub.totalQuestions,
      correctCount: sub.correctCount,
      attemptedCount: sub.attemptedCount,
      wrongCount: sub.wrongCount,
      unattemptedCount: sub.unattemptedCount,
      rawScore1: rawScore,
      rawScore2: rawScore,
      weightedScore1: weightedScore,
      weightedScore2: weightedScore,
      normalizedScore1: percentage, // Defaults to raw percentage prior to batch normalization
      normalizedScore2: Math.round(percentage),
      percentageScore: percentage,
      grade: examConfig.examType === 'CAMBRIDGE' ? getCambridgeGrade(percentage) : getWAECGrade(percentage),
      timeSpentSeconds: sub.timeSpentSeconds,
      topicBreakdown
    };
  });

  return subjectResults;
};

// ==========================================
// 4. BATCH NORMALIZATION ENGINE (JAMB / MULTI-TENANT POOL)
// ==========================================
/**
 * Applies Gaussian curve normalization across a candidate pool for standardized exams.
 */
exports.runNormalization = async (ResultModel, targetExamId, organizationId = null) => {
  // 1. Fetch exam cohort results (tenant-scoped if provided)
  const query = { examId: targetExamId };
  if (organizationId) query.organizationId = organizationId;

  const allResults = await ResultModel.find(query);
  if (allResults.length < 2) return; // Normalization requires at least 2 candidates for variance

  const examType = allResults[0].examType || 'JAMB';
  const S1 = 15; // Target Standard Deviation constant for JAMB-style curves

  // 2. Compute Global Batch Mean (Weighted)
  let totalWeighted = 0;
  let totalEntries = 0;

  allResults.forEach((r) => {
    r.subjectResults.forEach((s) => {
      totalWeighted += s.weightedScore1;
      totalEntries++;
    });
  });

  const globalMean = totalEntries > 0 ? totalWeighted / totalEntries : 0;

  // Bulk operation array for fast database writing
  const bulkOperations = [];

  // 3. Process candidate results
  for (let res of allResults) {
    let preciseRankingSum = 0;
    let aggregateSum = 0;

    res.subjectResults.forEach((sub) => {
      const x = sub.weightedScore1;

      // Extract subject cohort scores across the current batch
      const subjectScores = allResults
        .map((r) => {
          const match = r.subjectResults.find((s) => s.subjectName === sub.subjectName);
          return match ? match.weightedScore1 : null;
        })
        .filter((v) => v !== null);

      const x_prime = getMean(subjectScores);
      const S2 = getSD(subjectScores, x_prime);

      let finalNormalized = x;

      if (examType === 'JAMB') {
        // Standardize score via Z-score scaling: Z = (x - mean) / SD
        let norm1 = S2 < 1 ? x : ((S1 * (x - x_prime)) / S2) + globalMean;

        // Apply cohort size smoothing weight
        const weight = Math.min(allResults.length / 50, 1);
        let balanced = (x * (1 - weight)) + (norm1 * weight);

        // Clamp values to maintain relative boundaries
        balanced = Math.max(x - 15, Math.min(x + 15, balanced));
        balanced = Math.max(8, Math.min(99.4, balanced));

        finalNormalized = balanced;
      } else {
        // Direct percentage scaling for WAEC / NECO / Custom exams
        finalNormalized = sub.percentageScore;
      }

      sub.normalizedScore1 = parseFloat(finalNormalized.toFixed(3));
      sub.normalizedScore2 = Math.round(finalNormalized);
      sub.grade = examType === 'CAMBRIDGE' ? getCambridgeGrade(finalNormalized) : getWAECGrade(finalNormalized);

      preciseRankingSum += sub.normalizedScore1;
      aggregateSum += examType === 'JAMB' 
        ? Math.round((sub.correctCount / (sub.totalQuestions || 1)) * 100) // JAMB aggregate out of 400
        : sub.normalizedScore2;
    });

    const overallPercentage = parseFloat((preciseRankingSum / (res.subjectResults.length || 1)).toFixed(2));

    // Queue bulk update operation
    bulkOperations.push({
      updateOne: {
        filter: { _id: res._id },
        update: {
          $set: {
            subjectResults: res.subjectResults,
            aggregateScore: aggregateSum,
            preciseRankingScore: parseFloat(preciseRankingSum.toFixed(3)),
            overallPercentage,
            overallGrade: examType === 'CAMBRIDGE' ? getCambridgeGrade(overallPercentage) : getWAECGrade(overallPercentage),
            isGraded: true,
            gradingStatus: 'AUTO_GRADED'
          }
        }
      }
    });
  }

  // Execute high-performance bulk update
  if (bulkOperations.length > 0) {
    await ResultModel.bulkWrite(bulkOperations);
  }

  console.log(`[SCORING ENGINE]: Batch normalization complete for Exam ID: ${targetExamId} (${bulkOperations.length} records processed)`);
};