import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const execFileAsync = promisify(execFile);

const unsupportedCommands = new Set(['showevents', 'upload', 'download', 'agentdownload']);

/**
 * Splits the command field into arguments without invoking a shell. This keeps
 * quotes in commands working while ensuring credential values are never parsed
 * as shell syntax.
 */
function parseCommand(command: string): string[] | undefined {
	const argumentsList: string[] = [];
	let current = '';
	let quote: '"' | "'" | undefined;
	let escaped = false;

	for (const character of command.trim()) {
		if (escaped) {
			current += character;
			escaped = false;
			continue;
		}

		if (character === '\\' && quote !== "'") {
			escaped = true;
			continue;
		}

		if (quote !== undefined) {
			if (character === quote) quote = undefined;
			else current += character;
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
		} else if (/\s/.test(character)) {
			if (current.length > 0) {
				argumentsList.push(current);
				current = '';
			}
		} else {
			current += character;
		}
	}

	if (escaped) current += '\\';
	if (quote !== undefined) return undefined;
	if (current.length > 0) argumentsList.push(current);

	return argumentsList;
}

function toOutputItems(value: unknown, itemIndex: number): INodeExecutionData[] {
	const values = Array.isArray(value) ? value : [value];

	return values.map((entry) => ({
		json:
			typeof entry === 'object' && entry !== null && !Array.isArray(entry)
				? (entry as IDataObject)
				: { result: entry },
		pairedItem: { item: itemIndex },
	}));
}

export class Meshcentral implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MeshCentral CMD',
		name: 'meshcentral',
		subtitle: '={{$parameter["cmd"]}}',
		icon: { light: 'file:MeshCentral.png', dark: 'file:MeshCentral.dark.png' },
		group: ['input'],
		description: 'Control your MeshCentral server via meshctrl.js',
		version: 1,
		defaults: {
			name: 'MeshCentral',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'meshcentralApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Meshctrl Command',
				name: 'cmd',
				type: 'string',
				default: 'help',
				placeholder: 'e.g. adduser --user SampleUser --pass SamplePassword',
				description:
					'Run `node ./node_modules/meshcentral/meshctrl` on your MeshCentral server for help',
				noDataExpression: false,
			},
			{
				displayName: 'Result Separator',
				name: 'sep',
				type: 'string',
				default: ',',
				placeholder: '',
				description: 'How to separate columns in non-JSON responses',
				noDataExpression: true,
			},
			{
				displayName: 'Debug',
				name: 'debug',
				type: 'boolean',
				default: false,
				description: 'Whether to add debug information to the logs',
			},
			{
				displayName:
					'The connection arguments derive from the credentials. "--json" is appended by default. Use variables in your command via <a href="https://docs.n8n.io/code-examples/expressions/" target="_blank">expressions</a>. Unsupported commands: showevents, upload, download, agentdownload',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const meshctrlPath = resolve(__dirname, '..', '..', 'meshctrl.js');
		if (!existsSync(meshctrlPath)) {
			throw new NodeOperationError(
				this.getNode(),
				'Bundled meshctrl.js was not found. Reinstall this node package.',
			);
		}

		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('meshcentralApi');
		const url = String(credentials.url ?? '');
		const port = String(credentials.port ?? '');
		const username = String(credentials.username ?? '');
		const password = String(credentials.password ?? '');
		const proxy = String(credentials.proxy ?? '');

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const command = this.getNodeParameter('cmd', itemIndex) as string;
				const separator = this.getNodeParameter('sep', itemIndex) as string;
				const debugOn = this.getNodeParameter('debug', itemIndex) as boolean;
				const commandArguments = parseCommand(command);
				if (commandArguments === undefined) {
					throw new NodeOperationError(this.getNode(), 'Command contains an unclosed quote.', {
						itemIndex,
					});
				}
				const commandName = commandArguments[0]?.toLowerCase();

				if (commandName === undefined)
					throw new NodeOperationError(this.getNode(), 'A meshctrl command is required.', {
						itemIndex,
					});
				if (unsupportedCommands.has(commandName)) {
					throw new NodeOperationError(
						this.getNode(),
						`Usage of unsupported command: ${commandName}`,
						{ itemIndex },
					);
				}

				const argumentsList = [
					meshctrlPath,
					'--url',
					`${url}:${port}`,
					'--loginuser',
					username,
					'--loginpass',
					password,
					...(proxy.length > 0 ? ['--proxy', proxy] : []),
					...commandArguments,
					'--json',
				];
				const { stdout, stderr } = await execFileAsync(process.execPath, argumentsList, {
					maxBuffer: 10 * 1024 * 1024,
				});
				const output = stdout.trim();

				try {
					returnItems.push(...toOutputItems(JSON.parse(output), itemIndex));
				} catch {
					const resultSet = output.split(/\r?\n/).filter((row) => row.length > 0);
					if (resultSet.length > 1) {
						const headers = resultSet.shift()?.split(separator) ?? [];
						returnItems.push(
							...resultSet.map((row) => ({
								json: Object.fromEntries(
									headers.map((header, index) => [header, row.split(separator)[index]]),
								),
								pairedItem: { item: itemIndex },
							})),
						);
					} else {
						returnItems.push({ json: { result: output }, pairedItem: { item: itemIndex } });
					}
				}

				if (debugOn) this.logger.debug('MeshCentral', { command, stderr });
			} catch (error) {
				if (this.continueOnFail()) {
					returnItems.push({
						json: { error: error instanceof Error ? error.message : String(error) },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw new NodeOperationError(
					this.getNode(),
					error instanceof Error ? error.message : String(error),
					{
						itemIndex,
					},
				);
			}
		}

		return [returnItems];
	}
}
