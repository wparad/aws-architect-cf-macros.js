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
  resources[resourceName].Properties.ResourceRecords = [{ 'Fn::GetAtt': [calloutResourceReferenceName, 'VerificationRecordValue'] }];

  // This is a custom property that doesn't exist in AWS otherwise
  delete resources[resourceName].Properties.CertificateName;

  return resources;
};

module.exports.handler = async function(mode, properties) {
  const certificateName = properties.CertificateName;
  if (!certificateName) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'CertificateName is required' });
    return;
  }

  if (mode !== 'Create') {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.SUCCESS);
    return;
  }

  // We have to wait here because the certificate will first need to be requested
  // rather be sure that this happens and wait extra long instead of failing the CF template creation
  await new Promise(resolve => setTimeout(resolve, 60000));

  const acmClient = new ACM();
  try {
    const certificatesResult = await acmClient.listCertificates({ CertificateStatuses: ['PENDING_VALIDATION'] }).promise();
    const certificate = certificatesResult.CertificateSummaryList.find(c => c.DomainName === certificateName);
    if (!certificate) {
      await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: `Certificate with CertificateName ${certificateName} not found.`, certificatesResult });
      return;
    }
    const validationData = await acmClient.describeCertificate({ CertificateArn: certificate.CertificateArn }).promise();
    console.log(JSON.stringify({ title: 'validation data', validationData }));
    const result = {
      VerificationRecordName: validationData.Certificate.DomainValidationOptions[0].ResourceRecord.Name,
      VerificationRecordValue: validationData.Certificate.DomainValidationOptions[0].ResourceRecord.Value
    };
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.SUCCESS, result);
  } catch (error) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'Failed to get Certificate data', error });
  }
};
