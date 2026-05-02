const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const getSD = (arr, mean) => {
    if (arr.length <= 1) return 0;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel, targetExamId) => {
    // 1. Fetch only candidates for this specific exam
    const allResults = await ResultModel.find({ examId: targetExamId });
    if (allResults.length < 2) return;

    const S1 = 15; // Target Standard Deviation (JAMB Constant)
    
    // 2. Calculate Global Mean across all subjects in this pool
    let totalRaw = 0, totalEntries = 0;
    allResults.forEach(r => r.subjectResults.forEach(s => {
        totalRaw += s.rawScore1;
        totalEntries++;
    }));
    const globalMean = totalRaw / totalEntries;

    for (let res of allResults) {
        let preciseRankingSum = 0;
        let integerAggregate = 0;

        res.subjectResults.forEach(sub => {
            const x = sub.rawScore1;
            
            // Get all scores for this specific subject to find batch mean/SD
            const subjectScores = allResults.map(r => {
                const match = r.subjectResults.find(s => s.subjectName === sub.subjectName);
                return match ? match.rawScore1 : null;
            }).filter(v => v !== null);

            const x_prime = getMean(subjectScores);
            const S2 = getSD(subjectScores, x_prime);

            // Normalization Formula: ((S1 * (x - x_prime)) / S2) + globalMean
            let norm1 = (S2 < 1) ? x : ((S1 * (x - x_prime)) / S2) + globalMean;

            // Apply population-based smoothing (prevents wild swings in small groups)
            const weight = Math.min(allResults.length / 50, 1);
            let balanced = (x * (1 - weight)) + (norm1 * weight);

            // Clamps (Stay within +/- 15 of raw, and keep between 8-99)
            balanced = Math.max(x - 15, Math.min(x + 15, balanced));
            balanced = Math.max(8, Math.min(99.4, balanced));

            sub.normalizedScore1 = balanced;
            sub.normalizedScore2 = Math.round(balanced);
            
            preciseRankingSum += sub.normalizedScore1;
            integerAggregate += sub.normalizedScore2;
        });

        res.aggregateScore = integerAggregate;
        res.preciseRankingScore = parseFloat(preciseRankingSum.toFixed(3));
        res.markModified('subjectResults');
        await res.save();
    }
};