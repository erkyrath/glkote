module.exports = {
    env: {
        browser: true,
        commonjs: true,
        es2021: true,
        jquery: true,
    },
    extends: 'eslint:recommended',
    globals: {
        opera: 'readonly',
    },
    parserOptions: {
        ecmaVersion: 13
    },
    rules: {
        //indent: ['error', 2],
        'linebreak-style': ['error', 'unix'],
        'no-constant-condition': ['error', {checkLoops: false}],
        'no-var': 'error',
        'prefer-const': 'error',
        quotes: ['error', 'single', {avoidEscape: true}],
        semi: ['error', 'always'],
    },
};
