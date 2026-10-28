import tseslint from 'typescript-eslint';

export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/*.d.ts',
            'extensions/**',
            'localization-editor/**',
            'library/**',
            'temp/**',
            'build/**',
            'reverse/**',
            '.uitest-out/**',
            '.logtest-out/**',
            '.savetest-out/**',
            '.reddottest-out/**',
        ],
    },
    {
        files: ['assets/Scripts/**/*.ts', 'tools/**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: ['variable', 'parameter'],
                    format: ['camelCase'],
                    leadingUnderscore: 'forbid',
                    trailingUnderscore: 'forbid',
                },
                {
                    // Includes public fields without an explicit accessibility modifier.
                    // Protected fields also use ordinary camelCase.
                    selector: ['classProperty', 'parameterProperty'],
                    format: ['camelCase'],
                    leadingUnderscore: 'forbid',
                    trailingUnderscore: 'forbid',
                },
                {
                    selector: 'classProperty',
                    modifiers: ['static'],
                    format: ['PascalCase', 'UPPER_CASE'],
                    leadingUnderscore: 'forbid',
                    trailingUnderscore: 'forbid',
                },
                {
                    selector: 'classProperty',
                    modifiers: ['private', 'static'],
                    format: ['PascalCase', 'UPPER_CASE'],
                    leadingUnderscore: 'forbid',
                    trailingUnderscore: 'forbid',
                },
                {
                    selector: ['classProperty', 'parameterProperty'],
                    modifiers: ['private'],
                    format: ['camelCase'],
                    leadingUnderscore: 'require',
                    trailingUnderscore: 'forbid',
                },
            ],
        },
    },
    {
        files: ['assets/Scripts/**/*.ts'],
        rules: { 'no-console': 'warn' },
    },
    {
        files: ['assets/Scripts/Frame/Log/ConsoleLogSink.ts'],
        rules: { 'no-console': 'off' },
    },
];
