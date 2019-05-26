/*
	Automatically configure microservice in AWS
	Copyright (C) 2019 Warren Parad

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
const cloudFormationExecutionContext = require('./cloudFormationExecutionContext');

const awsArchitectCustomResourceNamePrefix = 'AwsArchitectResource::';
const macroFunctionName = 'AwsArchitectMacroFunction';

const getAcmCertificateArn = require('./getAcmCertificateArn');
const createRoute53DnsValidationRecord = require('./createRoute53DnsValidationRecord');

// http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-function-code.html
module.exports.handler = async function(event, context) {
  console.log('Starting Transform: ', JSON.stringify({ event, context }, null, 0));
  // Handle template parsing to create necessary resources
  const handlerMap = {
    VirtualCertificate: getAcmCertificateArn,
    Route53DnsValidationRecord: createRoute53DnsValidationRecord
  };

  if (event.fragment) {
    try {
      const templateFragment = event.fragment;
      for (const resourceName of Object.keys(templateFragment.Resources || {})) {
        const resource = templateFragment.Resources[resourceName];
        if (!resource.Type.startsWith(awsArchitectCustomResourceNamePrefix)) {
          continue;
        }

        const functionName = resource.Type.slice(awsArchitectCustomResourceNamePrefix.length);
        const handler = handlerMap[functionName];
        if (!handler) {
          throw Error('AwsArchitectResourceTypeDoesNotExist');
        }

        const calloutResource = {
          Type: 'Custom::AwsArchitectFunction',
          Properties: {
            ServiceToken: `arn:aws:lambda:${event.region}:${event.accountId}:function:${macroFunctionName}`,
            Function: functionName,
            Properties: resource.Properties || {}
          }
        };

        handler.getResources(templateFragment.Resources, calloutResource, resourceName);
      }

      console.log('AWS Architect Macro transfor success', templateFragment);
      return {
        requestId: event.requestId,
        status: 'success',
        fragment: templateFragment
      };
    } catch (error) {
      console.log('AWS Architect Macro transfor failure error', JSON.stringify(error, null, 0));
      return {
        requestId: event.requestId,
        status: 'failure',
        fragment: {}
      };
    }
  }

  // Handle rf resource execution
  cloudFormationExecutionContext.event = event;
  cloudFormationExecutionContext.context = context;
  const properties = event.ResourceProperties.Properties;

  const handler = handlerMap[event.ResourceProperties.Function];
  if (!handler) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'Handler does not exist for function', function: event.ResourceProperties.Function });
    return {};
  }
  await handler.handler(event.RequestType, properties);
  return {};
};
