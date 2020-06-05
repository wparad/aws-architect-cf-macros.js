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

module.exports.getResources = function(resources, calloutResource, resourceName) {
  const calloutResourceReferenceName = `Route53ValidationFor${resourceName}`;

  resources[calloutResourceReferenceName] = {
    Type: calloutResource.Type,
    Properties: {
      ServiceToken: calloutResource.Properties.ServiceToken,
      Function: calloutResource.Properties.Function,
      Properties: {
        CertificateName: resources[resourceName].Properties.CertificateName
      }
    }
  };

  // Remove CertificateName from the real resource that will be published, because CertificateName does not really exist
  delete resources[resourceName].Properties.CertificateName;

  // These already exist in verification list.
  const skipWildcardMaps = {};
  [calloutResource.Properties.DomainName].concat(calloutResource.Properties.SubjectAlternativeNames || []).filter(d => d[0] !== '*').forEach(n => {
    skipWildcardMaps[n] = true;
  });
  [calloutResource.Properties.DomainName].concat(calloutResource.Properties.SubjectAlternativeNames || []).filter(d => d[0] !== '*' || !skipWildcardMaps[d.replace(/^(\*\.)/, '')]).map((_, index) => {
    const append = index === 0 ? '' : `${index + 1}`;
    const subAltResourceName = index === 0 ? resourceName : `${resourceName}-Alt${append}`;
    resources[subAltResourceName] = {
      Type: 'AWS::Route53::RecordSet',
      Properties: {
        ...resources[resourceName].Properties,
        Name: { 'Fn::GetAtt': [calloutResourceReferenceName, `VerificationRecordName${append}`] },
        ResourceRecords: [{ 'Fn::GetAtt': [calloutResourceReferenceName, `VerificationRecordValue${append}`] }]
      }
    };

    delete resources[subAltResourceName].Properties.Properties;
  });

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

  const acmClient = new ACM();
  try {
    // we need to try finding the pending certificate, but we don't know when it's available
    // so we try immediately, and then wait for 10 seconds until we find it, for a maximum
    // of 10 tries.
    let numberOfTry = 0;
    let certificatesResult;
    while (numberOfTry++ < 10) {
      // list all certificates that are still in a pending state
      // and filter by those that match the certificate name
      certificatesResult = await acmClient.listCertificates({ CertificateStatuses: ['PENDING_VALIDATION'] }).promise();
      const certificate = certificatesResult.CertificateSummaryList.find(c => c.DomainName === certificateName);

      // wait 10 seconds until we try again to retrieve the newly created certificate
      if (!certificate) {
        console.log({ title: 'No certificate found. Trying again in 10 seconds.', numberOfTry });
        await new Promise(resolve => setTimeout(resolve, 1000 * 10));
        continue;
      }

      // retrieve the certificate details, which includes the domain validation details
      const validationData = await acmClient.describeCertificate({ CertificateArn: certificate.CertificateArn }).promise();
      console.log(JSON.stringify({ title: 'validation data', validationData }));

      // return the validation options, which can be used as input to the generated Route53 entry
      // those might not be available immediately, so we need to check for those, and otherwise
      // try again in 10 seconds
      if (validationData.Certificate
      && validationData.Certificate.DomainValidationOptions
      && validationData.Certificate.DomainValidationOptions.length > 0
      && validationData.Certificate.DomainValidationOptions[0].ResourceRecord) {
        const result = {};

        validationData.Certificate.DomainValidationOptions
          .filter(o => o.ResourceRecord && o.ValidationStatus === 'PENDING_VALIDATION' && o.ValidationMethod === 'DNS')
          .forEach((o, index) => {
            const append = index === 0 ? '' : `${index + 1}`;
            result[`VerificationRecordName${append}`] = o.ResourceRecord.Name;
            result[`VerificationRecordValue${append}`] = o.ResourceRecord.Value;
          });

        await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.SUCCESS, result);
        return;
      }

      console.log({ title: 'Certificate found, but validation option not yet available. Trying again in 10 seconds.', numberOfTry });
      await new Promise(resolve => setTimeout(resolve, 1000 * 10));
    }

    // all the retires did not work; report a generic error
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: `Certificate with CertificateName ${certificateName} not found.`, certificatesResult });
  } catch (error) {
    await cloudFormationExecutionContext.completeRequest(cloudFormationExecutionContext.statuses.FAILED, { title: 'Failed to get Certificate data', error });
  }
};
