const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const getSD = (arr, mean) => {
    if (arr.length <= 1) return 0;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel, targetExamId) => {
    // CRITICAL: Only fetch results for this specific Exam ID
    const allResults = await ResultModel.find({ examId: targetExamId });
    if (allResults.length === 0) return;

    const S1 = 15; // JAMB standard deviation constant

    // 1. Global Mean across this specific exam
    let totalWeights = 0;
    let count = 0;
    allResults.forEach(r => r.subjectResults.forEach(s => {
        totalWeights += (s.weightedScore1 || 0);
        count++;
    }));
    const globalMean = count > 0 ? totalWeights / count : 0;

    for (let res of allResults) {
        let normSum = 0;
        let weightedSum = 0;
        let rawSum = 0;

        res.subjectResults.forEach(sub => {
            const x = sub.weightedScore1 || 0;
            const batchWeights = allResults.map(r => {
                const match = r.subjectResults.find(s => s.subjectName === sub.subjectName);
                return match ? match.weightedScore1 : null;
            }).filter(v => v !== null);

            const x_prime = getMean(batchWeights);
            const S2 = getSD(batchWeights, x_prime);

            // The Normalization Formula with NaN protection
            let norm1 = (S2 < 0.01) ? x : ((S1 * (x - x_prime)) / S2) + globalMean;
            
            sub.normalizedScore1 = isNaN(norm1) ? x : norm1;
            sub.normalizedScore2 = Math.round(sub.normalizedScore1);

            normSum += sub.normalizedScore1;
            weightedSum += (sub.weightedScore2 || 0);
            rawSum += (sub.rawScore2 || 0);
        });

        // 2. Multi-Aggregate Comparison
        res.aggregateScore = Math.round(normSum); // Default display
        res.totalRawScore = rawSum;               // Raw sum (e.g. 240/400)
        res.totalWeightedScore = weightedSum;     // Weighted sum
        res.preciseRankingScore = parseFloat(normSum.toFixed(3));
        
        await res.save();
    }
};