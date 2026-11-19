// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title MedianMath
/// @notice Deterministic per-narrative median calculation for uint16 index vectors and int32 velocity vectors.
library MedianMath {
    int32 internal constant VELOCITY_UNAVAILABLE = type(int32).min;

    error EmptyVectors();

    function absDiffUint16(uint16 a, uint16 b) internal pure returns (uint16) {
        return a >= b ? a - b : b - a;
    }

    /// @notice Computes the per-narrative median across validator uint16 vectors.
    function medianUint16Vectors(uint16[][] memory vectors, uint8 narrativeCount)
        internal
        pure
        returns (uint16[] memory medians)
    {
        uint256 k = vectors.length;
        if (k == 0) revert EmptyVectors();
        medians = new uint16[](narrativeCount);
        uint16[] memory scratch = new uint16[](k);

        for (uint256 n = 0; n < narrativeCount; n++) {
            for (uint256 j = 0; j < k; j++) {
                scratch[j] = vectors[j][n];
            }
            _sortUint16(scratch, k);
            if (k % 2 == 1) {
                medians[n] = scratch[k / 2];
            } else {
                medians[n] = uint16((uint256(scratch[k / 2 - 1]) + uint256(scratch[k / 2])) / 2);
            }
        }
    }

    /// @notice Computes the per-narrative median across validator int32 velocity vectors.
    ///         If at least half of validators report VELOCITY_UNAVAILABLE (type(int32).min),
    ///         the median is VELOCITY_UNAVAILABLE; otherwise the median is computed over valid entries.
    function medianInt32Vectors(int32[][] memory vectors, uint8 narrativeCount)
        internal
        pure
        returns (int32[] memory medians)
    {
        uint256 k = vectors.length;
        if (k == 0) revert EmptyVectors();
        medians = new int32[](narrativeCount);
        int32[] memory scratch = new int32[](k);

        for (uint256 n = 0; n < narrativeCount; n++) {
            uint256 validCount = 0;
            for (uint256 j = 0; j < k; j++) {
                int32 val = vectors[j][n];
                if (val != VELOCITY_UNAVAILABLE) {
                    scratch[validCount] = val;
                    validCount++;
                }
            }

            // Majority (or tie) unavailable -> unavailable
            if (validCount * 2 <= k) {
                medians[n] = VELOCITY_UNAVAILABLE;
                continue;
            }

            _sortInt32(scratch, validCount);
            if (validCount % 2 == 1) {
                medians[n] = scratch[validCount / 2];
            } else {
                int256 sum = int256(scratch[validCount / 2 - 1]) + int256(scratch[validCount / 2]);
                medians[n] = int32(sum / 2);
            }
        }
    }

    function _sortUint16(uint16[] memory arr, uint256 len) private pure {
        for (uint256 i = 1; i < len; i++) {
            uint16 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }
    }

    function _sortInt32(int32[] memory arr, uint256 len) private pure {
        for (uint256 i = 1; i < len; i++) {
            int32 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }
    }
}
