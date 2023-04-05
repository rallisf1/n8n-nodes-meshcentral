import { INodeExecutionData, INodeType, INodeTypeDescription, NodeOperationError } from 'n8n-workflow';
import { IExecuteFunctions } from "n8n-core";
import { exec } from 'child_process';

export interface IExecReturnData {
	exitCode: number;
	error?: Error;
	stderr: string;
	stdout: string;
}

interface MCSVInterface {
	[key: string]: string;
}

async function execPromise(command: string): Promise<IExecReturnData> {
	const returnData: IExecReturnData = {
		error: undefined,
		exitCode: 0,
		stderr: '',
		stdout: '',
	};

	return new Promise((resolve, _reject) => {
		exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
			returnData.stdout = stdout.trim();
			returnData.stderr = stderr.trim();

			if (error) {
				returnData.error = error;
			}

			resolve(returnData);
		}).on('exit', (code) => {
			returnData.exitCode = code || 0;
		});
	});
}

export class Meshcentral implements INodeType {
		description: INodeTypeDescription = {
		displayName: 'MeshCentral CMD',
		name: 'meshcentral',
		// eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg
		icon: 'file:Meshcentral.png',
		group: ['input'],
		description: 'Control your MeshCentral server via meshctrl.js',
		version: 1,
		defaults: {
			name: 'MeshCentral',
		},
		inputs: ['main'],
		outputs: ['main'],
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
				description: 'Run `node ./node_modules/meshcentral/meshctrl` on your MeshCentral server for help',
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
				displayName: 'The connection arguments derive from the credentials. "--json" is appended by default. Use variables in your command via <a href="https://docs.n8n.io/code-examples/expressions/" target="_doc">expressions</a>. Unsupported commands: showevents, upload, download, agentdownload',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};
	
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const os = require('os');
		const path = require('path');
		const fs = require('fs');
		
		// standard instance
		let meshctrlPath = os.homedir() + path.join('.n8n', 'nodes', 'node_modules', 'n8n-nodes-meshcentral', 'dist', 'meshctrl.js');
		
		// docker instance
		if (!fs.existsSync(meshctrlPath)) {
			meshctrlPath = path.join('/home', 'node', '.n8n', 'nodes', 'node_modules', 'n8n-nodes-meshcentral', 'dist', 'meshctrl.js');
		}

		// for dev environment
		if(!fs.existsSync(meshctrlPath)) {
			meshctrlPath = path.join('.', 'node_modules', 'n8n-nodes-meshcentral', 'meshctrl.js');
		}

		if(!fs.existsSync(meshctrlPath)) {
			throw new NodeOperationError(this.getNode(), 'meshctrl.js not found!');
		}

		let items = this.getInputData();
		const unsupported = ['showevents', 'upload', 'download', 'agentdownload'];
		let command: string;
		let separator: string;
		let debugOn: boolean;

		items = [items[0]]; // it only takes 1 input

		const returnItems: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('meshcentralApi');

		if (credentials === undefined) {
			throw new NodeOperationError(this.getNode(), 'No credentials got returned!');
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				command = this.getNodeParameter('cmd', itemIndex) as string;
				separator = this.getNodeParameter('sep', itemIndex) as string;
				debugOn = this.getNodeParameter('debug', itemIndex) as boolean;

				if(unsupported.indexOf(command.split(' ')[0]) > -1) throw new NodeOperationError(this.getNode(), 'Usage of unsupported command: ' + unsupported.join(', '));

				const { error, stdout, stderr } = (credentials.proxy as string).length ? await execPromise(`node "${meshctrlPath}" --url ${credentials.url}:${credentials.port} --loginuser ${credentials.username as string} --loginpass ${credentials.password as string} --proxy ${credentials.proxy as string} ${command} --json`) : await execPromise(`node "${meshctrlPath}" --url ${credentials.url}:${credentials.port} --loginuser ${credentials.username as string} --loginpass ${credentials.password as string} ${command} --json`);

				if (error !== undefined) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex });
				}

				try {
					returnItems.push({
						json: JSON.parse(stdout.replace('\\n', '')),
					});
				} catch (e) { // non-JSON response
					const resultSet = stdout.split("\n");
					if(resultSet.length > 1) {
						// treat as csv
						const headers = resultSet.shift()?.split(separator) || [];
						
						resultSet.forEach(r => {
							const tmp: MCSVInterface = {};
							const row = r.split(separator);
							for(let i = 0; i < headers.length; i++){
								tmp[headers[i]] = row[i];
							}
							returnItems.push({
								json: tmp,
							});
						});

					} else {
						returnItems.push({
							json: {
								result: stdout,
							},
						});
					}
				}

				if(debugOn) {
					this.logger.debug('MeshCentral', {
						command,
						stderr,
					});
				}

			} catch (error) {
				if (this.continueOnFail()) {
					returnItems.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: itemIndex,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return this.prepareOutputData(returnItems);
	}
}