export function calculateMultipleLinearRegression(X, Y) {
    // Beta = (X^T * X)^-1 * X^T * Y
    const XT = transpose(X);
    const XTX = multiply(XT, X);
    const XTX_inv = invert(XTX);
    const XTY = multiplyVector(XT, Y);
    const beta = multiplyVector(XTX_inv, XTY); // Actually multiply matrix by vector
    
    // Calculate predicted values: Y_hat = X * beta
    const predictedY = multiplyVector(X, beta);

    // Calculate R-squared
    const n = Y.length;
    const meanY = Y.reduce((a, b) => a + b, 0) / n;
    const totalSumSquares = Y.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const residualSumSquares = Y.reduce((sum, y, i) => sum + Math.pow(y - predictedY[i], 2), 0);
    const rSquared = 1 - (residualSumSquares / totalSumSquares);

    return { beta, predictedY, rSquared };
}


export function transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

export function multiply(A, B) {
    const result = new Array(A.length).fill(0).map(() => new Array(B[0].length).fill(0)); // Initialize result matrix
    return result.map((row, i) => { // For each row in A
        return row.map((val, j) => { // For each column in B
            return A[i].reduce((sum, elm, k) => sum + (elm * B[k][j]), 0); // Dot product
        });
    });
}

export function multiplyVector(A, v) {
    // A is matrix, v is vector
    // Result is vector
    return A.map(row => row.reduce((sum, elm, k) => sum + (elm * v[k]), 0));
}

export function invert(M) {
    // Gaussian elimination
    // M is square matrix
    const n = M.length;
    // Create augmented matrix [M | I]
    const A = M.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

    for (let i = 0; i < n; i++) {
        // Find pivot
        let pivot = A[i][i];
        if (Math.abs(pivot) < 1e-10) {
            // Swap with a row below
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > 1e-10) {
                    [A[i], A[k]] = [A[k], A[i]];
                    pivot = A[i][i];
                    break;
                }
            }
        }
        
        // Normalize row
        for (let j = 0; j < 2 * n; j++) {
            A[i][j] /= pivot;
        }

        // Eliminate other rows
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = A[k][i];
                for (let j = 0; j < 2 * n; j++) {
                    A[k][j] -= factor * A[i][j];
                }
            }
        }
    }

    // Extract inverse
    return A.map(row => row.slice(n));
}

export function calculateLinearRegression(data, xKey, yKey) {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let i = 0; i < n; i++) { // for each data point
        sumX += +data[i][xKey];
        sumY += +data[i][yKey];
        sumXY += +data[i][xKey] * +data[i][yKey];
        sumXX += +data[i][xKey] * +data[i][xKey];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    let totalSumSquares = 0;
    let residualSumSquares = 0;

    for (let i = 0; i < n; i++) { // for each data point
        const predictedY = intercept + slope * data[i][xKey];
        totalSumSquares += (data[i][yKey] - meanY) ** 2;
        residualSumSquares += (data[i][yKey] - predictedY) ** 2;
    }

    const rSquared = 1 - (residualSumSquares / totalSumSquares);

    const correlation = Math.sign(slope) * Math.sqrt(rSquared);

    return { slope, intercept, rSquared, correlation };
}

