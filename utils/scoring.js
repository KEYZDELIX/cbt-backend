// Mathematical helpers
const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const getSD = (arr, mean) => {
    if (arr.length === 0) return 0;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel) => {
    const allResults = await ResultModel.find();
    if (allResults.length === 0) return;

    // Constants for JAMB Curve
    const S1 = 15; // Target Standard Deviation

    // 1. Calculate Global Mean (x'1) - Mean of all students across all subjects
    let totalOfAllWeights = 0;
    let count = 0;
    allResults.forEach(r => r.subjectResults.forEach(s => {
        totalOfAllWeights += s.weightedScore1;
        count++;
    }));
    const globalMean = totalOfAllWeights / count;

    // 2. Normalize each result
    for (let res of allResults) {
        res.subjectResults.forEach(sub => {
            // x = weightedScore1
            const x = sub.weightedScore1;

            // In a real batch system, x' and S2 would be calculated per batch
            // Here we use current session stats as the batch
            const batchWeights = allResults.map(r => 
                r.subjectResults.find(s => s.subjectName === sub.subjectName)?.weightedScore1 || 0
            );
            const x_prime = getMean(batchWeights);
            const S2 = getSD(batchWeights, x_prime);

            // Formula: [S1(x - x') / S2] + x'1
            // Fallback to x if SD is 0 to avoid division by zero
            const norm1 = (S2 === 0) ? x : ((S1 * (x - x_prime)) / S2) + globalMean;
            
            sub.normalizedScore1 = norm1;
            sub.normalizedScore2 = Math.round(norm1);
        });

        // Sum up totals
        res.aggregateScore = res.subjectResults.reduce((acc, s) => acc + s.normalizedScore2, 0);
        res.preciseRankingScore = parseFloat(res.subjectResults.reduce((acc, s) => acc + s.normalizedScore1, 0).toFixed(3));
        
        await res.save();
    }
};