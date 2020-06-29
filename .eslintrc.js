module.exports = {
    "env": {
        "browser": true,
        "es2020": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "globals": {
        "$": "readonly",
        "jQuery": "readonly",
    },
    "parserOptions": {
        "ecmaVersion": 11,
        "sourceType": "module"
    },
    "rules": {
        "no-constant-condition": ["error", {"checkLoops": false}],
    }
};
