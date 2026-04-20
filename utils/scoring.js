const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const getSD = (arr, mean) => {
    if (arr.length <= 1) return 0;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel, targetExamId) => {
    // 1. Fetch all results for this specific exam blueprint
    const allResults = await ResultModel.find({ examId: targetExamId });
    if (allResults.length === 0) return;

    const S1 = 15; // Target Standard Deviation (Global Constant)
    const totalCandidates = allResults.length;

    // 2. Calculate Global Mean (Average of all weightedScore1 across all subjects/users)
    let totalWeights = 0;
    let count = 0;
    allResults.forEach(r => r.subjectResults.forEach(s => {
        if (typeof s.weightedScore1 === 'number') {
            totalWeights += s.weightedScore1;
            count++;
        }
    }));
    const globalMean = count > 0 ? totalWeights / count : 0;

    // 3. Process each result for normalization
    for (let res of allResults) {
        let normSumForRanking = 0;
        let integerAggregate = 0;

        res.subjectResults.forEach(sub => {
            const x = sub.weightedScore1 || 0;
            
            // Get all candidates' scores for THIS specific subject to find local Mean/SD
            const batchWeights = allResults.map(r => {
                const match = r.subjectResults.find(s => s.subjectName === sub.subjectName);
                return (match && typeof match.weightedScore1 === 'number') ? match.weightedScore1 : null;
            }).filter(v => v !== null);

            const x_prime = getMean(batchWeights);
            const S2 = getSD(batchWeights, x_prime);

            // 4. THE NORMALIZATION FORMULA
            // Use raw score if SD is too low (prevents division by zero)
            let norm1 = (S2 < 1) ? x : ((S1 * (x - x_prime)) / S2) + globalMean;

            // 5. HYBRID FAIRNESS (Curve weighting grows with student count)
            const curveWeight = Math.min(totalCandidates / 50, 1); 
            const actualWeight = 1 - curveWeight;
            
            let balancedNorm = (x * actualWeight) + (norm1 * curveWeight);

            // 6. THE "FAIRNESS BUFFER" (+/- 15 cap relative to raw performance)
            if (balancedNorm > x + 15) balancedNorm = x + 15;
            if (balancedNorm < x - 15) balancedNorm = x - 15;

            // 7. HARD CLAMPS (JAMB-style scale: 8 to 99.4)
            if (balancedNorm < 8) balancedNorm = 8 + (x * 0.05);
            if (balancedNorm >= 99.5) {
                balancedNorm = 99.4 + (Math.min(x, 100) * 0.0009);
            }

            // Update sub-document fields
            sub.normalizedScore1 = balancedNorm;
            sub.normalizedScore2 = Math.round(balancedNorm);
            
            integerAggregate += sub.normalizedScore2;
            normSumForRanking += balancedNorm;
        });

        // 8. FINAL SAVE: Push the normalized totals to the main Result document
        res.aggregateScore = integerAggregate; 
        res.preciseRankingScore = parseFloat(normSumForRanking.toFixed(3));
        
        // Use markModified if subjectResults is a nested array in Mongoose
        res.markModified('subjectResults'); 
        await res.save();
    }
    
    console.log(`Normalization complete for Exam ID: ${targetExamId}. Processed ${totalCandidates} candidates.`);
};