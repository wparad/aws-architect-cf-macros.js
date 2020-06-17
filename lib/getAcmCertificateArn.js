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
  resources[resourceName] = calloutResource;
  return resources;
};

module.exports.handler = async function(requestType, properties) {
  const region = properties.Region;
  const domainName = properties.DomainName;
  if (!region || !domainName) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'Region and DomainName are required' });
    return;
  }
  const acmClient = new ACM({ region });

  let certs = [];
  try {
    certs = await acmClient.listCertificates({}).promise();
  } catch (error) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'Failed to get Certificate', error: error.message || error.toString() || error });
  }
  let foundCert = certs.CertificateSummaryList.find(cert => cert.DomainName === domainName);
  const certArn = foundCert ? foundCert.CertificateArn : null;
  if (!certArn && requestType !== 'Delete') {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'No certificate exists' });
  } else {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.SUCCESS, { CertificateArn: certArn });
  }
};
