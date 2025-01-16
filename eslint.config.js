const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
    {
        files: ['**/*.ts'],
        ignores: [
            '**/charting_library/**',
            '**/public/charting_library/**'
        ],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                'node': true,
                'es6': true
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            'no-console': 'warn',
            '@typescript-eslint/no-empty-interface': 'off'
        }
    }
]; 