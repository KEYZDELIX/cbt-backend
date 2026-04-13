const getMean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const getSD = (arr, mean) => {
    if (arr.length <= 1) return 0; // SD is 0 if only one student exists
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

exports.runNormalization = async (ResultModel) => {
    // 1. Fetch all results to get a global context
    const allResults = await ResultModel.find();
    if (allResults.length === 0) return;

    // Constants for JAMB Curve
    const S1 = 15; // Target Standard Deviation (Chosen to simulate JAMB's spread)

    // 2. Calculate Global Mean (x'1)
    // This is the average of all weighted scores across all students and subjects
    let totalOfAllWeights = 0;
    let totalSubjectEntries = 0;
    
    allResults.forEach(r => {
        r.subjectResults.forEach(s => {
            totalOfAllWeights += s.weightedScore1;
            totalSubjectEntries++;
        });
    });
    
    const globalMean = totalSubjectEntries > 0 ? totalOfAllWeights / totalSubjectEntries : 0;

    // 3. Normalize each result document
    for (let res of allResults) {
        let currentAggregate = 0;
        let currentPrecise = 0;

        res.subjectResults.forEach(sub => {
            const x = sub.weightedScore1;

            // Gather all scores for THIS specific subject across ALL students
            const allScoresForThisSubject = allResults.map(r => {
                const match = r.subjectResults.find(s => s.subjectName === sub.subjectName);
                return match ? match.weightedScore1 : null;
            }).filter(val => val !== null);

            const x_prime = getMean(allScoresForThisSubject);
            const S2 = getSD(allScoresForThisSubject, x_prime);

            // JAMB Normalization Formula: [S1(x - x') / S2] + x'1
            let norm1;
            if (S2 < 0.001) { 
                // Fallback: If no variance (one student or all same scores), 
                // normalization is impossible, so we keep the weighted score.
                norm1 = x; 
            } else {
                norm1 = ((S1 * (x - x_prime)) / S2) + globalMean;
            }
            
            // Apply caps (Optional: Ensures scores don't exceed 100 or drop below 0)
            norm1 = Math.max(0, Math.min(100, norm1));

            sub.normalizedScore1 = norm1;
            sub.normalizedScore2 = Math.round(norm1);

            currentAggregate += sub.normalizedScore2;
            currentPrecise += norm1;
        });

        // 4. Update the document totals
        res.aggregateScore = currentAggregate;
        res.preciseRankingScore = parseFloat(currentPrecise.toFixed(3));
        
        // Save the updated calculation back to MongoDB
        await res.save();
    }
};