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
const { ACM } = require('aws-sdk');
const cloudFormationExecutionContext = require('./cloudFormationExecutionContext');

// http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-function-code.html
module.exports.getResources = function(resources, calloutResource, resourceName) {
  const calloutResourceReferenceName = `Route53ValidationFor${resourceName}`;
  const clonedObject = Object.assign({}, calloutResource);
  clonedObject.Properties = Object.assign({}, calloutResource.Properties);
  resources[calloutResourceReferenceName] = clonedObject;

  resources[resourceName].Type = 'AWS::Route53::RecordSet';
  resources[resourceName].Properties.Name = { 'Fn::GetAtt': [calloutResourceReferenceName, 'VerificationRecordName'] };
  resources[resourceName].Properties.ResourceRecords = { 'Fn::GetAtt': [calloutResourceReferenceName, 'VerificationRecordValue'] };

  // This is a custom property that doesn't exist in AWS otherwise
  delete resources[resourceName].Properties.CertificateArn;

  return resources;
};

module.exports.handler = async function(mode, properties) {
  const certificateArn = properties.CertificateArn;
  if (!certificateArn) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'CertificateArn is required' });
    return;
  }

  if (mode !== 'Create') {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.SUCCESS);
    return;
  }

  // We have to wait here because verification will happen multiple times and it also can take quite a while. Rather than risk a DNS lookup failure, just wait before trying to get the new cert
  await new Promise(resolve => setTimeout(resolve, 20000));

  const acmClient = new ACM();
  try {
    const validationData = await acmClient.describeCertificate({ CertificateArn: certificateArn }).promise();
    const result = {
      VerificationRecordName: validationData.Certificate.DomainValidationOptions[0].ResourceRecord.Name,
      VerificationRecordValue: validationData.Certificate.DomainValidationOptions[0].ResourceRecord.Value
    };
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.SUCCESS, result);
  } catch (error) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'Failed to get Certificate data', error });
  }
};
