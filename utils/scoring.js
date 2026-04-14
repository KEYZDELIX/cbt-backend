const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const getSD = (arr, mean) => {
    if (arr.length <= 1) return 0;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel, targetExamId) => {
    const allResults = await ResultModel.find({ examId: targetExamId });
    if (allResults.length === 0) return;

    const S1 = 15; // Target SD
    const totalCandidates = allResults.length;

    // Calculate Global Mean
    let totalWeights = 0;
    let count = 0;
    allResults.forEach(r => r.subjectResults.forEach(s => {
        totalWeights += (s.weightedScore1 || 0);
        count++;
    }));
    const globalMean = count > 0 ? totalWeights / count : 0;

    for (let res of allResults) {
        let normSumForRanking = 0;
        let integerAggregate = 0; // Sum of rounded scores

        res.subjectResults.forEach(sub => {
            const x = sub.weightedScore1 || 0;
            const batchWeights = allResults.map(r => {
                const match = r.subjectResults.find(s => s.subjectName === sub.subjectName);
                return (match && typeof match.weightedScore1 === 'number') ? match.weightedScore1 : null;
            }).filter(v => v !== null);

            const x_prime = getMean(batchWeights);
            const S2 = getSD(batchWeights, x_prime);

            // 1. Calculate Standard Normalization
            let norm1 = (S2 < 2) ? x : ((S1 * (x - x_prime)) / S2) + globalMean;

            // 2. HYBRID FAIRNESS LOGIC
            // If few candidates, lean 70% on actual performance, 30% on curve.
            // If many candidates (50+), lean 100% on curve.
            const curveWeight = Math.min(totalCandidates / 50, 1); 
            const actualWeight = 1 - curveWeight;
            
            let balancedNorm = (x * actualWeight) + (norm1 * curveWeight);

            // 3. THE "FAIRNESS BUFFER" (Max +/- 15 points from raw score)
            if (balancedNorm > x + 15) balancedNorm = x + 15;
            if (balancedNorm < x - 15) balancedNorm = x - 15;

            // 4. CLAMPS (8 - 99.4)
            if (balancedNorm < 8) balancedNorm = 8 + (x * 0.05);
            if (balancedNorm >= 99.5) balancedNorm = 99.4 + (Math.min(x, 100) * 0.0009);

            sub.normalizedScore1 = balancedNorm;
            sub.normalizedScore2 = Math.round(balancedNorm);
            
            // Add rounded integer to the display aggregate
            integerAggregate += sub.normalizedScore2;
            // Add precise float to the ranking sum
            normSumForRanking += balancedNorm;
        });

        res.aggregateScore = integerAggregate; // Sum of rounded whole numbers
        res.preciseRankingScore = parseFloat(normSumForRanking.toFixed(3));
        
        await res.save();
    }
};