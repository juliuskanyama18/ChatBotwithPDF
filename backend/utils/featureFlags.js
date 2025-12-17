/**
 * Feature Flags Utility
 * Centralized feature flag management for gradual rollout
 */

/**
 * Check if a feature is enabled
 * @param {string} flagName - Name of the feature flag
 * @returns {boolean} Whether the feature is enabled
 */
export function isFeatureEnabled(flagName) {
    const envVar = process.env[flagName];

    if (envVar === undefined) {
        return false;
    }

    // Trim whitespace
    const cleanValue = envVar.trim();

    // Handle various truthy values
    const truthyValues = ['true', '1', 'yes', 'on', 'enabled'];
    return truthyValues.includes(cleanValue.toLowerCase());
}

// Lazy-evaluated flag cache
const _flagCache = {};

/**
 * Get a feature flag value (lazy-evaluated)
 */
function getFlag(flagName) {
    if (!(flagName in _flagCache)) {
        _flagCache[flagName] = isFeatureEnabled(flagName);
    }
    return _flagCache[flagName];
}

// Export flag getters
export const USE_MANAGED_RAG = () => getFlag('USE_MANAGED_RAG');
export const USE_PYTHON_OCR = () => getFlag('USE_PYTHON_OCR');
export const STRICT_GROUNDING = () => getFlag('STRICT_GROUNDING');

/**
 * Log feature flag status on startup
 */
export function logFeatureFlags() {
    console.log('\n🚩 Feature Flags:');
    console.log(`   USE_MANAGED_RAG: ${USE_MANAGED_RAG() ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   USE_PYTHON_OCR: ${USE_PYTHON_OCR() ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   STRICT_GROUNDING: ${STRICT_GROUNDING() ? '✅ Enabled' : '❌ Disabled'}`);
    console.log('');
}

export default {
    isFeatureEnabled,
    USE_MANAGED_RAG,
    USE_PYTHON_OCR,
    STRICT_GROUNDING,
    logFeatureFlags
};
