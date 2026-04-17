const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const getSD = (arr, mean) => {
    if (arr.length <= 1) return 0;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel, targetExamId) => {
    // Search by the Exam Blueprint ID
    const allResults = await ResultModel.find({ examId: targetExamId });
    if (allResults.length === 0) return;

    const S1 = 15; // Target Standard Deviation (Global)
    const totalCandidates = allResults.length;

    // 1. Calculate Global Mean across all subjects and candidates
    let totalWeights = 0;
    let count = 0;
    allResults.forEach(r => r.subjectResults.forEach(s => {
        totalWeights += (s.weightedScore1 || 0);
        count++;
    }));
    const globalMean = count > 0 ? totalWeights / count : 0;

    // 2. Process each result
    for (let res of allResults) {
        let normSumForRanking = 0;
        let integerAggregate = 0;

        res.subjectResults.forEach(sub => {
            const x = sub.weightedScore1 || 0;
            
            // Get all candidates' scores for THIS specific subject
            const batchWeights = allResults.map(r => {
                const match = r.subjectResults.find(s => s.subjectName === sub.subjectName);
                return (match && typeof match.weightedScore1 === 'number') ? match.weightedScore1 : null;
            }).filter(v => v !== null);

            const x_prime = getMean(batchWeights);
            const S2 = getSD(batchWeights, x_prime);

            // 3. THE NORMALIZATION FORMULA
            // If SD is too low (e.g., only 1 student), use raw score to prevent division errors
            let norm1 = (S2 < 1) ? x : ((S1 * (x - x_prime)) / S2) + globalMean;

            // 4. HYBRID FAIRNESS (Curve weighting increases with student count)
            const curveWeight = Math.min(totalCandidates / 50, 1); 
            const actualWeight = 1 - curveWeight;
            
            let balancedNorm = (x * actualWeight) + (norm1 * curveWeight);

            // 5. THE "FAIRNESS BUFFER" (Keeps scores within +/- 15 of raw performance)
            if (balancedNorm > x + 15) balancedNorm = x + 15;
            if (balancedNorm < x - 15) balancedNorm = x - 15;

            // 6. HARD CLAMPS (Jamb-style range: 8 to 99.4 per subject)
            if (balancedNorm < 8) balancedNorm = 8 + (x * 0.05);
            if (balancedNorm >= 99.5) balancedNorm = 99.4 + (Math.min(x, 100) * 0.0009);

            // Update sub-document
            sub.normalizedScore1 = balancedNorm;
            sub.normalizedScore2 = Math.round(balancedNorm);
            
            integerAggregate += sub.normalizedScore2;
            normSumForRanking += balancedNorm;
        });

        // Save back to the Result document
        res.aggregateScore = integerAggregate; 
        res.preciseRankingScore = parseFloat(normSumForRanking.toFixed(3));
        
        await res.save();
    }
};