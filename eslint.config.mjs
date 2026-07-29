import { globalIgnores } from 'eslint/config';
import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	globalIgnores(['meshctrl.js']),
	{
		files: ['./credentials/**/*.ts'],
		rules: {
			'@n8n/community-nodes/credential-test-required': 'off',
			'@n8n/community-nodes/icon-validation': 'off',
		},
	},
	{
		files: ['package.json'],
		rules: {
			'@n8n/community-nodes/no-runtime-dependencies': 'off',
		},
	},
];
