import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MeshcentralApi implements ICredentialType {
	name = 'meshcentralApi';
	displayName = 'MeshCentral API';
	properties: INodeProperties[] = [
		{
			displayName: 'URL',
			name: 'url',
			required: true,
			type: 'string',
			default: '',
			placeholder: 'wss://mymcserver.com',
		},
		{
			displayName: 'Port',
			name: 'port',
			required: true,
			type: 'number',
			default: 443,
		},
		{
			displayName: '(Login Token) Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: '(Login Token) Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'Proxy',
			name: 'proxy',
			required: false,
			type: 'string',
			default: '',
			placeholder: 'http://proxy:123',
		},
		{
			displayName: 'It is recommended to create a new user, with only the required permissions, to use with meshctrl. 2FA is not supported; use your n8n\'s server IP in your "skip2factor" config key. Login Token Keys are not supported. Login Key Files are also not supported; just create multiple credentials.',
			name: 'notice',
			type: 'notice',
			default: '',
		},
	];
}