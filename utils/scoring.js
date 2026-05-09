const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const getSD = (arr, mean) => {
    if (arr.length <= 1) return 0;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel, targetExamId) => {
    // 1. Fetch only candidates for this specific exam session pool
    const allResults = await ResultModel.find({ examId: targetExamId });
    if (allResults.length < 2) return;

    const S1 = 15; // JAMB Target Standard Deviation Constant
    
    // 2. Calculate Global Mean (Using weightedScore1 to maintain question importance)
    let totalWeighted = 0, totalEntries = 0;
    allResults.forEach(r => r.subjectResults.forEach(s => {
        totalWeighted += s.weightedScore1; 
        totalEntries++;
    }));
    const globalMean = totalWeighted / totalEntries;

    // 3. Normalize each candidate
    for (let res of allResults) {
        let preciseRankingSum = 0;
        let integerAggregate = 0;

        res.subjectResults.forEach(sub => {
            // CRITICAL: We use weightedScore1 because English is weighted higher in your logic
            const x = sub.weightedScore1; 
            
            // Get all scores for this specific subject across the batch to find Mean/SD
            const subjectScores = allResults.map(r => {
                const match = r.subjectResults.find(s => s.subjectName === sub.subjectName);
                return match ? match.weightedScore1 : null;
            }).filter(v => v !== null);

            const x_prime = getMean(subjectScores);
            const S2 = getSD(subjectScores, x_prime);

            // Normalization Formula: Standardizing the distribution
            let norm1 = (S2 < 1) ? x : ((S1 * (x - x_prime)) / S2) + globalMean;

            // Apply population-based smoothing (prevents wild swings in small groups)
            const weight = Math.min(allResults.length / 50, 1);
            let balanced = (x * (1 - weight)) + (norm1 * weight);

            // Clamps (Stay within +/- 15 of the weighted performance, and keep between 8-100)
            balanced = Math.max(x - 15, Math.min(x + 15, balanced));
            balanced = Math.max(8, Math.min(99.4, balanced));

            // Update the document fields
            sub.normalizedScore1 = balanced;
            sub.normalizedScore2 = Math.round(balanced);
            
            preciseRankingSum += sub.normalizedScore1;
            integerAggregate += sub.normalizedScore2;
        });

        // Update top-level Result totals
        res.aggregateScore = integerAggregate;
        res.preciseRankingScore = parseFloat(preciseRankingSum.toFixed(3));
        
        // Ensure Mongoose detects the nested array update
        res.markModified('subjectResults');
        await res.save();
    }
    console.log(`[SCORING]: Batch normalization complete for Exam ID: ${targetExamId}`);
};